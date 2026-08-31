import assert from "node:assert/strict";
import test from "node:test";

import { AD_STRATEGIES } from "./types";
import { getPsychologyCandidates } from "./psychology";

test("각 홍보 전략에 PDF 제목·본문에 적용할 심리 기법을 제공한다", () => {
  for (const strategy of AD_STRATEGIES) {
    const candidates = getPsychologyCandidates(strategy);
    assert.ok(candidates.length >= 6);
    assert.equal(new Set(candidates.map((item) => item.code)).size, candidates.length);
    assert.ok(candidates.every((item) => /^\d{3}$/u.test(item.code)));
  }
});

test("허위 희소성·강압·보장 표현은 선별 후보에 포함하지 않는다", () => {
  const names = AD_STRATEGIES.flatMap(getPsychologyCandidates).map((item) => item.name).join(" ");
  assert.doesNotMatch(names, /허위 희소성|강압|성과 보장/u);
});
