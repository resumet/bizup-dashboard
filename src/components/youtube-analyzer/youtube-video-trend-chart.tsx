"use client";

import type { Video } from "@/lib/youtube-analyzer/model";

type YoutubeVideoTrendChartProps = {
  videos: Video[];
  compact?: boolean;
};

const number = (value: number) => Math.round(value).toLocaleString("ko-KR");

export function YoutubeVideoTrendChart({ videos, compact = false }: YoutubeVideoTrendChartProps) {
  const recent = [...videos]
    .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.id.localeCompare(right.id))
    .slice(-50);
  if (!recent.length) return <p className={compact ? "text-xs text-muted-foreground" : "py-12 text-center text-sm text-muted-foreground"}>표시할 최근 영상이 없습니다.</p>;

  const values = recent.map((video) => video.views);
  const maximum = Math.max(...values, 1);
  const width = 320;
  const height = compact ? 46 : 176;
  const padding = compact ? 3 : 14;
  const points = values.map((value, index) => {
    const x = recent.length === 1 ? width / 2 : (index / (recent.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - (value / maximum) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return <div className={compact ? "min-w-40" : "rounded-xl border bg-muted/20 p-4"}>
    {!compact ? <div className="mb-4 flex items-baseline justify-between gap-3"><div><p className="font-semibold">최근 영상 50개 조회수 변화</p><p className="mt-1 text-xs text-muted-foreground">게시일 순서 · 최고 {number(maximum)}회</p></div><span className="text-sm font-medium tabular-nums">{recent.length}개</span></div> : null}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`최근 영상 ${recent.length}개의 조회수 변화 그래프`} className="block h-auto w-full overflow-visible">
      {!compact ? <><line x1={padding} x2={width - padding} y1={padding} y2={padding} className="stroke-border" strokeDasharray="3 4" /><line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="stroke-border" /></> : null}
      <polyline points={points} fill="none" className="stroke-primary" strokeWidth={compact ? 2.5 : 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {!compact ? recent.map((video, index) => {
        const [x, y] = points.split(" ")[index].split(",");
        return <circle key={video.id} cx={x} cy={y} r="3.5" className="fill-primary stroke-background" strokeWidth="2"><title>{`${video.title}: ${number(video.views)}회`}</title></circle>;
      }) : null}
    </svg>
    {!compact ? <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{new Date(recent[0].publishedAt).toLocaleDateString("ko-KR")}</span><span>{new Date(recent.at(-1)!.publishedAt).toLocaleDateString("ko-KR")}</span></div> : null}
  </div>;
}
