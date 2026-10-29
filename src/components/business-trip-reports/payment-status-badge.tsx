import { Badge } from "@/components/ui/badge";

export function BusinessTripPaymentStatusBadge({ completed }: { completed: boolean }) {
  return completed
    ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">지급완료</Badge>
    : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">지급대기</Badge>;
}
