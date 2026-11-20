import "server-only";
import { driveResource } from "./model";

export async function checkDriveAccess(value: string) {
  const resource = driveResource(value);
  if (!resource) throw new Error("Google 드라이브 파일 또는 폴더의 공유 링크를 입력해 주세요.");
  let url: URL = resource;
  const signal = AbortSignal.timeout(12000);
  const restricted = "로그인 없이 열 수 없습니다. 드라이브의 일반 액세스를 ‘링크가 있는 모든 사용자’로 설정해 주세요.";
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) break;
      const next = new URL(location, url);
      if (next.hostname === "accounts.google.com") return { accessible: false, message: restricted };
      if (!driveResource(next.href)) break;
      url = next;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return { accessible: false, message: [401,403].includes(response.status) ? restricted : "공유 링크를 열 수 없습니다. 주소와 접근 권한을 확인해 주세요." };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    try {
      while (html.length < 350000 && !html.includes("</head>")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        html += decoder.decode(chunk.value, { stream: true });
      }
    } finally { await reader.cancel(); }
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
    if (/request access|access denied|sign[ -]?in|page not found|error 404|액세스 권한|로그인/i.test(title)) return { accessible: false, message: restricted };
    if (/.+\s[-–]\sGoogle (?:Drive|Docs|Sheets|Slides)\s*$/i.test(title)) {
      return { accessible: true, message: "로그인 없이 이 공유 링크를 열 수 있습니다." };
    }
    break;
  }
  return { accessible: false, message: "공개 여부를 확인할 수 없습니다. 로그아웃 상태에서 링크를 확인해 주세요." };
}
