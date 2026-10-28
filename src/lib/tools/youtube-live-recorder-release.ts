const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/resumet/Youtube_live_webinar_recorder/releases/latest";

export const YOUTUBE_LIVE_RECORDER_RELEASES_URL =
  "https://github.com/resumet/Youtube_live_webinar_recorder/releases";

export type YouTubeLiveRecorderAsset = {
  name: string;
  downloadUrl: string;
  size: number;
};

export type YouTubeLiveRecorderRelease = {
  name: string;
  version: string;
  publishedAt: string;
  releaseUrl: string;
  assets: YouTubeLiveRecorderAsset[];
};

type GitHubReleaseAsset = {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
};

type GitHubRelease = {
  name?: unknown;
  tag_name?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  assets?: unknown;
};

const METADATA_FILE_PATTERN = /(?:\.blockmap|\.sha256|\.sig|\.json|\.ya?ml)$/iu;

export function parseYouTubeLiveRecorderRelease(
  value: unknown,
): YouTubeLiveRecorderRelease | null {
  if (!value || typeof value !== "object") return null;

  const release = value as GitHubRelease;
  if (
    typeof release.tag_name !== "string" ||
    typeof release.html_url !== "string" ||
    typeof release.published_at !== "string"
  ) {
    return null;
  }

  const assets = Array.isArray(release.assets)
    ? release.assets.flatMap((rawAsset): YouTubeLiveRecorderAsset[] => {
        if (!rawAsset || typeof rawAsset !== "object") return [];
        const asset = rawAsset as GitHubReleaseAsset;
        if (
          typeof asset.name !== "string" ||
          typeof asset.browser_download_url !== "string" ||
          typeof asset.size !== "number" ||
          METADATA_FILE_PATTERN.test(asset.name)
        ) {
          return [];
        }
        return [
          {
            name: asset.name,
            downloadUrl: asset.browser_download_url,
            size: asset.size,
          },
        ];
      })
    : [];

  return {
    name:
      typeof release.name === "string" && release.name.trim()
        ? release.name
        : release.tag_name,
    version: release.tag_name,
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
    assets,
  };
}

export async function getLatestYouTubeLiveRecorderRelease() {
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      cache: "force-cache",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: {
        revalidate: 60 * 60,
        tags: ["youtube-live-recorder-release"],
      },
    });

    if (!response.ok) return null;
    return parseYouTubeLiveRecorderRelease(await response.json());
  } catch {
    return null;
  }
}

export function formatReleaseAssetSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toLocaleString("ko-KR", {
    maximumFractionDigits: megabytes >= 100 ? 0 : 1,
  })}MB`;
}

export function formatReleaseAssetLabel(fileName: string) {
  if (/\.(?:exe|msi)$/iu.test(fileName)) return "Windows 다운로드";
  if (/\.(?:dmg|pkg)$/iu.test(fileName)) return "macOS 다운로드";
  if (/\.(?:appimage|deb|rpm)$/iu.test(fileName)) return "Linux 다운로드";
  return fileName;
}
