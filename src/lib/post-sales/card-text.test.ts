import assert from "node:assert/strict";
import test from "node:test";
import { applyCardText } from "./card-text";
import { draftSchema, newDraft, salesSnapshot } from "./model";

test("결제창의 카드사별 개월 목록과 별칭을 읽고 유의사항은 제외한다", () => {
  const text = `신한
2,3,4,5,6,7,8,9,10,11,12개월

하나
2,3,4,5,6,7,8,9,10,11,12개월

우리
2,3,4,5개월

KB국민(KB pay)
2,3,4,5,6,7,8,9,10,11,12개월

비씨(페이북)
2,3,4,5개월

농협(NH페이)
2,3,4,5,6,7,8,9,10,11,12개월

수협
2,3,4,5개월

광주
2,3,4,5개월

전북
2,3개월

현대
2,3,4,5,6,7,8,9,10,11,12개월

롯데
2,3,4,5,6,7,8,9,10,11,12개월

삼성
2,3,4,5,6,7,8,9,10,11,12개월
유의사항
국민BC, 신한BC, 하나BC는 BC카드 정책에 해당됩니다.
무이자 2개월`;
  const cards = newDraft("", "", "").cards.map(card => ({ ...card, interestFree: 0 }));
  const result = applyCardText(text, cards);
  assert.equal(result.applied.length, 12);
  assert.deepEqual(result.cards.map(card => card.interestFree), [12,12,5,12,5,12,5,5,3,12,12,12]);
  assert.equal(result.cards[3].issuer, "KB국민(KB pay)");
  assert.equal(result.cards[4].issuer, "비씨(페이북)");
  assert.equal(result.cards[5].issuer, "농협(NH페이)");
  assert.match(result.notice, /유의사항\n국민BC/);
  const draft = draftSchema.parse({ ...newDraft("", "", ""), cards: result.cards, cardText: text, cardNotice: result.notice });
  const snapshot = salesSnapshot(draft, { name: "", instructor_name: "", payment_link: "" }, []);
  assert.equal(snapshot.cards[4].issuer, "비씨(페이북)");
  assert.equal(snapshot.cardNotice, result.notice);
  assert.ok(cards.every(card => card.interestFree === 0));
});

test("입력된 카드만 원래 순서와 이름으로 표시하고 최대 할부는 저장하지 않는다", () => {
  const cards = newDraft("", "", "").cards;
  const result = applyCardText("신한카드 무이자 2~6개월 / 최대 할부 18개월\n현대 부분 무이자 24개월\n전북 무이자 121개월", cards);
  assert.deepEqual(result.cards, [{ issuer: "신한카드", interestFree: 6 }]);
  assert.deepEqual(applyCardText("신한 무이자 24개월 / 할부 12개월", cards).cards, [{ issuer: "신한", interestFree: 24 }]);
  assert.deepEqual(applyCardText("알 수 없는 문구", cards).cards, []);
  assert.deepEqual(applyCardText("", cards).cards, cards);
  const legacy = draftSchema.parse({ ...newDraft("", "", ""), cardText: undefined, cardNotice: undefined, cards: cards.map(card => ({ ...card, installment: 24 })) });
  assert.equal(legacy.cardNotice, "");
  assert.equal("installment" in legacy.cards[0], false);
});
