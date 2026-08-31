export const MESSAGE_RESOURCE_COUNT = 30;

export type MessageStudioProject = {
  id: string;
  workspace_id: string;
  course_id: string | null;
  course_name: string;
  instructor_name: string;
  course_features: string;
  target_audience: string;
  payment_link: string;
  inquiry_link: string;
  curriculum_link: string;
  replay_link: string;
  created_at: string;
  updated_at: string;
};

export type MessageStudioCourseOption = {
  id: string;
  name: string;
  instructor_name: string;
  payment_link: string;
  inquiry_link: string;
  curriculum_link: string;
  free_gift_link: string;
};

export type MessageStudioResource = {
  id: string;
  position: number;
  example_text: string;
  generated_text: string;
  generation_count: number;
  generated_model: string | null;
  generated_at: string | null;
};

export type MessageStudioDraft = Pick<
  MessageStudioProject,
  | "course_name"
  | "instructor_name"
  | "course_features"
  | "target_audience"
  | "payment_link"
  | "inquiry_link"
  | "curriculum_link"
  | "replay_link"
>;

export function allResourcePositions() {
  return Array.from(
    { length: MESSAGE_RESOURCE_COUNT },
    (_, index) => index + 1,
  );
}
