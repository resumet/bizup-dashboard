import { instagramUploadSchedule, webinarDeadlineDateKey } from "@/lib/course-documents/instagram-progress";

export type InstagramPreparationMaterial = {
  position: number;
  planningCompleted: boolean;
  filmingCompleted: boolean;
  editingCompleted: boolean;
  uploadCompleted: boolean;
};

export type InstagramPreparationInput = {
  configured: boolean;
  totalContentCount: number;
  materials: InstagramPreparationMaterial[];
  checklistTotalCount: number;
  checklistCompletedCount: number;
};

export type InstagramPreparationSummary = {
  configured: boolean;
  progress: number;
  completedStepCount: number;
  totalStepCount: number;
  totalContentCount: number;
  planningCompletedCount: number;
  filmingCompletedCount: number;
  editingCompletedCount: number;
  uploadCompletedCount: number;
  checklistTotalCount: number;
  checklistCompletedCount: number;
  uploadShortfallCount: number;
  isAtRisk: boolean;
  isComplete: boolean;
};

export function emptyInstagramPreparationInput(): InstagramPreparationInput {
  return {
    configured: false,
    totalContentCount: 0,
    materials: [],
    checklistTotalCount: 0,
    checklistCompletedCount: 0,
  };
}

export function buildInstagramPreparationSummary(
  input: InstagramPreparationInput,
  freeWebinarAt: string | null,
  today: string,
): InstagramPreparationSummary {
  const totalContentCount = Math.max(0, Math.trunc(input.totalContentCount));
  const materials = input.materials.filter((material) => material.position <= totalContentCount);
  const planningCompletedCount = materials.filter((material) => material.planningCompleted).length;
  const filmingCompletedCount = materials.filter((material) => material.filmingCompleted).length;
  const editingCompletedCount = materials.filter((material) => material.editingCompleted).length;
  const uploadCompletedCount = materials.filter((material) => material.uploadCompleted).length;
  const checklistTotalCount = Math.max(0, Math.trunc(input.checklistTotalCount));
  const checklistCompletedCount = Math.min(
    checklistTotalCount,
    Math.max(0, Math.trunc(input.checklistCompletedCount)),
  );
  const totalStepCount = totalContentCount * 4 + checklistTotalCount;
  const completedStepCount = planningCompletedCount
    + filmingCompletedCount
    + editingCompletedCount
    + uploadCompletedCount
    + checklistCompletedCount;
  const progress = input.configured && totalStepCount
    ? Math.round((completedStepCount / totalStepCount) * 100)
    : 0;

  let uploadShortfallCount = 0;
  if (freeWebinarAt && totalContentCount && webinarDeadlineDateKey(freeWebinarAt)) {
    const schedule = instagramUploadSchedule(freeWebinarAt, totalContentCount);
    const remainingScheduledCount = schedule.filter((dateKey) => dateKey >= today).length;
    const requiredUploadCount = Math.max(totalContentCount - remainingScheduledCount, 0);
    uploadShortfallCount = Math.max(requiredUploadCount - uploadCompletedCount, 0);
  }

  return {
    configured: input.configured,
    progress,
    completedStepCount,
    totalStepCount,
    totalContentCount,
    planningCompletedCount,
    filmingCompletedCount,
    editingCompletedCount,
    uploadCompletedCount,
    checklistTotalCount,
    checklistCompletedCount,
    uploadShortfallCount,
    isAtRisk: uploadShortfallCount > 0,
    isComplete: input.configured && totalStepCount > 0 && completedStepCount >= totalStepCount,
  };
}
