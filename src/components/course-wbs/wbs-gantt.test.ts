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

test("주 초와 주말의 웨비나 D-Day 배지는 해당 주 칸 안에 표시한다", () => {
  const cases = [
    { webinarDate: "2026-09-28", weekStart: "9. 28." },
    { webinarDate: "2026-10-04", weekStart: "9. 28." },
    { webinarDate: "2026-10-13", weekStart: "10. 12." }, // 저장된 미닝 WBS
  ];

  for (const { webinarDate, weekStart } of cases) {
    const html = renderToStaticMarkup(createElement(WbsGantt, {
      webinarDate,
      items: [
        { id: "preparation", title: "준비", owner: "", startDate: "2026-09-21", dueDate: "2026-09-21", completed: false, position: 0 },
        { id: "course-free-webinar", title: "무료웨비나", owner: "", startDate: webinarDate, dueDate: webinarDate, completed: false, position: 1 },
      ],
    }));
    const weeks = [...html.matchAll(/<div class="relative flex shrink-0[^>]*style="width:112px">([\s\S]*?)<\/div>/gu)]
      .map((match) => match[1]);
    const webinarWeek = weeks.find((week) => week.includes("웨비나 D-Day"));

    assert.ok(webinarWeek, `${webinarDate}: D-Day 배지가 표시되어야 한다`);
    assert.ok(webinarWeek.includes(`<span>${weekStart} 주</span>`), `${webinarDate}: ${weekStart} 주에 표시되어야 한다`);
    assert.match(webinarWeek, /absolute inset-x-2 bottom-1/u, "배지는 해당 주 칸 안에 있어야 한다");
    assert.match(webinarWeek, /주 시작 D-/u, "주 상대일은 월요일 기준임을 명시해야 한다");
    assert.equal(weeks.filter((week) => week.includes("웨비나 D-Day")).length, 1);
  }
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
