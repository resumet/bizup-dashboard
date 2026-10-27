"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, Copy, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildWebinarInformationShareText,
  type WebinarInformation,
} from "@/lib/webinar-information/model";

type LiveVideoOption = {
  name: string;
  videoUrl: string;
  note: string;
};

type Props = {
  courseId: string;
  courseName: string;
  instructorName: string;
  cohort: string;
  initialInformation: WebinarInformation;
  liveVideos: LiveVideoOption[];
};

const NO_OPENING_VIDEO = "__none__";

export function WebinarInformationEditor({
  courseId,
  courseName,
  instructorName,
  cohort,
  initialInformation,
  liveVideos,
}: Props) {
  const [draft, setDraft] = useState(initialInformation);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const openingVideoOptions = useMemo(() => {
    const options = [...liveVideos];
    if (
      draft.openingVideoUrl &&
      !options.some((video) => video.videoUrl === draft.openingVideoUrl)
    ) {
      options.unshift({
        name: "현재 저장된 영상",
        videoUrl: draft.openingVideoUrl,
        note: "",
      });
    }
    return options;
  }, [draft.openingVideoUrl, liveVideos]);

  const selectedOpeningVideo = openingVideoOptions.find(
    (video) => video.videoUrl === draft.openingVideoUrl,
  );

  function updateField<Key extends keyof WebinarInformation>(
    key: Key,
    value: WebinarInformation[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setCopied(false);
    setMessage("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/course-operations/${encodeURIComponent(courseId)}/webinar-information`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json().catch(() => ({})) as {
        information?: WebinarInformation;
        message?: string;
      };
      if (!response.ok || !result.information) {
        throw new Error(result.message || "웨비나 정보를 저장하지 못했습니다.");
      }
      setDraft(result.information);
      setMessage("저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "웨비나 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function copySummary() {
    setMessage("");
    setError("");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("이 브라우저에서는 클립보드 복사를 지원하지 않습니다.");
      }
      await navigator.clipboard.writeText(buildWebinarInformationShareText(draft, {
        courseName,
        instructorName,
        cohort,
        openingVideoName: selectedOpeningVideo?.name,
      }));
      setCopied(true);
      setMessage("웨비나 정보를 복사했습니다.");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "복사하지 못했습니다.");
    }
  }

  return (
    <form onSubmit={save}>
      <Card className="mx-auto max-w-5xl">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>공유 정보</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={copySummary}>
                {copied ? <Check /> : <Copy />}
                {copied ? "복사됨" : "공유용 텍스트 복사"}
              </Button>
              <Button type="submit" disabled={saving}>
                <Save />
                {saving ? "저장 중" : "저장"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 py-2 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="course-materials-link">교안 링크</Label>
            <Input
              id="course-materials-link"
              type="url"
              inputMode="url"
              maxLength={2_048}
              placeholder="https://"
              value={draft.courseMaterialsLink}
              onChange={(event) => updateField("courseMaterialsLink", event.target.value)}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="opening-video">초반 틀어줄 유튜브 영상 링크</Label>
            <Select
              value={draft.openingVideoUrl || NO_OPENING_VIDEO}
              onValueChange={(value) => updateField(
                "openingVideoUrl",
                value === NO_OPENING_VIDEO ? "" : value,
              )}
            >
              <SelectTrigger id="opening-video" className="w-full">
                <SelectValue placeholder="기존 라이브 영상에서 선택" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={NO_OPENING_VIDEO}>선택 안 함</SelectItem>
                {openingVideoOptions.map((video) => (
                  <SelectItem key={video.videoUrl} value={video.videoUrl}>
                    {video.name || video.videoUrl}{video.note ? ` · ${video.note}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="youtube-title">유튜브 제목</Label>
            <Input
              id="youtube-title"
              maxLength={200}
              placeholder="후킹 가득한 제목을 지정해주세요."
              value={draft.youtubeTitle}
              onChange={(event) => updateField("youtubeTitle", event.target.value)}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="youtube-description">유튜브 설명</Label>
            <Textarea
              id="youtube-description"
              className="min-h-28 resize-y"
              maxLength={5_000}
              value={draft.youtubeDescription}
              onChange={(event) => updateField("youtubeDescription", event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="command-deck-url">지령창</Label>
            <Input
              id="command-deck-url"
              type="url"
              inputMode="url"
              maxLength={2_048}
              placeholder="https://docs.google.com/presentation/..."
              value={draft.commandDeckUrl}
              onChange={(event) => updateField("commandDeckUrl", event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="youtube-live-url">유튜브 라이브 링크</Label>
            <Input
              id="youtube-live-url"
              type="url"
              inputMode="url"
              maxLength={2_048}
              placeholder="유튜브 라이브 링크를 넣어주세요"
              value={draft.youtubeLiveUrl}
              onChange={(event) => updateField("youtubeLiveUrl", event.target.value)}
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="banner-storage-url">배너 저장소</Label>
            <Input
              id="banner-storage-url"
              type="url"
              inputMode="url"
              maxLength={2_048}
              placeholder="가로 배너, 동영상, 가격표 등이 포함된 드라이브 링크를 넣어주세요"
              value={draft.bannerStorageUrl}
              onChange={(event) => updateField("bannerStorageUrl", event.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="min-h-14 justify-end">
          <p
            className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
            role={error ? "alert" : "status"}
            aria-live="polite"
          >
            {error || message}
          </p>
        </CardFooter>
      </Card>
    </form>
  );
}
