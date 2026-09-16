"use client";

import { useRef, useState } from "react";
import type { InviteValues } from "@/lib/messages/invite";
import type { CourseInviteLink } from "@/lib/messages/course-invite-links";

/** Queue saves so a slow earlier request cannot overwrite a newer edit. */
export function useRosterInvites(jobId: string, defaults: Record<string, InviteValues>) {
  const [optionInvites, setOptionInvites] = useState(defaults);
  const [links, setLinks] = useState<CourseInviteLink[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const saved = useRef<Record<string, InviteValues>>({});
  const current = useRef(defaults);
  const ready = useRef(false);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const endpoint = `/api/jobs/${jobId}/invite-settings`;

  async function load() {
    ready.current = false;
    setLoading(true); setLoaded(false); setError(""); setStatus("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      saved.current = body.optionInvites;
      current.current = { ...defaults, ...body.optionInvites };
      setOptionInvites(current.current);
      setLinks(body.links ?? []);
      setCourseId(body.courseId ?? null);
      ready.current = true;
      setLoaded(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "입장정보를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }

  function update(key: string, field: keyof InviteValues, value: string) {
    current.current = { ...current.current, [key]: {
      entryCode: current.current[key]?.entryCode ?? "", linkName: current.current[key]?.linkName ?? "", [field]: value,
    } };
    setOptionInvites(current.current); setStatus("");
  }

  function save() {
    if (!ready.current) return Promise.resolve(false);
    const snapshot = current.current;
    const pending = queue.current.then(async () => {
      const invites = Object.entries(snapshot).filter(([key, value]) =>
        value.entryCode !== saved.current[key]?.entryCode || value.linkName !== saved.current[key]?.linkName,
      ).map(([optionName, values]) => ({ optionName, ...values }));
      if (!invites.length) return true;
      setSaving(true); setError("");
      try {
        const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invites }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        saved.current = snapshot;
        setStatus("입장정보가 이 명단에 저장되었습니다.");
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "입장정보 저장 실패");
        return false;
      } finally { setSaving(false); }
    });
    queue.current = pending;
    return pending;
  }

  return { optionInvites, links, courseId, loading, loaded, saving, status, error, load, update, save };
}
