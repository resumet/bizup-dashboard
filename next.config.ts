import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

const nextConfig: NextConfig = {
  // Preserve Next's default crawlers and send Kakao previews metadata in <head>.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|KakaoTalk|KakaoStory|KakaoBot`, "i"),
  async headers() {
    return ["/auth/callback", "/auth/confirm", "/auth/invite-error", "/set-password"].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }));
  },
  outputFileTracingIncludes: {
    "/.well-known/workflow/v1/step": ["./pdf-worker/convert.py", "./pdf-worker/requirements.txt"],
    "/api/tools/youtube-download": ["./youtube-worker/app.py", "./youtube-worker/requirements-sandbox.txt"],
    "/api/tools/youtube-download/info": ["./youtube-worker/app.py", "./youtube-worker/requirements-sandbox.txt"],
  },
  // 사내 네트워크 주소로 로컬 개발 화면을 확인할 때 클라이언트 번들을 허용합니다.
  allowedDevOrigins: ["192.168.105.54"],
};

export default withWorkflow(nextConfig);
