import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, inputs, normalizeCustomEmailSignature, normalizeEmailSignatureMode, normalizeYoutubeEmailBody, parseSource, type Video } from "./model";

test("YouTube URL variants resolve without guessing custom channels", () => {
  for (const path of ["watch?v=abcdefghijk", "shorts/abcdefghijk", "live/abcdefghijk"]) assert.equal(parseSource(`https://www.youtube.com/${path}`).value,"abcdefghijk");
  assert.equal(parseSource("https://youtu.be/abcdefghijk?t=10").kind,"video");
  assert.equal(parseSource("https://youtube.com/@한글채널/videos").value,"@한글채널");
  assert.equal(parseSource("https://youtube.com/@%ED%95%9C%EA%B8%80/videos").value,"@한글");
  assert.equal(parseSource(`https://youtube.com/channel/UC${"a".repeat(22)}`).kind,"channel");
  assert.equal(parseSource("https://youtube.com/user/Google").kind,"user");
  assert.throws(()=>parseSource("https://youtube.com/c/example"),/CHANNEL_RESOLUTION_AMBIGUOUS/);
  for(const url of ["https://evil.com/watch?v=abcdefghijk","https://youtube.com.evil.com/@test","https://user@youtube.com/@test","file:///etc/passwd","https://youtube.com/%ZZ","https://youtube.com/watch?v=bad","https://youtube.com/@"]) assert.throws(()=>parseSource(url));
});
test("blank lines, tracking params and equivalent video URLs are deduplicated", () => {
  assert.deepEqual(inputs("\n https://youtu.be/abcdefghijk?t=5\nhttps://www.youtube.com/watch?v=abcdefghijk\ninvalid\ninvalid\n"),["https://youtu.be/abcdefghijk?t=5","invalid"]);
});
const video=(id:string,views:number,publishedAt="2026-01-01T00:00:00Z"):Video=>({id,views,publishedAt,title:id,likes:null,comments:null});
test("empty and short channels preserve unavailable averages", () => {
  assert.equal(calculate([]).top,null);
  assert.equal(calculate([]).recent30Likes,null);
  assert.equal(calculate([]).recent30Comments,null);
  assert.equal(calculate([]).recent30Count,0);
  assert.equal(calculate([video("a",10)]).exclude1,null);
  assert.equal(calculate([video("a",10),video("b",1),video("c",2)]).exclude3,null);
  assert.deepEqual(calculate([video("a",10)]).samples,[1,1,1]);
});
test("top ordering is views, newest published date, then stable ID", () => {
  const result=calculate([video("z",100),video("b",100,"2026-02-01"),video("a",100,"2026-02-01"),video("d",1),video("e",2),video("f",2)]);
  assert.equal(result.top?.id,"a");
  assert.equal(result.exclude3,5/3);
});
test("all videos are used while recent samples use publication order", () => {
  const rows=Array.from({length:1051},(_,i)=>video(String(i),i,new Date(Date.UTC(2020,0,i+1)).toISOString()));
  const result=calculate(rows);
  assert.equal(result.count,1051);
  assert.equal(result.recent5,(1050+1049+1048+1047+1046)/5);
  assert.equal(result.exclude1,1049/2);
  assert.deepEqual(result.samples,[5,10,20]);
});
test("recent 30 engagement averages use publication order and available statistics", () => {
  const rows=Array.from({length:35},(_,i)=>({
    ...video(String(i),1000-i,new Date(Date.UTC(2026,0,i+1)).toISOString()),
    likes: i===10 ? null : i,
    comments: i===20 ? null : i*2,
  }));
  const result=calculate(rows);
  assert.equal(result.recent30Count,30);
  assert.equal(result.recent30Likes,(585-10)/29);
  assert.equal(result.recent30Comments,(1170-40)/29);
  assert.equal(calculate([{...video("zero",1),likes:0,comments:0}]).recent30Likes,0);
  assert.equal(calculate([{...video("zero",1),likes:0,comments:0}]).recent30Comments,0);
});
test("email draft fields preserve formatting and enforce storage limits", () => {
  assert.equal(normalizeYoutubeEmailBody("안녕하세요.\n\n제안드립니다."),"안녕하세요.\n\n제안드립니다.");
  assert.equal(normalizeYoutubeEmailBody("  "),null);
  assert.throws(()=>normalizeYoutubeEmailBody("a".repeat(5001)),/INVALID_EMAIL_BODY/);
  assert.equal(normalizeEmailSignatureMode("gmail_default"),"gmail_default");
  assert.equal(normalizeEmailSignatureMode("custom"),"custom");
  assert.throws(()=>normalizeEmailSignatureMode("none"),/INVALID_EMAIL_SIGNATURE_MODE/);
  assert.equal(normalizeCustomEmailSignature("비즈업\n홍길동"),"비즈업\n홍길동");
  assert.throws(()=>normalizeCustomEmailSignature("a".repeat(2001)),/INVALID_EMAIL_SIGNATURE/);
});
