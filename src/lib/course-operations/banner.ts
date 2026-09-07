export const COURSE_BANNER_BUCKET = "course-banners";
export const MAX_COURSE_BANNER_SIZE = 8 * 1024 * 1024;

const BANNER_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateCourseBannerFile(file: Pick<File, "name" | "size" | "type">) {
  const extension = BANNER_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error(`${file.name}: 배너 이미지는 JPG, PNG, WebP만 사용할 수 있습니다.`);
  }
  if (file.size <= 0 || file.size > MAX_COURSE_BANNER_SIZE) {
    throw new Error(`${file.name}: 배너 이미지는 8MB 이하여야 합니다.`);
  }
  return extension;
}

export function courseBannerUrl(courseId: string, version?: string) {
  const path = `/api/course-operations/${courseId}/banner`;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}
