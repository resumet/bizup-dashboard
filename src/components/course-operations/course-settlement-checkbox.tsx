import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { PaymentSummaryPatch } from "@/lib/course-operations/payment-summary-patch";

export type CourseSettlementControls = {
  savingIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  onSave: (courseId: string, patch: PaymentSummaryPatch) => Promise<void>;
};

export function CourseSettlementCheckbox({
  label,
  checked,
  saving,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  saving: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Checkbox
        aria-label={label}
        aria-busy={saving}
        checked={checked}
        disabled={saving}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Badge variant={checked ? "default" : "outline"}>
        {checked ? "완료" : "미정산"}
      </Badge>
    </label>
  );
}
