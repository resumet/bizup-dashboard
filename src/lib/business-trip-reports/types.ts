export type BusinessTripReport = {
  id: string;
  authorId: string | null;
  authorName: string;
  title: string;
  finalCost: number;
  paymentCompleted: boolean;
  paymentCompletedAt: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};

export type BusinessTripDashboardSummary = {
  unpaidCount: number;
  unpaidCost: number;
};
