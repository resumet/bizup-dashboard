import assert from "node:assert/strict";
import test from "node:test";
import { applyCardText } from "./card-text";
import { newDraft } from "./model";

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
  assert.deepEqual(result.cards.map(card => card.interestFree), [12,12,12,12,12,12,5,12,5,5,5,3]);
  assert.equal(result.cards.find(card => card.issuer === "현대")?.installment, 24);
  assert.ok(cards.every(card => card.interestFree === 0));
});

test("무이자와 최대 할부를 별도 적용하고 불명확하거나 잘못된 값은 보존한다", () => {
  const cards = newDraft("", "", "").cards;
  const result = applyCardText("신한카드 무이자 2~6개월 / 최대 할부 18개월\n현대 부분 무이자 24개월\n전북 무이자 121개월", cards);
  assert.deepEqual(result.cards[0], { issuer: "신한", interestFree: 6, installment: 18 });
  assert.deepEqual(result.cards[1], cards[1]);
  assert.deepEqual(result.cards.at(-1), cards.at(-1));
  assert.deepEqual(applyCardText("신한 무이자 24개월 / 할부 12개월", cards).rejected, ["신한"]);
  assert.deepEqual(applyCardText("알 수 없는 문구", cards).cards, cards);
});
