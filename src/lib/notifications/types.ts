export type MediaNotification = {
  id: string;
  kind: "instagram" | "youtube_brief" | "youtube_schedule";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt: string | null;
};
export type NotificationPage = { items: MediaNotification[]; hasMore: boolean; nextCursor: string | null; unreadCount: number };
