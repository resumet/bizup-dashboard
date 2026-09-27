import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WbsGantt } from "./wbs-gantt";

test("간트 차트는 멀리 떨어진 날짜가 있어도 제한된 기간만 그린다", () => {
  const html = renderToStaticMarkup(createElement(WbsGantt, {
    items: [
      { id: "now", title: "현재 업무", owner: "", startDate: "2026-09-27", dueDate: "2026-10-02", completed: false, position: 0 },
      { id: "future", title: "먼 미래 업무", owner: "", startDate: "9999-12-01", dueDate: "9999-12-31", completed: false, position: 1 },
    ],
  }));

  assert.match(html, /표시 기간 밖 1개/u);
  assert.ok(html.length < 25_000, `예상보다 큰 간트 출력: ${html.length}자`);
});
