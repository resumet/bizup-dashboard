export type SupplyApprovalStatus = "pending" | "approved" | "rejected";

export type SupplyRequest = {
  id: string;
  requesterId: string | null;
  requesterName: string;
  itemName: string;
  priceKrw: number;
  purpose: string;
  note: string;
  approvalStatus: SupplyApprovalStatus;
  reviewedAt: string | null;
  purchased: boolean;
  purchasedAt: string | null;
  version: number;
  requestedAt: string;
  updatedAt: string;
};

export type SupplyRequestCommand =
  | {
      action: "approval";
      status: SupplyApprovalStatus;
      version: number;
    }
  | {
      action: "purchase";
      purchased: boolean;
      version: number;
    };
