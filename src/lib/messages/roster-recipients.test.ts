import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLinkedStudent, rosterRecipient } from "@/lib/jobs/linked-student";
import { filterGroupChatNonParticipants, filterRosterRows } from "@/lib/jobs/filter";
import { buildTargetContactCsv } from "@/lib/jobs/target-csv";
import { EMPTY_ROSTER_FILTERS, type RosterRow } from "@/lib/jobs/types";
import { resolveRosterMessageTargets } from "./roster-recipients";
import { loadRosterMessageContacts } from "./recipient-source-server";
import { selectCombinedRosterMessageTargets } from "@/lib/course-operations/combined-roster";

const payer: RosterRow = {
  id: "payer-1", sourceRowNumber: 2, normalizedPhone: "01011112222", isDuplicate: false,
  groupChatJoined: false, isExtraParticipant: false, isManuallyAdded: false, memo: "",
  values: {courseName:"강의",optionName:"기본반",customerName:"결제자",phone:"01011112222",email:"payer@example.test",source:"",referrer:"",adMedia:""},
};
const linked = (id: string, phone = "01033334444"): RosterRow => ({...payer,id,values:{...payer.values,hasDifferentStudent:true,studentName:"실제학생",studentPhone:phone}});

test("연결된 실제 수강생을 필수 검증하고 해제하면 연결 정보를 비운다", () => {
  assert.deepEqual(parseLinkedStudent({hasDifferentStudent:true,studentName:" 실제학생 ",studentPhone:"+82 10 3333 4444"}),{hasDifferentStudent:true,studentName:"실제학생",studentPhone:"01033334444"});
  for (const values of [
    {hasDifferentStudent:"true"}, {hasDifferentStudent:true,studentName:"",studentPhone:"01033334444"},
    {hasDifferentStudent:true,studentName:"학생",studentPhone:"010"}, {hasDifferentStudent:true,studentName:"학생",studentPhone:"02-333-4444"},
  ]) assert.throws(() => parseLinkedStudent(values));
  const cleared = parseLinkedStudent({hasDifferentStudent:false,studentName:"이전학생",studentPhone:"01033334444"});
  assert.deepEqual(cleared,{hasDifferentStudent:false,studentName:"",studentPhone:""});
  assert.deepEqual(rosterRecipient({...payer,values:{...payer.values,...cleared}}),{name:"결제자",phone:"01011112222"});
});

test("같은 결제자가 다른 수강생을 연결한 주문은 모두 발송 대상으로 유지한다", () => {
  const rows = [linked("first"),linked("second","01055556666")];
  const targets = resolveRosterMessageTargets(rows);
  assert.deepEqual(targets.map((row) => row.normalizedPhone),["01033334444","01055556666"]);
  assert.ok(targets.every((row) => row.values.customerName === "실제학생" && row.values.email === ""));
  assert.equal(rows[0].values.customerName,"결제자");
  assert.equal(rows[0].normalizedPhone,"01011112222");
});

test("알림톡의 필터·미참여자 선택 후 실제 수강생 전화번호로 중복을 제거한다", () => {
  const rows = [linked("first"),linked("same-student"),{...linked("joined","01055556666"),groupChatJoined:true},payer];
  const filtered = filterRosterRows(rows,{...EMPTY_ROSTER_FILTERS,keyword:"결제자"});
  const targets = resolveRosterMessageTargets(filterGroupChatNonParticipants(filtered,true));
  assert.deepEqual(targets.map((row) => row.normalizedPhone),["01033334444","01011112222"]);
  assert.equal(filterRosterRows(rows,{...EMPTY_ROSTER_FILTERS,keyword:"실제학생"}).length,3);
  const combined = selectCombinedRosterMessageTargets(rows,["first","same-student","joined"],true);
  assert.deepEqual(combined.map((row) => row.normalizedPhone),["01033334444"]);
  const csv = buildTargetContactCsv([linked("first")]);
  assert.ok(csv.includes("실제학생") && csv.includes("010-3333-4444"));
  assert.ok(!csv.includes("결제자") && !csv.includes("010-1111-2222"));
});

function source(rows: RosterRow[]) {
  return {from: () => {
    const query = {select:()=>query,eq:()=>query,order:()=>query,range:async()=>({error:null,data:rows.map((row) => ({id:row.id,source_row_number:row.sourceRowNumber,normalized_phone:row.normalizedPhone,normalized_values:row.values,is_duplicate:false,is_extra_participant:false}))})};
    return query;
  }} as unknown as SupabaseClient;
}

test("일반 메시지의 서버 대상 조회는 연결된 수강생만 반환하고 불완전한 연결은 거부한다", async () => {
  const contacts = await loadRosterMessageContacts(source([linked("first"),linked("same"),payer]),"job",1,["first","same"]);
  assert.deepEqual(contacts,[{id:"first",name:"실제학생",email:"",normalized_phone:"01033334444"}]);
  const invalid = linked("invalid","");
  assert.equal(rosterRecipient(invalid).phone,"");
  assert.equal(resolveRosterMessageTargets([invalid])[0].normalizedPhone,"");
  await assert.rejects(loadRosterMessageContacts(source([invalid]),"job",1),/실제 수강생/);
});
