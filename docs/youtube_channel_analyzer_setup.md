# YouTube Channel Analyzer Setup

## Configuration

1. Apply `supabase/migrations/202609230007_youtube_channel_analyzer.sql` and then `supabase/migrations/202609230008_youtube_channel_accumulation.sql` after the existing workspace migrations.
2. Enable YouTube Data API v3 in Google Cloud and configure `YOUTUBE_API_KEY` in the server environment. Restrict the key to YouTube Data API v3. Never use a `NEXT_PUBLIC_` prefix.
3. Optional settings: `MAX_URLS_PER_BATCH=50`, `MAX_CONCURRENT_CHANNELS=3`, `MAX_YOUTUBE_RETRIES=3`. Safety ceilings are 200 URLs, 5 simultaneous channels, and 5 retries.
4. The repository already integrates Vercel Workflow through `withWorkflow`. Deploy the application normally; collection runs through durable workflow steps, not a single request handler.

Entry point: `/services/youtube-channels`, also linked from the main page.

## Behavior

- Existing workspace membership controls access. Current channel and video tables expose SELECT only to members through RLS. Creation and updates use server-only service credentials.
- The list is cumulative and ordered by the time a channel was first analyzed. A new channel is appended; analyzing an existing channel updates that channel in place without changing its first-seen position.
- Every request fetches fresh API data. Different URLs for the same channel share one collection within that request.
- Every uploads-playlist page is fetched, video details are requested in groups of at most 50, and only public videos are counted.
- A channel and its current full-precision video collection are replaced atomically. An older overlapping job cannot overwrite a collection started later.
- Migration `202609230008` backfills each channel's latest legacy snapshot into the current-state tables. Legacy snapshot rows remain as an archive, but the application no longer reads or writes them.
- Custom `/c/` aliases are not guessed. Use a handle, canonical channel URL, or video URL instead.
- Browser refresh restores active request progress via `?batchId=...`; this does not filter or replace the cumulative channel list.
- Failed inputs remain visible without removing successful or previously analyzed channels. Quota exhaustion is not retried. Other transient errors use bounded exponential backoff.

## Verification

```powershell
npx tsx --conditions=react-server --test src/lib/youtube-analyzer/*.test.ts
node scripts/verify-youtube-analyzer.cjs
npm run build
```

The browser harness accepts `PLAYWRIGHT_PACKAGE_PATH` when Playwright is installed outside this repository. It uses mocked API responses and saves screenshots under `.cache/youtube-analyzer/`. Unit tests use mocked Google/Supabase responses; the database test uses an isolated PGlite instance. A live collection smoke test still requires a configured API key and both migrations applied to the target database.
