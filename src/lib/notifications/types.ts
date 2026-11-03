export type MediaNotification = {
  id: string;
  kind: "youtube_brief" | "youtube_schedule" | "leave_request" | "calendar_event" | "youtube_channel" | "external_ad_performance" | "supply_request";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt: string | null;
};
export type NotificationPage = { items: MediaNotification[]; hasMore: boolean; nextCursor: string | null; unreadCount: number };
