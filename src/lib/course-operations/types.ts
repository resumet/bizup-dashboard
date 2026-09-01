export type CourseOptionDraft = {
  name: string;
  listPrice: string;
  salePrice: string;
  groupChatLink: string;
  entryCode: string;
};

export type YoutubeAppearanceDraft = {
  channelName: string;
  channelUrl: string;
  videoUrl: string;
};

export type YoutubeChannelSuggestion = {
  channelName: string;
  channelUrl: string;
};

export type CourseOperationsDraft = {
  name: string;
  instructorName: string;
  freeWebinarAt: string;
  startsAt: string;
  earlyBirdEvent: string;
  first50Event: string;
  freeKakaoRoom1Link: string;
  freeKakaoRoom2Link: string;
  communicationRoomLink: string;
  paymentLink: string;
  inquiryLink: string;
  curriculumLink: string;
  freeGiftLink: string;
  courseViewingLink: string;
  options: CourseOptionDraft[];
  youtubeAppearances: YoutubeAppearanceDraft[];
  rosterJobIds: string[];
  messageProjectIds: string[];
  freeAddressBookId: string;
};

export type CourseOperationsInput = Omit<
  CourseOperationsDraft,
  "options"
> & {
  options: Array<{
    name: string;
    listPrice: number;
    salePrice: number;
    groupChatLink: string;
    entryCode: string;
  }>;
};

export type CourseSummary = {
  id: string;
  name: string;
  instructor_name: string;
  free_webinar_at: string;
  starts_at: string;
  updated_at: string;
  course_options: Array<{ id: string }>;
  course_jobs: Array<{ id: string }>;
  message_studio_projects: Array<{ id: string }>;
};

export type LinkableRosterJob = {
  id: string;
  name: string;
  default_course_name: string | null;
  valid_count: number;
  course_id: string | null;
  latest_version: number;
};

export type LinkableMessageProject = {
  id: string;
  course_name: string;
  instructor_name: string;
  updated_at: string;
  course_id: string | null;
  message_studio_resources: Array<{ generated_text: string }>;
};

export type AddressBookSummary = {
  id: string;
  name: string;
  contact_count: number;
  updated_at: string;
};

export type CourseStudentPreview = {
  id: string;
  name: string;
  phone: string;
  email: string;
  memo: string;
  sourceJobId: string;
};

export type CourseRosterAnalysis = {
  sourceJobId: string;
  totalCount: number;
  groupChatJoinedCount: number;
  sourceItems: Array<{
    source: string;
    count: number;
    percentage: number;
  }>;
  optionItems: Array<{
    optionName: string;
    count: number;
    percentage: number;
  }>;
};

export type FreeStudentPreview = {
  id: string;
  name: string;
  phone: string;
  email: string;
  sourceAddressBookId: string;
};
