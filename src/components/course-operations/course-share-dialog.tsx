"use client";

import Script from "next/script";
import { useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCourseShareSummary,
  COURSE_SHARE_SECTION_OPTIONS,
  truncateKakaoShareText,
  type CourseShareData,
  type CourseShareSection,
} from "@/lib/course-operations/share";

const DEFAULT_SECTIONS: CourseShareSection[] = ["schedule"];
const KAKAO_JAVASCRIPT_KEY =
  process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim() ?? "";
const KAKAO_SDK_URL =
  "https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js";

type KakaoSdk = {
  init: (javascriptKey: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (settings: {
      objectType: "text";
      text: string;
      link: { mobileWebUrl: string; webUrl: string };
      buttonTitle: string;
    }) => Promise<unknown> | void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

async function copyToClipboard(value: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("이 브라우저에서는 클립보드 복사를 지원하지 않습니다.");
  }
  await navigator.clipboard.writeText(value);
}

export function CourseShareDialog({ data }: { data: CourseShareData }) {
  const [open, setOpen] = useState(false);
  const [selectedSections, setSelectedSections] =
    useState<CourseShareSection[]>(DEFAULT_SECTIONS);
  const [sdkReady, setSdkReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const summary = buildCourseShareSummary(data, selectedSections);
  const kakaoSummary = truncateKakaoShareText(summary);
  const summaryWasTruncated = Array.from(summary).length > 200;

  function initializeKakaoSdk() {
    if (!KAKAO_JAVASCRIPT_KEY) return;
    try {
      if (!window.Kakao) throw new Error("카카오 SDK를 불러오지 못했습니다.");
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(KAKAO_JAVASCRIPT_KEY);
      }
      setSdkReady(window.Kakao.isInitialized());
    } catch (caught) {
      setSdkReady(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "카카오 SDK를 초기화하지 못했습니다.",
      );
    }
  }

  function toggleSection(section: CourseShareSection, checked: boolean) {
    setSelectedSections((current) =>
      checked
        ? [...new Set([...current, section])]
        : current.filter((item) => item !== section),
    );
    setNotice("");
    setError("");
  }

  async function copySummary(message = "요약문을 복사했습니다. 카톡에 붙여넣어 주세요.") {
    setNotice("");
    setError("");
    try {
      await copyToClipboard(summary);
      setNotice(message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "요약문을 복사하지 못했습니다.",
      );
    }
  }

  async function shareSummary() {
    setNotice("");
    setError("");
    if (!KAKAO_JAVASCRIPT_KEY) {
      setError("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY를 설정해 주세요.");
      return;
    }
    if (!sdkReady || !window.Kakao?.isInitialized()) {
      setError(
        "카카오 SDK가 준비되지 않았습니다. JavaScript 키와 허용 도메인을 확인해 주세요.",
      );
      return;
    }
    try {
      const pageUrl = window.location.href;
      await Promise.resolve(
        window.Kakao.Share.sendDefault({
          objectType: "text",
          text: kakaoSummary,
          link: {
            mobileWebUrl: pageUrl,
            webUrl: pageUrl,
          },
          buttonTitle: "강의 보기",
        }),
      );
      setNotice(
        summaryWasTruncated
          ? "PC 카카오톡 공유창을 열었습니다. 카카오 정책에 따라 공유문은 200자로 줄였습니다."
          : "PC 카카오톡 공유창을 열었습니다.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `카카오톡 공유 실패: ${caught.message}`
          : "카카오톡 공유창을 열지 못했습니다. 앱 키와 도메인 설정을 확인해 주세요.",
      );
    }
  }

  return (
    <>
      {KAKAO_JAVASCRIPT_KEY ? (
        <Script
          src={KAKAO_SDK_URL}
          strategy="afterInteractive"
          crossOrigin="anonymous"
          onReady={initializeKakaoSdk}
          onError={() => {
            setSdkReady(false);
            setError("카카오 SDK 파일을 불러오지 못했습니다.");
          }}
        />
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setNotice("");
            setError("");
          }
        }}
      >
      <DialogTrigger asChild>
        <Button
          type="button"
          className="min-h-10 border border-yellow-400 bg-yellow-300 text-slate-950 hover:bg-yellow-400 focus-visible:border-yellow-500 focus-visible:ring-yellow-500/40"
        >
          <MessageCircle />카톡 공유
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>강의 내용 카톡 공유</DialogTitle>
          <DialogDescription>
            공유할 섹션을 선택한 뒤 요약문을 확인하세요. PC 카카오톡의 친구 선택창이
            열리며 수강생 개인정보는 포함되지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">공유할 섹션</legend>
          {COURSE_SHARE_SECTION_OPTIONS.map((option) => {
            const checked = selectedSections.includes(option.value);
            return (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={`course-share-${option.value}`}
                  checked={checked}
                  onCheckedChange={(value) =>
                    toggleSection(option.value, value === true)
                  }
                />
                <Label
                  htmlFor={`course-share-${option.value}`}
                  className="cursor-pointer font-normal"
                >
                  {option.label}
                </Label>
              </div>
            );
          })}
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor="course-share-preview">공유 문구 미리보기</Label>
          <Textarea
            id="course-share-preview"
            className="h-72 min-h-72 max-h-72 resize-none overflow-y-auto field-sizing-fixed"
            readOnly
            value={summary}
          />
          <p className="text-xs text-muted-foreground">
            카카오 텍스트 메시지는 최대 200자입니다. 전체 내용은 문구 복사로 사용할 수
            있습니다.
          </p>
        </div>

        {!KAKAO_JAVASCRIPT_KEY ? (
          <p className="text-sm text-destructive" role="alert">
            PC 카카오톡 공유를 사용하려면 NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY 설정이
            필요합니다.
          </p>
        ) : null}

        {notice ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700" role="status">
            <Check className="size-4" />{notice}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={selectedSections.length === 0}
            onClick={() => copySummary()}
          >
            <Copy />문구 복사
          </Button>
          <Button
            type="button"
            disabled={selectedSections.length === 0 || !KAKAO_JAVASCRIPT_KEY}
            onClick={shareSummary}
          >
            <Share2 />카톡으로 공유
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
