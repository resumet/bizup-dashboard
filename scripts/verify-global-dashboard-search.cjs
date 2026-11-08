/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression harness for the real header search. */
// Run: node scripts/verify-global-dashboard-search.cjs
// Requires Playwright. Set PLAYWRIGHT_PACKAGE_PATH when using an external installation.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const postcss = require("postcss");
const tailwind = require("@tailwindcss/postcss");
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || "playwright");

const courseId = "11111111-1111-4111-8111-111111111111";
const bootstrap = {
  courses: [{
    id: courseId,
    name: "상단 검색 검증 강의",
    instructor: "검증 강사",
    cohort: "3기",
    webinarDate: "2026.11.30",
    status: "ongoing",
  }],
  customKeywords: {},
};

(async () => {
  let browser;
  let server;
  const output = path.resolve("tmp/global-dashboard-search");
  await fs.mkdir(output, { recursive: true });

  console.log("Bundling the real header search and quick actions...");
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from "react";
        import { createRoot } from "react-dom/client";
        import { HeaderSearchTools } from "./src/components/layout/app-shell";
        createRoot(document.getElementById("root")).render(
          <div className="min-h-screen bg-slate-50 p-4"><HeaderSearchTools /></div>
        );`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    plugins: [{
      name: "next-client-test-adapter",
      setup(build) {
        build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "test-adapter" }));
        build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "test-adapter" }));
        build.onLoad({ filter: /.*/, namespace: "test-adapter" }, (args) => ({
          loader: "jsx",
          resolveDir: process.cwd(),
          contents: args.path === "navigation"
            ? `export const usePathname = () => "/services/course-operations";
               export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} });
               export const useSearchParams = () => new URLSearchParams();`
            : `import React from "react";
               export default React.forwardRef(function Link({ href, children, ...props }, ref) {
                 return <a ref={ref} href={typeof href === "string" ? href : "#"} {...props}>{children}</a>;
               });`,
        }));
      },
    }],
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
  });
  const css = await postcss([tailwind()]).process(await fs.readFile("src/app/globals.css", "utf8"), {
    from: path.resolve("src/app/globals.css"),
  });
  console.log("Launching the browser fixture...");

  try {
    server = http.createServer((req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (req.url === "/api/dashboard/global-search") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(bootstrap));
        return;
      }
      if (req.url?.startsWith("/api/shared-calendar/search")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ results: [] }));
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${css.css}</style></head><body><div id="root"></div><script type="module">${bundle.outputFiles[0].text}</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROME_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    console.log("Browser launched.");

    for (const width of [1280, 390]) {
      console.log(`Checking ${width}px viewport...`);
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      console.log(`Fixture loaded at ${width}px.`);

      const teamSchedule = page.getByRole("link", { name: "팀일정", exact: true });
      const coursePlanner = page.getByRole("link", { name: "강의일정 플래너", exact: true });
      assert.equal(await teamSchedule.getAttribute("href"), "/calendar");
      assert.equal(await coursePlanner.getAttribute("href"), "/services/course-schedule-planner");

      const input = page.getByRole("combobox", { name: "메뉴 또는 강사 검색" });
      await input.fill("검증 강사");
      console.log(`Search result rendered at ${width}px.`);
      const trigger = page.getByRole("option", { name: "상단 검색 검증 강의 이동 메뉴 열기" });
      await trigger.waitFor();
      await trigger.click();

      const destination = page.getByRole("menuitem", { name: /인스타그램/ });
      await destination.waitFor();
      console.log(`Destination menu opened at ${width}px.`);
      assert.equal(await page.locator('[data-slot="dropdown-menu-trigger"]').getAttribute("data-state"), "open");
      assert.equal(await destination.getAttribute("href"), `/services/instagram-management/${courseId}`);
      assert.equal(await page.getByText("강사·강의 추천", { exact: true }).count(), 1);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, `header-search-${width}.png`), fullPage: true });
      await page.close();
    }

    console.log("PASS: header quick links render and the global course result opens the complete destination menu on desktop and mobile widths.");
  } finally {
    await browser?.close();
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
