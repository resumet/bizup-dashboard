import "server-only";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type CourseIntakeConfig = {
  password: string;
  sessionSecret: string;
  workspaceId: string;
  createdByUserId: string;
};

export function getCourseIntakeConfig(): CourseIntakeConfig {
  const config = {
    password: process.env.COURSE_INTAKE_PASSWORD?.trim() ?? "",
    sessionSecret: process.env.COURSE_INTAKE_SESSION_SECRET?.trim() ?? "",
    workspaceId: process.env.COURSE_INTAKE_WORKSPACE_ID?.trim() ?? "",
    createdByUserId: process.env.COURSE_INTAKE_CREATED_BY_USER_ID?.trim() ?? "",
  };
  if (!config.password || config.password.length < 8) {
    throw new Error("COURSE_INTAKE_PASSWORD를 8자 이상으로 설정해 주세요.");
  }
  if (config.sessionSecret.length < 32) {
    throw new Error("COURSE_INTAKE_SESSION_SECRET를 32자 이상으로 설정해 주세요.");
  }
  if (!UUID_PATTERN.test(config.workspaceId)) {
    throw new Error("COURSE_INTAKE_WORKSPACE_ID를 올바른 UUID로 설정해 주세요.");
  }
  if (!UUID_PATTERN.test(config.createdByUserId)) {
    throw new Error("COURSE_INTAKE_CREATED_BY_USER_ID를 올바른 UUID로 설정해 주세요.");
  }
  return config;
}

export function getCourseIntakeConfigurationError() {
  try {
    getCourseIntakeConfig();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "강의 생성 페이지 설정을 확인해 주세요.";
  }
}
