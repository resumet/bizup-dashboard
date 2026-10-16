"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Maximize2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaNotification, NotificationPage } from "@/lib/notifications/types";

type FeedVariant = "unread" | "read";
type NotificationFeedVariant = "popover" | "page";
const emptyPage: NotificationPage = { items: [], hasMore: false, nextCursor: null, unreadCount: 0 };
const labels = { instagram: "인스타그램", youtube_brief: "유튜브 요청기획서", youtube_schedule: "유튜브 촬영 일정" };
const dateFormat = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });

export async function notificationRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "알림을 불러오지 못했습니다.");
  return body;
}

export function NotificationFeed({ variant, onUnreadCount, onClose }: { variant: NotificationFeedVariant; onUnreadCount?: (count: number) => void; onClose?: () => void }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [pages, setPages] = useState({ unread: emptyPage, read: emptyPage });
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState<FeedVariant | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mutating = useRef(false);
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const unreadCallback = useRef(onUnreadCount);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => { unreadCallback.current = onUnreadCount; }, [onUnreadCount]);

  const updateCount = useCallback((value: number) => {
    setCount(value);
    unreadCallback.current?.(value);
  }, []);

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const version = ++generation.current;
    setLoading(true); setError(""); setMore(null);
    try {
      const [unread, read] = await Promise.all([
        notificationRequest<NotificationPage>("/api/notifications?section=unread"),
        notificationRequest<NotificationPage>("/api/notifications?section=read"),
      ]);
      if (version === generation.current) {
        setPages({ unread, read });
        updateCount(unread.unreadCount);
      }
    } catch (caught) {
      if (version === generation.current) setError(caught instanceof Error ? caught.message : "알림을 불러오지 못했습니다.");
    } finally { if (version === generation.current) setLoading(false); }
  }, [updateCount]);

  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refresh(); };
    update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const broadcast = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("media-notifications");
    channel.current = broadcast;
    if (broadcast) broadcast.onmessage = update;
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      broadcast?.close();
      channel.current = null;
      invalidate();
    };
  }, [refresh, invalidate]);

  const loadMore = useCallback(async (section: FeedVariant) => {
    const cursor = pages[section].nextCursor;
    if (!cursor || more || loading || saving) return;
    const version = generation.current;
    setMore(section); setError("");
    try {
      const page = await notificationRequest<NotificationPage>(`/api/notifications?section=${section}&before=${cursor}`);
      if (version === generation.current) {
        setPages(current => ({ ...current, [section]: { ...page, items: [...current[section].items, ...page.items.filter(item => !current[section].items.some(existing => existing.id === item.id))] } }));
        updateCount(page.unreadCount);
      }
    } catch (caught) { if (version === generation.current) setError(caught instanceof Error ? caught.message : "알림을 불러오지 못했습니다."); }
    finally { if (version === generation.current) setMore(null); }
  }, [pages, more, loading, saving, updateCount]);

  const handleRead = useCallback(async (item: MediaNotification, navigate: boolean) => {
    if (mutating.current) return;
    mutating.current = true;
    setSaving(item.id); setError("");
    ++generation.current; setLoading(false); setMore(null);
    try {
      if (!item.readAt) {
        const { readAt } = await notificationRequest<{ readAt: string }>("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
        setPages(current => ({
          unread: { ...current.unread, items: current.unread.items.filter(row => row.id !== item.id) },
          read: { ...current.read, items: [{ ...item, readAt }, ...current.read.items.filter(row => row.id !== item.id)].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1) },
        }));
        setCount(value => {
          const next = Math.max(0, value - 1);
          unreadCallback.current?.(next);
          return next;
        });
        channel.current?.postMessage("read");
      }
      if (navigate) { onClose?.(); router.push(item.href); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "읽음 상태를 저장하지 못했습니다."); }
    finally { mutating.current = false; setSaving(null); }
  }, [onClose, router]);

  const header = <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${variant === "page" ? "pb-4" : "px-4 py-3"}`}>
    {variant === "page" ? <h1 className="text-2xl font-semibold">알림</h1> : <h2 className="font-semibold">알림</h2>}
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="sm" disabled={loading || !!saving} onClick={() => void refresh()}><RefreshCw className={loading ? "animate-spin" : ""} />갱신</Button>
      {variant === "popover" && <Button type="button" variant="ghost" size="sm" onClick={() => { onClose?.(); router.push("/services/notifications"); }}><Maximize2 />크게 보기</Button>}
      {variant === "popover" && <Button type="button" variant="ghost" size="icon-sm" aria-label="알림 닫기" onClick={onClose}><X /></Button>}
    </div>
  </div>;

  const body = <>
    {error && <div role="alert" className="flex items-center gap-2 border-b p-3 text-sm text-destructive"><span className="flex-1">{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}>재시도</Button></div>}
    <div className={variant === "popover" ? "max-h-[min(640px,calc(100dvh-150px))] overflow-y-auto overscroll-contain" : "overflow-hidden rounded-xl border"}>
      {loading && !pages.unread.items.length && !pages.read.items.length ? <div role="status" className="flex justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />불러오는 중</div> : (["unread", "read"] as const).map(section => <NotificationSection key={section} section={section} page={pages[section]} count={count} saving={saving} loading={loading} more={more} onRead={handleRead} onMore={loadMore} />)}
    </div>
  </>;

  return variant === "page"
    ? <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">{header}{body}</main>
    : <>{header}{body}</>;
}

function NotificationSection({section,page,count,saving,loading,more,onRead,onMore}:{section:FeedVariant;page:NotificationPage;count:number;saving:string|null;loading:boolean;more:FeedVariant|null;onRead:(item:MediaNotification,navigate:boolean)=>Promise<void>;onMore:(section:FeedVariant)=>Promise<void>}) {
  return <section aria-label={section === "unread" ? "읽지 않은 알림" : "읽은 알림"} className="border-b last:border-0">
    <h3 className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">{section === "unread" ? `읽지 않음 (${count})` : "읽음"}</h3>
    {!page.items.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{section === "unread" ? "읽지 않은 알림이 없습니다." : "읽은 알림이 없습니다."}</p>}
    <ul className="divide-y">{page.items.map(item => <li key={item.id} className={section === "unread" ? "bg-blue-50/40 dark:bg-blue-950/15" : ""}>
      <button type="button" className="block w-full space-y-2 px-4 pt-3 pb-2 text-left hover:bg-muted/50 disabled:opacity-60" disabled={!!saving} onClick={() => void onRead(item, true)}>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">{!item.readAt && <span className="size-1.5 rounded-full bg-blue-600" />}{labels[item.kind]}<time className="ml-auto" dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time></span>
        <span className="block text-sm font-medium break-words">{item.title}</span>
        <span className="block text-sm leading-6 whitespace-pre-wrap break-words text-muted-foreground">{item.message}</span>
      </button>
      {!item.readAt && <div className="flex justify-end px-3 pb-2"><Button type="button" variant="ghost" size="xs" disabled={!!saving} onClick={() => void onRead(item, false)}>{saving === item.id ? <Loader2 className="animate-spin" /> : <Check />}읽음 처리</Button></div>}
    </li>)}</ul>
    {page.hasMore && <div className="p-2 text-center"><Button variant="ghost" size="sm" disabled={!!more || loading || !!saving} onClick={() => void onMore(section)}>{more === section ? "불러오는 중…" : "더 보기"}</Button></div>}
  </section>;
}
