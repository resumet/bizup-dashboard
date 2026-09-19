"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Task = { id: string; title: string; description: string; planned_date: string; status: string; assignee_id: string; creator_id: string };
export function HrTaskBoard({ initialTasks, workspaceId }: { initialTasks: Task[]; userId: string; workspaceId: string }) {
  const [tasks, setTasks] = useState(initialTasks); const [title, setTitle] = useState("");
  async function create() { if (!title.trim()) return; const r = await fetch("/api/hr/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, title }) }); if (r.ok) { setTasks([await r.json(), ...tasks]); setTitle(""); } }
  async function complete(task: Task) { const status = task.status === "done" ? "open" : "done"; const r = await fetch(`/api/hr/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (r.ok) setTasks(tasks.map((item) => item.id === task.id ? { ...item, status } : item)); }
  return <div className="mx-auto max-w-3xl space-y-6 px-5 py-10"><h1 className="text-3xl font-semibold">오늘의 업무</h1><div className="flex gap-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="업무를 입력하세요" /><Button onClick={() => void create()}>업무 추가</Button></div><div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex items-center justify-between rounded-lg border p-4"><span className={task.status === "done" ? "text-muted-foreground line-through" : ""}>{task.title}</span><Button variant="outline" size="sm" onClick={() => void complete(task)}>{task.status === "done" ? "완료 취소" : "완료"}</Button></div>)}</div></div>;
}
