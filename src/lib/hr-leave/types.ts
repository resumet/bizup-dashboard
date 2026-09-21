export type HrLeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type HrLeaveUnit = "full" | "am" | "pm";
export type HrSupportType = "night_webinar" | "weekend_holiday";
export type HrSupportUnit = "half" | "full";

export type HrLeaveRequest = {
  id: string;
  user_id: string;
  leave_date: string;
  unit: HrLeaveUnit;
  days: number;
  reason: string;
  status: HrLeaveStatus;
  review_note: string;
  created_at: string;
};
export type HrSupportRecord = {
  id: string;
  user_id: string;
  support_date: string;
  support_type: HrSupportType;
  unit: HrSupportUnit;
  earned_days: number;
  note: string;
  status: HrLeaveStatus;
  review_note: string;
  created_at: string;
};

export type HrLeavePerson = {
  id: string;
  name: string;
  active: boolean;
  joinedAt: string;
  employmentStartDate: string;
  profileSaved: boolean;
  baseGranted: number;
  extraGranted: number;
  used: number;
  pending: number;
  remaining: number;
};

export type HrLeaveDashboardData = {
  today: string;
  year: number;
  userId: string;
  isAdmin: boolean;
  people: HrLeavePerson[];
  requests: HrLeaveRequest[];
  supportRecords: HrSupportRecord[];
};
