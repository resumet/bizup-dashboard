import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // 사내 네트워크 주소로 로컬 개발 화면을 확인할 때 클라이언트 번들을 허용합니다.
  allowedDevOrigins: ["192.168.105.54"],
};

export default withWorkflow(nextConfig);
