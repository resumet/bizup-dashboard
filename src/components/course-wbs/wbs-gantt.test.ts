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

test("간트의 업무 일정과 주 눈금을 무료 웨비나 기준일로 표시한다", () => {
  const html = renderToStaticMarkup(createElement(WbsGantt, {
    webinarDate: "2026-10-01",
    items: [
      { id: "before", title: "사전 준비", owner: "김담당", startDate: "2026-09-29", dueDate: "2026-09-30", completed: false, position: 0 },
      { id: "course-free-webinar", title: "무료웨비나", owner: "", startDate: "2026-10-01", dueDate: "2026-10-01", completed: false, position: 1 },
      { id: "after", title: "사후 정리", owner: "", startDate: "2026-10-02", dueDate: "2026-10-04", completed: false, position: 2 },
    ],
  }));

  assert.match(html, /시작 D-2 · 마감 D-1/u);
  assert.match(html, /시작 D-Day · 마감 D-Day/u);
  assert.match(html, /시작 D\+1 · 마감 D\+3/u);
  assert.match(html, /D-10/u, "첫 주의 웨비나 상대일을 표시해야 한다");
  assert.match(html, /aria-label="무료 웨비나 기준일"[^>]*>웨비나 D-Day/u);
  assert.match(html, /bg-amber-500\/80/u, "웨비나 날짜의 세로 기준선을 표시해야 한다");
});

test("웨비나 날짜가 표시 기간 밖이어도 업무의 상대일은 표시한다", () => {
  const html = renderToStaticMarkup(createElement(WbsGantt, {
    webinarDate: "2027-09-29",
    items: [
      { id: "early", title: "준비 업무", owner: "", startDate: "2026-09-29", dueDate: "2026-09-30", completed: false, position: 0 },
    ],
  }));

  assert.match(html, /시작 D-365 · 마감 D-364/u);
  assert.match(html, /무료 웨비나 .* 기준/u);
  assert.doesNotMatch(html, /aria-label="무료 웨비나 기준일"/u);
});

test("오늘보다 마감일이 지난 업무만 회색 배경으로 표시한다", () => {
  const html = renderToStaticMarkup(createElement(WbsGantt, {
    todayDate: "2026-09-27",
    items: [
      { id: "past", title: "지난 업무", owner: "", startDate: "2026-09-24", dueDate: "2026-09-26", completed: false, position: 0 },
      { id: "today", title: "오늘 업무", owner: "", startDate: "2026-09-27", dueDate: "2026-09-27", completed: false, position: 1 },
    ],
  }));

  function markupBeforeTitle(title: string) {
    const titleIndex = html.indexOf(`title="${title}"`);
    assert.ok(titleIndex >= 0, `${title} 행이 표시되어야 한다`);
    return html.slice(html.lastIndexOf('<div class="flex h-16 border-b', titleIndex), titleIndex);
  }

  assert.match(markupBeforeTitle("지난 업무"), /bg-muted\/50/u);
  assert.doesNotMatch(markupBeforeTitle("오늘 업무"), /bg-muted\/50/u);
});
