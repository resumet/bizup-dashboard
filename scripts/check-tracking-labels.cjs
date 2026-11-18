const { createHash } = require("node:crypto");
const { fetchTrackingUtms } = require("../src/lib/course-landing-utms/tracking.ts");

fetchTrackingUtms("https://www.bizupclass.com/free-courses/fa51c466-5177-430b-b1b8-9aa391341fa2")
  .then(rows => {
    const sorted = rows.sort((a, b) => a.url.localeCompare(b.url, "en"));
    const hash = createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
    if (hash !== "fbec8027c60a798fa8f1a367ca54963ff0ce1820f8f89dcd8a600fdadbc7e54d") {
      throw new Error("Imported rows differ from the supplied export");
    }
    console.log("Tracking export verification: all %d rows match the XLSX", rows.length);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
