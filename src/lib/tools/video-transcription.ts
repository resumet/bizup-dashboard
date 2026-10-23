export const MAX_TRANSCRIPTION_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_YOUTUBE_COOKIE_BYTES = 512 * 1024;

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi"]);

export type TranscriptionSource =
  | { type: "youtube"; url: string; youtubeCookies?: string }
  | { type: "upload"; filename: string; size: number; contentType: string };

export type PreparedTranscription = {
  statusUrl: string;
  audioUrl: string;
  textUrl: string;
  uploadUrl?: string;
};

export function sanitizeYoutubeCookies(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("YouTube cookies.txt 파일이 비어 있습니다.");
  if (new TextEncoder().encode(normalized).byteLength > MAX_YOUTUBE_COOKIE_BYTES) {
    throw new Error("YouTube cookies.txt 파일은 512KB 이하여야 합니다.");
  }

  const youtubeCookies = normalized.split("\n").flatMap((rawLine) => {
    const line = rawLine.trim();
    if (!line || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) return [];
    const fields = line.split("\t");
    if (fields.length !== 7) return [];
    const domain = fields[0].replace(/^#HttpOnly_/, "").replace(/^\./, "").toLowerCase();
    if (domain !== "youtube.com" && !domain.endsWith(".youtube.com")) return [];
    return [fields.join("\t")];
  });

  if (!youtubeCookies.length) {
    throw new Error("YouTube 도메인의 로그인 쿠키가 포함된 Netscape 형식 cookies.txt 파일을 선택해 주세요.");
  }
  return `# Netscape HTTP Cookie File\n${youtubeCookies.join("\n")}\n`;
}

export function validateVideoUpload(input: {
  filename: string;
  size: number;
  contentType?: string;
}) {
  const filename = input.filename.trim();
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!filename || !VIDEO_EXTENSIONS.has(extension)) {
    throw new Error("MP4, MOV, M4V, WEBM, MKV, AVI 영상만 업로드할 수 있습니다.");
  }
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new Error("비어 있거나 크기를 확인할 수 없는 파일입니다.");
  }
  if (input.size > MAX_TRANSCRIPTION_VIDEO_BYTES) {
    throw new Error("500MB 이하의 영상만 업로드할 수 있습니다.");
  }
  if (
    input.contentType &&
    !input.contentType.startsWith("video/") &&
    input.contentType !== "application/octet-stream"
  ) {
    throw new Error("영상 파일 형식을 확인해 주세요.");
  }
  return {
    filename,
    size: input.size,
    contentType: input.contentType || "application/octet-stream",
  };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)}MB`;
}
