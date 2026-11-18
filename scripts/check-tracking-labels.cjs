const { fetchAdminCoursePage } = require("../src/lib/bizup-admin/course-page.ts");
const link = "https://www.bizupclass.com/free-courses/fa51c466-5177-430b-b1b8-9aa391341fa2";
(async () => {
  const { text } = await fetchAdminCoursePage(link, "tracking");
  const flight = Array.from(text.matchAll(/self\.__next_f\.push\(\s*\[\s*1\s*,\s*("(?:[^"\\]|\\.)*")\s*\]\s*\)/g), m => JSON.parse(m[1])).join("");
  console.log("Tracking array names:", [...new Set(Array.from(flight.matchAll(/"([a-zA-Z_]\w*)"\s*:\s*\[/g), m=>m[1]))].join(","));
  for (const sample of ["늦지않았다","6n3y5y","grossimpact","그로스임팩트","강사인스타그램"]) {
    const indexes = Array.from(flight.matchAll(new RegExp('"'+sample+'"',"g")), m=>m.index);
    const fields = indexes.slice(0,5).map(i=>{
      const before = flight.slice(Math.max(0,i-10000),i);
      const parentArray = Array.from(before.matchAll(/"([a-zA-Z_]\w*)":\[/g)).at(-1)?.[1];
      const field = before.match(/"([a-zA-Z_]\w*)":$/)?.[1];
      const record=before.slice(before.lastIndexOf("{"))+flight.slice(i,i+300).split("}")[0];
      const keys=Array.from(record.matchAll(/"([a-zA-Z_]\w*)":/g),m=>m[1]);
      return [parentArray,field,keys.join(",")].join("/");
    });
    console.log("Tracking shape",sample,indexes.length,[...new Set(fields)].join(" | "));
  }
})().catch(e=>{console.error(e.message);process.exitCode=1});
