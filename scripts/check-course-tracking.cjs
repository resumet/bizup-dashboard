// One-time, read-only production check for the reported course.
const { fetchTrackingUtms } = require("../src/lib/course-landing-utms/tracking.ts");

fetchTrackingUtms("https://www.bizupclass.com/free-courses/fa51c466-5177-430b-b1b8-9aa391341fa2")
  .then(rows => {
    console.log("UTM check: %d links, %d short URLs", rows.length, rows.filter(row => row.short_url).length);
    if (!rows.length) process.exitCode = 1;
  })
  .catch(error => { console.error("UTM check:", error.message); process.exitCode = 1; });
