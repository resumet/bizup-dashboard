# YouTube 채널 일괄 분석 서비스 PRD

- 문서 버전: v1.0
- 작성일: 2026-09-23
- 상태: MVP 개발용
- 권장 구성: Next.js + Vercel + Supabase(PostgreSQL) + YouTube Data API v3
- 핵심 원칙: **분석한 채널 목록을 누적한다. 새 채널은 목록 하단에 추가하고, 기존 채널을 다시 분석하면 그 채널의 현재 데이터만 새 YouTube 데이터로 갱신한다.**

> 2026-09-23 운영 정책 변경: 이 문서 아래에 남아 있는 run/snapshot 이력 설계는 레거시 참고용이다. 실제 서비스는 `youtube_analyzed_channels`와 `youtube_channel_videos`의 채널별 현재 상태를 사용하며, 요청 batch는 진행 상태 추적에만 사용한다.

---

## 1. 제품 개요

사용자가 YouTube 링크를 **한 줄에 하나씩 여러 개 입력**하면 각 링크가 가리키는 채널을 식별하고, 해당 채널의 최신 공개 데이터를 수집하여 채널별 핵심 성과지표와 최근 영상 상세 데이터를 한 화면에서 비교할 수 있는 서비스다.

입력 링크가 채널 URL이든 개별 영상 URL이든 최종적으로 `channelId`를 식별하여 채널 단위로 분석한다.

### 핵심 사용 예

```text
https://www.youtube.com/@채널A
https://www.youtube.com/watch?v=xxxxxxxxxxx
https://youtu.be/yyyyyyyyyyy
https://www.youtube.com/@채널B
```

분석 후 한 행에 한 채널씩 다음 정보를 보여준다.

- 채널명
- 채널주소
- 전체영상수
- 구독자수
- 최고조회영상 제목 + YouTube 링크
- 최고 조회수
- 최고영상 제외 평균 조회수
- 최근 5개 평균 조회수
- 최근 10개 평균 조회수
- 최근 20개 평균 조회수
- 최고 3개 제외 평균 조회수
- `더보기` 버튼
- 분석일시

`더보기`를 누르면 최근 영상 최대 30개의 아래 정보를 보여준다.

- 영상 제목 + YouTube 링크
- 조회수
- 좋아요수
- 댓글수

---

# 2. 제품 목표

## 2.1 핵심 목표

1. 여러 YouTube 링크를 한 번에 분석할 수 있어야 한다.
2. 개별 영상 링크를 넣어도 해당 영상의 채널을 자동 식별해야 한다.
3. 채널별 전체 공개 영상을 기준으로 조회수 통계를 계산해야 한다.
4. 최신 영상 최대 30개의 세부 성과를 확인할 수 있어야 한다.
5. 같은 채널을 다시 분석하면 **캐시된 과거 결과를 반환하지 않고 새 API 데이터를 수집**해야 한다.
6. 분석 결과를 채널별 현재 상태로 저장하고, 같은 채널 재분석 시 해당 채널만 갱신해야 한다.
7. 사용자에게 분석 결과를 수정하거나 삭제하는 기능은 MVP에서 제공하지 않는다.

## 2.2 비목표

MVP에는 다음 기능을 포함하지 않는다.

- YouTube 계정 로그인
- 채널 소유권 인증
- 동영상 업로드/수정
- 댓글 내용 수집
- 시청 지속시간
- 노출수/클릭률
- 수익 데이터
- 성별/연령/국가 등 YouTube Analytics 비공개 데이터
- 사용자 임의 데이터 수정
- 분석 결과 삭제
- 자동 주기 분석
- 경쟁 채널 AI 평가/점수화
- Shorts/롱폼 별도 필터링

---

# 3. 데이터 수집 원칙

공개 채널/영상 데이터는 **YouTube Data API v3**를 우선 사용한다.

YouTube 공식 API에서 다음 데이터를 수집한다.

### 채널 데이터

- `channel.id`
- `snippet.title`
- `snippet.customUrl`
- `snippet.localized`
- `statistics.videoCount`
- `statistics.subscriberCount`
- `statistics.hiddenSubscriberCount`
- `contentDetails.relatedPlaylists.uploads`

### 영상 데이터

- `video.id`
- `snippet.title`
- `snippet.channelId`
- `snippet.publishedAt`
- `statistics.viewCount`
- `statistics.likeCount`
- `statistics.commentCount`
- `status.privacyStatus`

---

# 4. 입력 요구사항

## 4.1 입력 UI

대형 textarea를 제공한다.

Placeholder:

```text
유튜브 링크를 한 줄에 하나씩 입력하세요.

예)
https://www.youtube.com/@채널명
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
```

하단 버튼:

`분석하기`

MVP 권장 기본 입력 제한:

- 한 번에 최대 50줄
- 빈 줄 무시
- 앞뒤 공백 자동 제거
- 동일 URL 중복 제거
- URL 형식 오류는 해당 줄만 실패 처리
- 하나의 실패가 전체 배치 분석을 중단시키지 않음

입력 최대 개수는 환경설정으로 변경 가능하게 구현한다.

---

# 5. 지원 URL

## 5.1 반드시 지원

### 채널 핸들

```text
https://www.youtube.com/@handle
https://youtube.com/@한글채널
https://www.youtube.com/@handle/videos
```

### Channel ID

```text
https://www.youtube.com/channel/UCxxxxxxxx
```

### 일반 영상

```text
https://www.youtube.com/watch?v=VIDEO_ID
```

### 단축 URL

```text
https://youtu.be/VIDEO_ID
```

### Shorts

```text
https://www.youtube.com/shorts/VIDEO_ID
```

### Live 영상 URL

```text
https://www.youtube.com/live/VIDEO_ID
```

## 5.2 Legacy URL

가능하면 다음도 지원한다.

```text
https://www.youtube.com/user/USERNAME
https://www.youtube.com/c/CUSTOM_NAME
```

처리 기준:

- `/user/` → `channels.list(forUsername=...)`
- `/c/` → 직접 channelId를 알 수 없는 경우 fallback resolver 사용
- fallback 결과가 정확하게 확인되지 않으면 임의의 채널을 선택하지 않고 `채널을 정확히 확인할 수 없음` 오류 표시

---

# 6. URL → Channel ID 식별 로직

모든 데이터는 최종적으로 `channelId`를 기준으로 관리한다.

## 6.1 `@handle`

URL:

```text
youtube.com/@한국채널
```

처리:

```text
handle 추출
→ decodeURIComponent
→ channels.list(forHandle=handle)
→ channelId 획득
```

한글 handle은 내부 요청 시 안전하게 URL encoding하고 화면에는 Unicode 원문으로 표시한다.

## 6.2 `/channel/{channelId}`

URL에서 channelId를 바로 추출한다.

## 6.3 영상 URL

영상 ID를 추출한다.

```text
videos.list(part=snippet&id=VIDEO_ID)
→ snippet.channelId
```

## 6.4 `/user/{username}`

```text
channels.list(forUsername=username)
```

## 6.5 `/c/{customName}`

정확한 API 직접 필터가 없는 경우 fallback으로 채널 후보를 찾은 뒤 `customUrl`, 채널명 등을 검증한다.

일치 여부가 불확실하면 분석하지 않는다.

---

# 7. 채널주소 표시 규칙

화면에는 사람이 읽기 좋은 주소를 보여준다.

우선순위:

1. 사용자가 `@handle` 채널 주소를 직접 입력한 경우 해당 주소 사용
2. `snippet.customUrl`에서 handle/custom URL을 확인할 수 있는 경우 사용
3. 확인할 수 없는 경우 channel ID 주소 사용

예:

```text
실제 href
https://www.youtube.com/@%EC%98%88%EC%8B%9C%EC%B1%84%EB%84%90

화면 표시
youtube.com/@예시채널
```

즉, **한글 URL은 percent-encoding 문자열이 아니라 한글로 표시**한다.

링크 자체는 새 탭으로 정상 이동되어야 한다.

---

# 8. 분석 실행 흐름

```text
[사용자 URL 여러 개 입력]
        ↓
[URL Validation / Normalize]
        ↓
[각 URL에서 Channel ID 식별]
        ↓
[동일 배치 내 동일 Channel ID Dedup]
        ↓
[채널 기본정보 최신 조회]
        ↓
[Uploads Playlist ID 조회]
        ↓
[업로드 영상 전체 ID pagination 수집]
        ↓
[Video ID 최대 50개 단위 statistics batch 조회]
        ↓
[공개/접근 가능한 영상 정규화]
        ↓
[조회수 지표 계산]
        ↓
[최근 30개 상세 데이터 생성]
        ↓
[DB에 새 Analysis Run + Video Snapshot INSERT]
        ↓
[결과 UI 표시]
```

---

# 9. 재분석 정책

이 기능이 매우 중요하다.

## 9.1 기본 정책

동일 채널에 과거 분석 결과가 존재하더라도 새 분석 요청이 발생하면:

```text
과거 DB 결과 조회 후 반환 X
캐시 결과 반환 X
기존 analysis_run UPDATE X

YouTube API 새 호출
→ 새 분석
→ 새 analysis_run INSERT
→ 새 video_snapshot INSERT
```

즉, 분석 결과는 **append-only snapshot** 방식으로 누적한다.

## 9.2 동일 제출 내 중복

한 번의 textarea 제출 안에 같은 채널의 링크가 여러 번 들어간 경우에는 API 낭비를 막기 위해 **해당 배치 안에서만 한 번 분석**한다.

예:

```text
https://youtube.com/@AAA
https://youtube.com/watch?v=AAA_CHANNEL_VIDEO
```

두 URL이 같은 channelId로 판별되면 한 번 분석한다.

그러나 사용자가 다음에 새로 `분석하기`를 누르면 다시 새 API 데이터를 가져온다.

---

# 10. 전체 영상 수집 방식

채널 조회:

```text
channels.list(
  part=snippet,statistics,contentDetails
)
```

여기에서:

```text
contentDetails.relatedPlaylists.uploads
```

값을 얻는다.

이 uploads playlist를 대상으로:

```text
playlistItems.list(
  playlistId=UPLOADS_PLAYLIST_ID,
  part=snippet,contentDetails,
  maxResults=50,
  pageToken=...
)
```

를 반복하여 모든 영상 ID를 수집한다.

그 후 Video ID를 최대 50개씩 묶어:

```text
videos.list(
  part=snippet,statistics,status,
  id=VIDEO_ID_1,VIDEO_ID_2,...
)
```

형태로 조회한다.

### 중요

`search.list`를 이용해 채널의 전체 영상을 검색하는 방식을 핵심 수집 방식으로 사용하지 않는다.

Uploads playlist를 기준으로 수집한다.

---

# 11. 지표 정의

모든 평균 조회수는 정수로 표시한다.

내부 계산은 소수점까지 계산한 뒤 UI에서 `Math.round()` 처리한다.

분석 대상 영상 집합을 다음과 같이 정의한다.

```text
V = 이번 분석 시점에 API로 정상 조회된 공개 영상
```

각 영상의 조회수를:

```text
view(v)
```

라고 한다.

---

## 11.1 전체영상수

UI 표시값:

```text
channel.statistics.videoCount
```

YouTube API가 반환하는 **공개 영상 수**를 사용한다.

추가로 내부에는 다음 값을 별도로 저장한다.

```text
reported_video_count = statistics.videoCount
analyzed_video_count = 실제 영상 상세 조회 성공 개수
```

두 값이 다른 경우 오류로 분석 전체를 실패시키지는 않되 내부 warning을 남긴다.

---

## 11.2 구독자수

```text
channel.statistics.subscriberCount
```

사용한다.

`hiddenSubscriberCount = true`인 경우:

```text
비공개
```

로 표시하고 DB의 `subscriber_count`는 `NULL` 허용한다.

YouTube API의 공개 구독자 수는 정책에 따라 반올림된 값일 수 있으므로 UI에서 이를 정확한 실시간 원시 숫자라고 표현하지 않는다.

---

## 11.3 최고조회영상

전체 분석 영상 중 `viewCount` 최대 영상.

정렬:

```text
view_count DESC
published_at DESC
video_id ASC
```

첫 번째 영상을 선택한다.

화면:

```text
[영상 제목 ↗]
```

클릭:

```text
https://www.youtube.com/watch?v={videoId}
```

---

## 11.4 최고 조회수

```text
max(viewCount)
```

---

## 11.5 최고영상 제외 평균

전체 영상에서 조회수 1위 영상 1개를 제거한 평균.

```text
sorted = videos sorted by view_count DESC
target = sorted[1:]

avg_excluding_top1 =
SUM(target.view_count) / COUNT(target)
```

영상이 1개 이하인 경우:

```text
-
```

---

## 11.6 최근 5개 평균

`publishedAt DESC`로 정렬한 최근 최대 5개 영상의 조회수 평균.

```text
recent5 = videos.sort(published_at DESC).slice(0, 5)
avg_recent_5 = average(recent5.view_count)
```

영상이 5개 미만이면 존재하는 영상만 사용한다.

예:

영상이 3개라면:

```text
최근 5개 평균 = 최근 3개의 평균
sample_size = 3
```

DB에는 `recent_5_sample_size`도 저장한다.

---

## 11.7 최근 10개 평균

최근 최대 10개 영상의 평균.

```text
avg_recent_10
```

영상이 10개 미만이면 존재하는 영상만 사용한다.

---

## 11.8 최근 20개 평균

최근 최대 20개 영상의 평균.

```text
avg_recent_20
```

영상이 20개 미만이면 존재하는 영상만 사용한다.

---

## 11.9 최고 3개 제외 평균

전체 영상 중 조회수 상위 3개를 제거한 나머지 영상의 평균.

```text
sorted = videos.sort(view_count DESC)
target = sorted.slice(3)

avg_excluding_top3 =
SUM(target.view_count) / COUNT(target)
```

영상이 3개 이하인 경우:

```text
-
```

---

# 12. 기본 결과 화면

추천 테이블:

| 채널명 | 채널주소 | 전체영상수 | 구독자수 | 최고조회영상 | 최고 조회수 | 최고영상 제외 평균 | 최근 5개 평균 | 최근 10개 평균 | 최근 20개 평균 | 최고 3개 제외 평균 | 상세 |
|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---|
| 채널A | youtube.com/@채널A | 382 | 124만 | 영상 제목 ↗ | 13,203,992 | 83,211 | 42,332 | 38,221 | 35,102 | 61,440 | 더보기 |

### UI 요구사항

- 큰 숫자는 천 단위 쉼표
- 모바일에서는 가로 스크롤 허용
- 채널명 클릭 시 채널 새 탭
- 채널주소 클릭 시 채널 새 탭
- 최고영상 제목 클릭 시 영상 새 탭
- 분석 중 row skeleton 또는 progress 표시
- 오류가 난 URL은 별도 오류 row로 표시
- 결과 상단에 분석 시작/완료 시간 표시
- 각 채널 row에 `분석완료 시각` tooltip 또는 보조 텍스트 표시

---

# 13. 더보기 UI

`더보기` 클릭 시 우측 Drawer 또는 Modal을 연다.

제목:

```text
{채널명} - 최근 영상 30개
```

테이블:

| No | 제목 | 조회수 | 좋아요수 | 댓글수 |
|---:|---|---:|---:|---:|
| 1 | 영상 제목 ↗ | 32,100 | 1,221 | 87 |
| 2 | 영상 제목 ↗ | 18,210 | 843 | 41 |

정렬:

```text
published_at DESC
```

최대 30개.

영상이 30개보다 적으면 존재하는 영상만 표시한다.

### 값이 없는 경우

좋아요/댓글 수가 API 응답에 없으면:

```text
-
```

0으로 임의 변환하지 않는다.

---

# 14. 분석 진행 상태

다수 채널을 처리할 때 사용자가 멈춘 것처럼 느끼지 않도록 상태를 보여준다.

예:

```text
12개 URL 확인
10개 채널 식별
분석 중 4 / 10
```

채널별 상태:

```text
PENDING
RESOLVING
FETCHING_CHANNEL
FETCHING_VIDEOS
CALCULATING
SAVING
COMPLETED
FAILED
```

실제 사용자 화면에는 단순화하여:

```text
대기
채널 확인 중
영상 수집 중
계산 중
완료
실패
```

로 보여준다.

---

# 15. DB 설계

Supabase PostgreSQL 기준.

분석 이력은 덮어쓰지 않고 누적한다.

---

## 15.1 analysis_batches

사용자가 `분석하기`를 한 번 클릭한 작업 단위.

```sql
create table analysis_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  input_count integer not null,
  unique_channel_count integer,
  status text not null default 'PENDING'
);
```

---

## 15.2 analysis_requests

사용자가 입력한 원본 URL 단위.

```sql
create table analysis_requests (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references analysis_batches(id),
  input_order integer not null,
  input_url text not null,
  normalized_url text,
  resolved_channel_id text,
  analysis_run_id uuid,
  status text not null default 'PENDING',
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
```

---

## 15.3 channel_analysis_runs

채널 1회 분석당 한 row.

```sql
create table channel_analysis_runs (
  id uuid primary key default gen_random_uuid(),

  batch_id uuid not null references analysis_batches(id),

  channel_id text not null,

  channel_name text not null,
  channel_url_display text not null,
  channel_url_href text not null,

  analyzed_at timestamptz not null default now(),

  reported_video_count bigint,
  analyzed_video_count integer,

  subscriber_count bigint,
  subscriber_hidden boolean not null default false,

  top_video_id text,
  top_video_title text,
  top_video_view_count bigint,

  avg_excluding_top1 bigint,
  avg_recent_5 bigint,
  avg_recent_10 bigint,
  avg_recent_20 bigint,
  avg_excluding_top3 bigint,

  recent_5_sample_size integer,
  recent_10_sample_size integer,
  recent_20_sample_size integer,

  warning_code text,
  warning_message text
);
```

### Index

```sql
create index idx_channel_runs_channel_time
on channel_analysis_runs(channel_id, analyzed_at desc);
```

---

## 15.4 video_snapshots

분석 시점의 영상 데이터.

정확한 전체 통계 계산과 이후 히스토리 활용을 위해 **최근 30개뿐 아니라 이번 분석에서 조회한 전체 공개 영상의 snapshot을 저장**하는 것을 권장한다.

```sql
create table video_snapshots (
  id uuid primary key default gen_random_uuid(),

  analysis_run_id uuid not null references channel_analysis_runs(id),
  channel_id text not null,

  video_id text not null,
  video_title text not null,
  video_url text not null,

  published_at timestamptz,

  view_count bigint,
  like_count bigint,
  comment_count bigint,

  published_rank integer,
  view_rank integer,

  created_at timestamptz not null default now(),

  unique(analysis_run_id, video_id)
);
```

### Index

```sql
create index idx_video_snapshots_run_published
on video_snapshots(analysis_run_id, published_at desc);

create index idx_video_snapshots_run_views
on video_snapshots(analysis_run_id, view_count desc);
```

---

# 16. 최신 결과 조회

동일 채널의 분석 이력이 여러 개 있어도 기본 화면에서는 가장 최근 run을 사용한다.

```sql
select distinct on (channel_id) *
from channel_analysis_runs
order by channel_id, analyzed_at desc;
```

그러나 새로운 분석 요청이 들어왔을 때 이 값을 재사용해서는 안 된다.

최신 조회는 **화면 표시용**이다.

재분석은 항상 새 API 수집이다.

---

# 17. API 설계

## 17.1 분석 시작

```http
POST /api/analysis/batches
```

Request:

```json
{
  "urls": [
    "https://www.youtube.com/@channel1",
    "https://www.youtube.com/watch?v=VIDEO_ID"
  ]
}
```

Response:

```json
{
  "batchId": "uuid",
  "status": "PENDING"
}
```

---

## 17.2 분석 진행률

```http
GET /api/analysis/batches/{batchId}
```

Response:

```json
{
  "batchId": "uuid",
  "status": "RUNNING",
  "inputCount": 10,
  "resolvedChannelCount": 8,
  "completedChannelCount": 3,
  "failedInputCount": 1
}
```

Polling 또는 SSE 방식 사용 가능.

---

## 17.3 배치 결과

```http
GET /api/analysis/batches/{batchId}/results
```

Response:

```json
{
  "channels": [
    {
      "analysisRunId": "uuid",
      "channelId": "UCxxxx",
      "channelName": "예시 채널",
      "channelUrlDisplay": "youtube.com/@예시채널",
      "channelUrlHref": "https://www.youtube.com/@...",
      "totalVideoCount": 123,
      "subscriberCount": 455000,
      "subscriberHidden": false,
      "topVideo": {
        "id": "abc",
        "title": "조회수 1위 영상",
        "url": "https://www.youtube.com/watch?v=abc",
        "viewCount": 3120000
      },
      "avgExcludingTop1": 48210,
      "avgRecent5": 32100,
      "avgRecent10": 30100,
      "avgRecent20": 29500,
      "avgExcludingTop3": 35210,
      "analyzedAt": "2026-09-23T09:00:00Z"
    }
  ]
}
```

---

## 17.4 최근 30개

```http
GET /api/analysis/runs/{analysisRunId}/videos?limit=30
```

DB에서 해당 run의 최신 순 영상 30개를 반환한다.

**이 상세 요청 때문에 YouTube API를 다시 호출하지 않는다.**

더보기는 같은 분석 run에 저장된 데이터를 사용한다.

---

# 18. Backend 처리 의사코드

```ts
async function analyzeBatch(urls: string[]) {
  const batch = await createBatch(urls);

  const resolved = [];

  for (const [index, rawUrl] of urls.entries()) {
    try {
      const normalizedUrl = normalizeYoutubeUrl(rawUrl);
      const channelId = await resolveChannelId(normalizedUrl);

      resolved.push({
        index,
        rawUrl,
        normalizedUrl,
        channelId,
      });
    } catch (error) {
      await saveInputFailure(batch.id, index, rawUrl, error);
    }
  }

  const uniqueChannelIds = unique(resolved.map(x => x.channelId));

  for (const channelId of uniqueChannelIds) {
    try {
      // 중요:
      // 과거 DB 분석 결과를 찾아 재사용하지 않는다.
      const freshData = await fetchFreshChannelData(channelId);

      const metrics = calculateMetrics(freshData.videos);

      const analysisRun = await insertAnalysisRun({
        ...freshData.channel,
        ...metrics,
      });

      await insertVideoSnapshots(
        analysisRun.id,
        freshData.videos
      );

      await connectRequestsToRun(
        batch.id,
        channelId,
        analysisRun.id
      );
    } catch (error) {
      await markChannelFailure(batch.id, channelId, error);
    }
  }

  await completeBatch(batch.id);
}
```

---

# 19. fetchFreshChannelData

```ts
async function fetchFreshChannelData(channelId: string) {
  // 1. 채널 최신 메타데이터
  const channel = await youtube.channels.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id: [channelId],
  });

  const uploadPlaylistId =
    channel.items[0]
      .contentDetails
      .relatedPlaylists
      .uploads;

  // 2. 전체 업로드 videoId 수집
  const videoIds = [];
  let pageToken = undefined;

  do {
    const page = await youtube.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: uploadPlaylistId,
      maxResults: 50,
      pageToken,
    });

    for (const item of page.items) {
      if (item.contentDetails?.videoId) {
        videoIds.push(item.contentDetails.videoId);
      }
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  // 3. 최대 50개씩 영상 상세 조회
  const videos = [];

  for (const chunk of chunks(videoIds, 50)) {
    const response = await youtube.videos.list({
      part: ['snippet', 'statistics', 'status'],
      id: chunk,
    });

    videos.push(...normalizeVideos(response.items));
  }

  return {
    channel: normalizeChannel(channel.items[0]),
    videos,
  };
}
```

---

# 20. calculateMetrics

```ts
function calculateMetrics(videos) {
  const valid = videos
    .filter(v => v.viewCount !== null)
    .sort((a, b) =>
      new Date(b.publishedAt).getTime() -
      new Date(a.publishedAt).getTime()
    );

  const byViews = [...valid].sort((a, b) => {
    if (b.viewCount !== a.viewCount) {
      return b.viewCount - a.viewCount;
    }

    return (
      new Date(b.publishedAt).getTime() -
      new Date(a.publishedAt).getTime()
    );
  });

  const topVideo = byViews[0] ?? null;

  const recent5 = valid.slice(0, 5);
  const recent10 = valid.slice(0, 10);
  const recent20 = valid.slice(0, 20);

  return {
    topVideo,

    avgExcludingTop1:
      averageOrNull(byViews.slice(1).map(v => v.viewCount)),

    avgRecent5:
      averageOrNull(recent5.map(v => v.viewCount)),

    avgRecent10:
      averageOrNull(recent10.map(v => v.viewCount)),

    avgRecent20:
      averageOrNull(recent20.map(v => v.viewCount)),

    avgExcludingTop3:
      averageOrNull(byViews.slice(3).map(v => v.viewCount)),

    recent5SampleSize: recent5.length,
    recent10SampleSize: recent10.length,
    recent20SampleSize: recent20.length,
  };
}
```

---

# 21. 대규모 채널 처리

영상이 수천~수만 개 있는 채널은 단일 HTTP 요청 안에서 전체 분석을 끝내려고 하지 않는다.

권장 구조:

```text
Frontend
   ↓
Next.js API
   ↓
analysis job 생성
   ↓
Background Worker / Durable Job
   ↓
YouTube API pagination
   ↓
Supabase
   ↓
Frontend polling/SSE
```

### 이유

예를 들어 공개 영상이 5,000개인 채널이라면:

```text
playlistItems.list
50개/page
= 약 100 page 요청

videos.list
최대 50개씩
= 약 100 batch 요청
```

이런 작업은 네트워크 상황이나 서버리스 실행 제한에 따라 단일 request/response 처리에 적합하지 않을 수 있다.

따라서 UI 요청과 실제 분석 worker를 분리한다.

---

# 22. YouTube API Quota 전략

불필요한 API 호출을 줄인다.

### 기본 원칙

- Channel ID를 식별한 뒤 모든 처리의 primary key로 사용
- Uploads playlist 활용
- `playlistItems.list` 최대 50개
- `videos.list` video ID 최대 50개씩 batch
- 필요하지 않은 API `part` 요청 금지
- 같은 분석 배치 안에서는 같은 channelId 중복 분석 금지
- 과거 분석 결과는 새 분석에 재사용하지 않음

### Quota 보호

설정값:

```env
MAX_URLS_PER_BATCH=50
MAX_CONCURRENT_CHANNELS=3
MAX_YOUTUBE_RETRIES=3
```

API quota 부족 시:

```text
YOUTUBE_QUOTA_EXCEEDED
```

오류를 저장하고 사용자에게:

```text
YouTube API 사용 한도에 도달해 분석을 완료하지 못했습니다.
```

표시한다.

---

# 23. 재시도

다음 오류는 exponential backoff 대상:

- 일시적 5xx
- 네트워크 timeout
- rate limit

예:

```text
1초
2초
4초
```

최대 3회.

다음은 자동 재시도하지 않는다.

- 잘못된 URL
- 존재하지 않는 영상
- 존재하지 않는 채널
- 비공개/삭제 영상
- 정확히 식별할 수 없는 legacy custom URL

---

# 24. 오류 처리

## 24.1 Invalid URL

```text
올바른 YouTube 링크가 아닙니다.
```

Error code:

```text
INVALID_YOUTUBE_URL
```

## 24.2 Video Not Found

```text
영상을 찾을 수 없거나 공개되지 않은 영상입니다.
```

```text
VIDEO_NOT_FOUND
```

## 24.3 Channel Not Found

```text
채널을 찾을 수 없습니다.
```

```text
CHANNEL_NOT_FOUND
```

## 24.4 Legacy URL Ambiguous

```text
이 주소에서 채널을 정확히 확인할 수 없습니다.
@handle 또는 영상 링크를 입력해주세요.
```

```text
CHANNEL_RESOLUTION_AMBIGUOUS
```

## 24.5 No Public Videos

```text
분석 가능한 공개 영상이 없습니다.
```

채널 기본정보는 표시하고 영상 기반 평균값은 `-`.

---

# 25. 데이터 일관성

YouTube API 호출 중 조회수가 계속 변경될 수 있다.

따라서 한 run의 데이터가 완전히 같은 밀리초의 snapshot이라는 보장은 없다.

DB에는:

```text
analysis_started_at
analysis_completed_at
```

을 저장하는 것을 권장한다.

UI의 `분석시각`은 `analysis_completed_at`을 사용한다.

---

# 26. YouTube 데이터 관련 주의사항

## 26.1 구독자 수

YouTube Data API가 제공하는 공개 구독자 수는 YouTube 정책에 따라 반올림된 값일 수 있다.

따라서 서비스에서 이를 임의로 “정확한 실시간 구독자 수”라고 표현하지 않는다.

## 26.2 영상 수

`statistics.videoCount`는 채널의 공개 영상 수 기준이다.

비공개 영상은 포함되지 않을 수 있다.

## 26.3 조회수 정의 변화

YouTube 공식 문서 기준으로 2026-08-24부터 채널의 long-form, Live, Shorts를 포함한 영상 형식의 view count 집계 정의가 변경되었다.

따라서 2026-08-24 이전에 저장한 과거 snapshot과 이후 데이터를 장기 비교할 경우 단순 증가율만으로 의미를 해석하지 않도록 주의한다.

---

# 27. 보안

YouTube API Key는 브라우저에 노출하지 않는다.

```text
Browser
  ↓
Server API
  ↓
YouTube Data API
```

환경변수:

```env
YOUTUBE_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` 역시 클라이언트에 노출하지 않는다.

---

# 28. 로그

최소 아래 로그를 남긴다.

```text
batch_id
analysis_run_id
channel_id
request_type
youtube_endpoint
page_number
video_count_fetched
attempt
error_code
elapsed_ms
```

API Key, 인증정보 등 비밀정보는 로그에 남기지 않는다.

---

# 29. 성능 요구사항

MVP 목표:

- URL validation: 입력 즉시
- 채널 10개 이하의 일반적인 배치에서 UI가 진행 상태를 계속 표시
- 첫 채널 완료 즉시 해당 row를 표시 가능
- 전체 작업 완료를 기다리지 않고 부분 결과 rendering 가능
- 최근 30개 더보기는 DB 조회만 사용하므로 빠르게 표시
- 브라우저 새로고침 후에도 batchId로 결과 복구 가능

---

# 30. 숫자 표시

원본 데이터는 DB에 integer/bigint로 저장한다.

기본 UI:

```text
1,234
12,345
1,234,567
```

선택적으로 보조 표시:

```text
123만
1,234만
```

를 사용할 수 있지만 tooltip 또는 상세에서 원 숫자를 확인할 수 있어야 한다.

평균값은 반올림 정수로 표시한다.

---

# 31. UX 세부사항

## 초기 화면

```text
┌───────────────────────────────────────────────┐
│ YouTube 채널 분석                            │
│                                               │
│ 유튜브 링크를 한 줄에 하나씩 입력하세요.     │
│                                               │
│ https://youtube.com/@...                      │
│ https://youtube.com/watch?v=...               │
│                                               │
└───────────────────────────────────────────────┘

[ 분석하기 ]
```

## 실행 후

```text
총 15개 입력
12개 채널 확인
8 / 12 분석 완료

██████████████░░░░░░ 67%
```

아래에 완료된 채널부터 table row 추가.

---

# 32. 추천 컴포넌트

```text
YoutubeUrlInput
AnalyzeButton
BatchProgress
ChannelAnalysisTable
ChannelAnalysisRow
ChannelLink
VideoLink
MetricCell
VideoDetailDrawer
RecentVideoTable
ErrorRow
AnalysisTimestamp
```

---

# 33. 권장 폴더 구조

```text
app/
  page.tsx

  api/
    analysis/
      batches/
        route.ts
        [batchId]/
          route.ts
          results/
            route.ts
      runs/
        [runId]/
          videos/
            route.ts

components/
  youtube-url-input.tsx
  batch-progress.tsx
  channel-analysis-table.tsx
  channel-analysis-row.tsx
  video-detail-drawer.tsx
  recent-video-table.tsx

lib/
  youtube/
    client.ts
    parse-url.ts
    resolve-channel.ts
    fetch-channel.ts
    fetch-upload-video-ids.ts
    fetch-video-stats.ts
    normalize.ts

  analytics/
    calculate-channel-metrics.ts

  db/
    analysis-batches.ts
    analysis-runs.ts
    video-snapshots.ts

types/
  youtube.ts
  analysis.ts
```

---

# 34. MVP 구현 우선순위

## Phase 1

1. textarea 여러 URL 입력
2. YouTube URL parser
3. 채널/영상 URL → channelId 변환
4. 채널 기본정보 수집
5. uploads playlist 전체 수집
6. videos.list 통계 batch 조회
7. 핵심 평균 계산
8. 결과 table
9. 최근 30개 Drawer
10. Supabase 저장
11. 재분석 시 항상 새 run 생성

## Phase 2

- 분석 히스토리 조회
- 이전 분석 대비 조회수 변화
- 구독자 증가량
- CSV/Excel 다운로드
- 채널 그룹 저장
- 사용자 로그인
- 태그/메모
- 분석 예약
- Shorts/롱폼 분리
- 영상 업로드 후 경과일 기준 보정
- 조회수/구독자 비율
- 댓글률/좋아요율

---

# 35. 테스트 케이스

## URL

- `@영문handle`
- `@한글handle`
- 한글 percent-encoded handle
- `/channel/UC...`
- `/watch?v=...`
- `youtu.be/...`
- `/shorts/...`
- `/live/...`
- `/user/...`
- 잘못된 URL
- 삭제된 영상
- 비공개 영상

## 채널

- 영상 0개
- 영상 1개
- 영상 2개
- 영상 3개
- 영상 4개
- 영상 5개
- 영상 10개
- 영상 20개
- 영상 30개
- 영상 1,000개 이상
- 구독자수 비공개 채널

## 재분석

1. 채널 A 분석
2. DB에 run A1 저장 확인
3. 같은 채널 A 다시 분석
4. API 새 호출 확인
5. run A2 새 INSERT 확인
6. A1이 삭제/overwrite되지 않았는지 확인
7. UI는 A2 결과 표시

---

# 36. Acceptance Criteria

다음 조건을 모두 충족하면 MVP 완료로 본다.

- [ ] YouTube 링크를 여러 개 한 줄씩 입력할 수 있다.
- [ ] 영상 링크를 넣으면 해당 채널을 식별한다.
- [ ] `@한글handle`을 정상 처리한다.
- [ ] 채널주소에 한글이 있으면 화면에서 한글로 보여준다.
- [ ] 채널명이 표시된다.
- [ ] 전체영상수가 표시된다.
- [ ] 구독자수가 표시된다.
- [ ] 구독자 비공개 채널을 처리한다.
- [ ] 전체 공개 영상 중 최고조회영상을 찾는다.
- [ ] 최고영상 제목이 클릭 가능한 YouTube 링크다.
- [ ] 최고 조회수가 표시된다.
- [ ] 최고영상 제외 평균을 계산한다.
- [ ] 최근 5개 평균을 계산한다.
- [ ] 최근 10개 평균을 계산한다.
- [ ] 최근 20개 평균을 계산한다.
- [ ] 최고 3개 제외 평균을 계산한다.
- [ ] 더보기에서 최근 영상 최대 30개를 확인한다.
- [ ] 최근 영상 제목이 클릭 가능한 링크다.
- [ ] 최근 영상 조회수가 표시된다.
- [ ] 최근 영상 좋아요수가 표시된다.
- [ ] 최근 영상 댓글수가 표시된다.
- [ ] 같은 채널을 새로 분석하면 기존 DB 결과를 사용하지 않는다.
- [ ] 재분석 때 새로운 analysis run을 생성한다.
- [ ] 과거 분석 run을 삭제하지 않는다.
- [ ] 분석된 데이터가 Supabase DB에 저장된다.
- [ ] 사용자용 수정 기능이 없다.
- [ ] 사용자용 삭제 기능이 없다.
- [ ] 하나의 URL 실패가 전체 배치를 실패시키지 않는다.
- [ ] 대량 채널 분석 중 진행 상태를 확인할 수 있다.

---

# 37. 개발 시 가장 중요한 구현 규칙

```text
RULE 1
channelId를 모든 채널의 canonical identifier로 사용한다.

RULE 2
새 분석 요청이 오면 DB의 과거 분석 결과를 캐시처럼 사용하지 않는다.

RULE 3
새 분석 요청 = YouTube API에서 새 데이터 수집.

RULE 4
기존 분석 row를 UPDATE하여 최신값으로 덮어쓰지 않는다.

RULE 5
매 분석마다 새 channel_analysis_runs row를 INSERT한다.

RULE 6
영상 데이터도 analysis_run_id 단위 snapshot으로 저장한다.

RULE 7
최근 5/10/20개는 publishedAt 기준이다.

RULE 8
최고영상/최고3개는 viewCount 기준이다.

RULE 9
좋아요/댓글 값이 없으면 0으로 간주하지 않고 NULL로 저장한다.

RULE 10
한글 handle은 화면 표시 시 decode하여 한글로 보여준다.
```

---

# 38. 공식 API 참고

본 PRD는 YouTube Data API v3 공개 문서를 기준으로 작성한다.

- Channels resource  
  https://developers.google.com/youtube/v3/docs/channels

- Channels: list  
  https://developers.google.com/youtube/v3/docs/channels/list

- PlaylistItems: list  
  https://developers.google.com/youtube/v3/docs/playlistItems/list

- Videos resource  
  https://developers.google.com/youtube/v3/docs/videos

- Videos: list  
  https://developers.google.com/youtube/v3/docs/videos/list

- Quota calculator  
  https://developers.google.com/youtube/v3/determine_quota_cost

---

# 39. 최종 MVP 결과 화면 요약

사용자가 여러 URL을 입력하면 최종적으로 아래 형태의 비교표를 얻는다.

```text
┌─────────┬─────────────┬──────┬────────┬──────────────┬──────────┬────────────┬──────────┬──────────┬──────────┬──────────────┬──────┐
│ 채널명  │ 채널주소    │ 영상 │ 구독자 │ 최고조회영상 │ 최고조회 │ 최고1 제외 │ 최근5평균│ 최근10평균│ 최근20평균│ 최고3 제외   │ 상세 │
├─────────┼─────────────┼──────┼────────┼──────────────┼──────────┼────────────┼──────────┼──────────┼──────────┼──────────────┼──────┤
│ 채널 A  │ @채널A      │ 382  │ 124만  │ 영상제목 ↗   │ 1,320만  │ 83,211     │ 42,332   │ 38,221   │ 35,102   │ 61,440       │ 더보기│
│ 채널 B  │ @채널B      │ 94   │ 21만   │ 영상제목 ↗   │ 310만    │ 41,090     │ 29,811   │ 28,011   │ 25,921   │ 33,119       │ 더보기│
└─────────┴─────────────┴──────┴────────┴──────────────┴──────────┴────────────┴──────────┴──────────┴──────────┴──────────────┴──────┘
```

`더보기`:

```text
채널 A - 최근 영상 30개

1. 영상 제목 ↗     조회 42,100   좋아요 1,200   댓글 91
2. 영상 제목 ↗     조회 31,830   좋아요   882   댓글 44
3. 영상 제목 ↗     조회 27,102   좋아요   711   댓글 36
...
```

이 구조를 MVP의 기준 사양으로 한다.
