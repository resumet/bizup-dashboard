import writeXlsxFile, { type Row } from "write-excel-file/node";

import { normalizeGeneratedMessage } from "@/lib/message-studio/link-policy";
import type {
  MessageStudioProject,
  MessageStudioResource,
} from "@/lib/message-studio/types";

export async function buildMessageStudioXlsx(
  project: MessageStudioProject,
  resources: MessageStudioResource[],
) {
  const metadata: Row[] = [
    [{ value: "강의명", fontWeight: "bold" }, { value: project.course_name }],
    [
      { value: "강사명", fontWeight: "bold" },
      { value: project.instructor_name },
    ],
    [
      { value: "강의 특징", fontWeight: "bold" },
      { value: project.course_features },
    ],
    [
      { value: "수강 대상", fontWeight: "bold" },
      { value: project.target_audience },
    ],
    [
      { value: "결제 링크", fontWeight: "bold" },
      { value: project.payment_link },
    ],
    [
      { value: "문의 링크", fontWeight: "bold" },
      { value: project.inquiry_link },
    ],
    [
      { value: "커리큘럼 링크", fontWeight: "bold" },
      { value: project.curriculum_link },
    ],
    [
      { value: "다시보기 링크", fontWeight: "bold" },
      { value: project.replay_link },
    ],
  ];
  const messages: Row[] = [
    [
      { value: "번호", fontWeight: "bold", backgroundColor: "#E8EEF9" },
      {
        value: "기존 리소스",
        fontWeight: "bold",
        backgroundColor: "#E8EEF9",
      },
      {
        value: "신규 AI 리소스",
        fontWeight: "bold",
        backgroundColor: "#E8EEF9",
      },
    ],
    ...resources
      .toSorted((a, b) => a.position - b.position)
      .map((resource): Row => [
        { value: resource.position },
        { value: resource.example_text, wrap: true },
        {
          value: normalizeGeneratedMessage(
            resource.position,
            resource.generated_text,
            project,
          ),
          wrap: true,
        },
      ]),
  ];
  return writeXlsxFile([
    {
      data: metadata,
      sheet: "강의정보",
      columns: [{ width: 18 }, { width: 80 }],
    },
    {
      data: messages,
      sheet: "문자30개",
      columns: [{ width: 8 }, { width: 70 }, { width: 70 }],
      stickyRowsCount: 1,
    },
  ]).toBuffer();
}
