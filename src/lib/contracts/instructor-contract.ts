import type { CourseDocumentBlock, RichTextNode } from "@/lib/course-documents/types";

export type InstructorContractValues = {
  instructorName: string;
  lectureName: string;
  instagramNumberOfReels: string;
  instagramValueOfReels: string;
  startDate: string;
  durationYears: number;
  address: string;
  phone: string;
  email: string;
};

export type InstructorContractSection = {
  title: string;
  paragraphs: string[];
};

export type LegacyInstructorContractTemplate = {
  introduction: string;
  sections: InstructorContractSection[];
};

export type InstructorContractTemplate = {
  version: 2;
  content: CourseDocumentBlock[];
};

export const COMPANY_CONTRACT_DETAILS = {
  name: "주식회사 비즈업클래스",
  address: "서울특별시 강남구 테헤란로 25길 6-9, 석암빌딩 4층 409호",
  representative: "권정인",
} as const;

export function getKoreanDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function getContractEndDate(startDate: string, durationYears: number) {
  const date = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + Math.max(1, durationYears || 1));
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const LEGACY_DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE: LegacyInstructorContractTemplate = {
  introduction: "㈜비즈업클래스(이하 “회사”라 한다)와 {{instructorName}} (이하 “강사”라 한다) 간에 강의 모객 관련 협의 계약을 체결하고 상호존중의 입장에서 신의에 따라 성실히 계약상의 의무를 이행하고 완수할 것을 확약하며 계약의 증거로서 이 계약서를 2부 작성하여 각각 서명 날인한 후 “회사”와 “강사” 각 1부씩 보관한다.",
  sections: [
  {
    title: "제1조 (계약의 목적)",
    paragraphs: [
      "강사[ {{instructorName}} ](이하 “강사”)는 (주)비즈업클래스(이하 “회사”)과 강의 모객 관련 협업해 서로가 요청하는 바를 신의 성실의 원칙에 따라 협조한다.",
    ],
  },
  {
    title: "제2조 (계약)",
    paragraphs: [
      "상기 명시된 기간은 교육훈련 시작일에 따라서 변동이 있을 수 있고, 상기 명시된 기간보다 종료일이 늦은 때에는 해당 일정을 교육훈련 종료일로 한다.",
      "본 계약에 의한 강의 주제 및 클래스 수는 다음과 같다.",
      "1. 주제 : {{lectureName}}",
      "2. 클래스 분량 : 최소 4회 (주 1회 2시간 분량) 이상",
      "3. 제작기한 : 강의 시작 전 1주일",
    ],
  },
  {
    title: "제3조 (강사의 역할과 의무)",
    paragraphs: [
      "“강사”는 강의 마케팅에 협조하고 충실한 강의 준비와 수강생 질문에 대한 성실한 답변, 미션 과제에 대한 피드백 등의 역할을 수행한다. “강사”는 강의에 사용할 강의자료와 참고/실습자료를 강의시작일 최소 7일전까지 “회사”에 전달해야 한다. 회사는 이를 활용한 교재를 제작해 수강생에 배포할 수 있다.",
      "“강사”는 “회사”에 제공한 콘텐츠가 본인 고유의 것이며 정확성과 신뢰성을 담보하고 이에 대한 이의제기에 법적 책임을 진다. “강사”가 자체 생산하지 않은 자료를 포함할 경우, 반드시 출처를 표기한다. 타인의 고유한 저작물의 권리를 침해할 경우 “회사”는 “강사”에 책임을 물을 수 있다.",
      "“강사”는 강의시작 최소 10분 전까지 지정 강의장에 도작해야 하며 “회사”와 사전 협의 없이 강의를 일방 취소할 수 없다. 부득이한 사정이 있을 경우 최소 3영업일 이전에 “회사”에 알리고 대안을 협의한다 이를 지키지 않을 시 손해에 대한 책임을 물을 수 있다.",
      "“회사”가 강의자료나 내용에 대해 개선을 요청할 경우 이에 성실하게 응해야 한다. 강의와 관련된 수강생의 질문에 답변 가능한 범위 내에서 성실하게 답변한다.",
      "“강사”는 “회사”와 협의에 따라 본인의 SNS 채널 기반 마케팅에 협조하고 필요할 시 수강생과의 소통을 활성화하기 위한 오픈채팅방 등 운영을 지원한다.",
      "계약 기간 (광고 집행, 강의 결제 ~ 1강 전까지) 중에는 타 플랫폼 및 개인적인 강의 모집이 불가능 하다.",
      "이미 촬영된 VOD 및 전자책을 취급하는 타 플랫폼의 경우, 해당 기간 동의 광고송출을 금지하여야 한다.",
      "“강사”가 본 항을 위반하여 계약 기간 중 타 플랫폼을 통하여 동종 강의를 모집하거나 진행하는 경우, 타 플랫폼을 통하여 발생한 매출액을 “회사”에 손해배상금으로 지급한다.",
      "“회사”는 교육과정을 위해 선정, 강의에 임한 강사 중, 다음 각호에 해당되어 부적격하다고 판단되는 자는 즉시 교체해야 한다.",
      "1. 약정된 교육기간 동안 교육생들에게 성실히 임하지 않은 자",
      "2. 교육기간 중, 강사의 자질부족이나 불성실한 교육진행으로 인해 소기의 목적을 달성하지 못한다고 판단되거나 교육생으로부터 불만이 제기된 자",
      "기타 “회사”가 강사로서의 자질이 부족하다고 판단한 자",
    ],
  },
  {
    title: "제4조 (회사의 역할과 의무)",
    paragraphs: [
      "회사는 오프라인 강의 기획, 강의장소 제공, 수강생 관리, 홍보 및 마케팅, 수강료 정산 및 교육에 필요한 제반 환경을 책임지고 제공한다. 회사는 양질의 강의 진행을 위해 콘텐츠 기획 과정에서 강사와 긴밀히 협의하고 강의를 위한 장소 및 장비 일제를 제공하며 강의 진행을 위해 필요한 모든 제반사항을 책임진다.",
      "회사는 강사의 역량을 강화하고 콘텐츠의 질을 높이기 위해 강의 만족도 조사, 강사 지원, 수강생 피드백 등을 성실히 제공한다. 또 강사의 강의 관련 요청을 운영에 적극 반영한다.",
      "회사는 강사와 동반 성장을 위해 강의 런칭 이후 지속적인 온라인과 오프라인 콘텐츠 기획과 협업, 마케팅을 진행하고 협의를 통해 강사의 활동을 가능한 범위 내에서 적극 지원한다.",
      "회사는 강사의 콘텐츠를 보호하기 위해 수강생의 강의 도용, 복제, 무단배포 등이 발생하지 않도록 주의를 고지하고 문제 발생시 해결을 위해 적극 협조한다.",
    ],
  },
  {
    title: "제5조 (지식재산권)",
    paragraphs: [
      "본 계약 체결 이전 회사와 강사가 보유하고 있었던 교재, 교육과정 관련 정보 등의 지식재산권은 각 당사자에게 있다. 단, 본 계약 수행을 위하여 추가 또는 수정 작성된 부분은 강사 와 회사가 함께 가진다.",
      "강사가 제공한 교재 및 강의자료 이외의 교육자료(외부자료, 실습소스 등)를 사용하는 경우, 강사는 그 자료가 제 3자의 저작권 등 지식 재산권을 침해하지 않음을 보증한다. 만약 제공한 콘텐츠 등이 제3자의 특허권, 저작권 등 지적재산권을 침해하였다는 이유로 제3자가 \"회 사\"를 상대로 클레임을 제기할 경우 \"강사\"는 \"회사\"를 방어하고 면책하여야 한다.",
      "전 2항에서 \"회사\"가 먼저 지식재산권 침해 클레임의 방어를 위해 조치를 취할 경우 \"강사\"는 \"회사\"가 지출한 제반 비용(변호사 비용 포함) 및 손해를 사전에 협의된 정산비율에 따라 강사가 가져가는 매출 비율만큼 배상하여야 한다.",
      "강의 영상에 대한 권리는 강사와 회사가 함께 가진다. 강사와 회사는 해당 영상을 강의 마케팅 용도를 제외하고는 사전 협의 없이 임의로 사용할 수 없다.",
      "회사와 강사가 사전에 협의한 기간 내에는 강사가 임의로 강의를 중지시킬 수 없다. 기간 조정이 필요할 경우 반드시 상호 협의를 거친다.",
      "회사는 판매 촉진을 목적으로 한 마케팅 활동의 일환으로 강사가 업로드한 소개글, 이미지, 강의 일부 미리보기 등을 강사의 별도 동의 없이 사용할 수 있다. 회사가 사용하는 행위에는 해당 콘텐츠를 제 3의 플랫폼에 업로드하거나 2자 가공해 배포하는 것도 포함된다.",
    ],
  },
  {
    title: "제6조 (부정이용 금지 및 위약벌)",
    paragraphs: [
      "회사는 다음 각호에 해당하는 경우 부정 이용 행위로 본다.",
      "1. 광고 또는 홍보를 목적으로 완결성 없는 강의 콘텐츠를 제공하는 행위",
      "2. 유사과학, 극단적 종교 및 정치사상, 혐오 등의 내용을 제공하는 행위",
      "3. 회사 서비스에 대해 사실과 다른 내용을 유포, 적시하는 명예훼손 행위",
      "4. 반사이익을 목적으로 회사 내 타 강의를 부정적으로 묘사하는 행위",
      "5. 수강생의 계정과 비밀번호 등 개인정보를 물어보는 행위",
      "6. 특정 고객에게 가격 차등이나 무료제공을 요청하는 행위",
      "7. 강사의 잘못으로 이미지가 실추돼 회사 신뢰를 떨어뜨리는 행위",
      "위에 언급된 부정행위를 회사가 확인한 경우, 1차 시정 권고하고 받아들여지지 않을 경우 2차로 지급 전 수익 분배분을 회사가 즉시 징수할 수 있으며 강의를 임의로 폐쇄하고 계약을 파기, 이에 대한 책임을 물을 수 있다. 강의 폐쇄에 따른 수강료 배상에 대한 책임도 강사에게 귀속된다.",
      "위 모든 조지는 강사에 사전 통보 후 진행되며 이의가 있는 경우 강사는 법률대리인을 통해 이를 회사에 소명할 수 있다.",
    ],
  },
  {
    title: "제7조 (정산 방법)",
    paragraphs: [
      "강사료는 클래스 판매 매출의 [ 50 ] %를 지급한다. 개별 강의 판매량과 매출 총액 등 정보는 매월 정산일에 강사에 고지하며 정산은 해당 강의가 모두 종료된 달의 익월 10일에 진행한다. 수익배분 비율은 위를 원칙으로 하되 회사와 강사 간 협의를 거쳐 추가 조정할 수 있다.",
      "판매 매출은 고객이 해당 강의에 지불한 수업료의 총액을 의미한다. 단, 해당 매출은 결제플랫폼, 카드수수료 및 프로모션 비용을 뺀 금액으로 산정한다.",
      "고객이 구매한 강의를 판매 약관에 따라 환불할 경우 정산금액에서 제외한다. 이미 정산 이 완료된 후에 환불이 발생할 경우, 환불된 금액의 계약된 비율만큼 회사가 요청한 계좌로 반환한다. 반환한 금액은 환불이 확정된 날로부터 1주일 이내에 반환되어야 한다.",
      "아래 2가지 항목에 대해선 제외 후 정산한다. (사전 협의시)",
      "- 정산시 “회사”가 협업하고 있는 유튜브 채널을 통해 발생된 매출 20%",
      "- 정산시 “회사”가 협업하고 있는 인플루언서를 통해 발생된 매출 25%",
      "- 정산시 광고를 집행한 금액의 50%",
    ],
  },
  {
    title: "제8조 (강사료 대금 지급 방식)",
    paragraphs: [
      "강사료는 강사가 지정한 통장으로 지급한다.",
      "개인일 경우 사업소득의 형태로 원천세 3.3%를 차감한다. 지속적인 강의 소득이 아닌 일회성 행사 출연이 있을 경우 개인은 기타소득의 형태로 원천세 8.8%를 차감한다.",
      "사업자일 경우, 제8조에서 산정한 금액을 세금계산서 총액 기준(vat포함)으로 지급한다.",
      "강사는 대금을 (세금계산서 첨부) 회사에게 청구하며, 회사는 제7조에서 정한 일자에 현금으로 지급한다. 단, 상호 간의 별도 협의가 있는 경우 그 내용을 따른다.",
    ],
  },
  {
    title: "제9조 (비밀유지 의무 등)",
    paragraphs: [
      "회사와 강사는 본 계약의 체결과 이행 과정에서 알게 된 상대방에 대한 일체의 정보를 상대방의 사전 서면 동의 없이 제3자에게 공개, 유출, 제공하거나 본계약 이외의 목적으로 사용할 수 없다. 계약의 종료 또는 해지 이후에도 본 조의 의무를 부담하며 단, 다음 각호의 경우에는 그러하지 아니한다.",
      "상대방에 의해 공개 또는 제공받은 시점에서 항상 공지되고 있는 정보",
      "상대방에 의해 공개 또는 제공받은 후에 자기책임에 의하지 않고, 공지된 정보",
      "회사 또는 강사가 제3자로부터 정당하게 공개 또는 제공받은 정보",
      "법령 또는 법원 기타 정부기관의 명령에 의해 공개 또는 제공이 의무인 정보",
      "회사와 강사는 본 계약과 관련하여 수집하거나 상대방으로부터 제공받은 모든 자료를 본 계약 종료 후 상대방에게 즉시 반환하거나 상대방의 요청에 따라 폐기한다.",
    ],
  },
  {
    title: "제10조 (손해배상책임)",
    paragraphs: [
      "회사와 강사 중 어느 일방이 본 계약에 규정된 의무를 이행하지 않거나 본 계약을 위반하여 상대방에게 손해가 발생한 경우 그 행위를 야기한 당사자는 그러한 불이행 및 위반행위에 대해 전적으로 책임을 지며, 그에 따른 손해를 배상함과 동시에 상대방의 손해를 최소화하기 위하여 합리적으로 요구되는 적절한 조치를 취해야 한다.",
    ],
  },
  {
    title: "제11조 (계약의 변경 또는 계약 해지)",
    paragraphs: [
      "본 계약은 향후 계약내용 변경이 불가피한 사유 발생 시 \"회사\" 또는 \"강사\" 일방의 요청이 있을 경우 상호간 합의하여 계약의 전부 또는 일부를 변경할 수 있으며, 그 변경내용 및 시기는 상호가 협의하여 결정한다.",
      "\"회사\" 또는 \"강사\"는 다음 각 호의 1에 해당하는 경우에는 언제든지 당사자 일방은 상대방에 서면으로 통지하여 본 계약을 해지할 수 있다.",
      "당사자 일방이 정당한 사유 없이 본 계약상의 의무를 이행하지 아니한 경우",
      "당사자 일방의 고의 또는 과실 등으로 인하여 상대방에게 손해가 발생한 경우",
      "당사자 일방이 일방적으로 본 계약을 위반하거나 이를 불완전하게 이행하고 있는 경우",
      "\"강사\"가 압류, 가압류, 가처분, 경매, 체납처분 등을 당하거나 파산, 회생, 해산, 청산, 부도 등의 신청을 당하거나 스스로 신청하는 경우",
      "\"회사\"의 경영상의 이유, 관련 법률의 개정 또는 감독기관의 지시 등으로 계약 이행이 불가할 경우",
    ],
  },
  {
    title: "제12조 (계약의 해석 및 보완)",
    paragraphs: [
      "양 당사자는 본 계약의 내용을 신의성실에 의거하여 준수하여야 한다.",
      "본 계약서에서 명시되지 않은 부분이나 해석에 이견이 있을 시 회사와 강사는 사회 통념과 조리에 맞게 충분한 합의를 거쳐 해결한다.",
    ],
  },
  {
    title: "제13조 (분쟁의 해결)",
    paragraphs: [
      "본 계약과 관련하여 분쟁 발생시 계약 당사자 쌍방의 합의에 의하여 해결한다.",
      "전 1항의 합의가 성립하지 못한 때의 계약에 관한 소송은 “회사” 소재 관할법원으로 한다.",
    ],
  },
  ],
};

function contractBlockId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function textNode(text: string, bold = false): RichTextNode {
  return {
    type: "text",
    text,
    ...(bold ? { marks: [{ type: "bold" as const }] } : {}),
  };
}

function paragraphNode(text = "", bold = false): RichTextNode {
  return {
    type: "paragraph",
    ...(text ? { content: [textNode(text, bold)] } : {}),
  };
}

function tableCell(lines: Array<{ text: string; bold?: boolean }>): RichTextNode {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: lines.map((line) => paragraphNode(line.text, line.bold)),
  };
}

function tableRow(cells: RichTextNode[]): RichTextNode {
  return { type: "tableRow", content: cells };
}

function circledNumber(index: number) {
  return index < 20 ? String.fromCodePoint(0x2460 + index) : `${index + 1}.`;
}

export function legacyInstructorContractTemplateToContent(
  template: LegacyInstructorContractTemplate,
): CourseDocumentBlock[] {
  let blockIndex = 0;
  const nextId = () => contractBlockId(blockIndex += 1);
  const content: CourseDocumentBlock[] = [
    { id: nextId(), type: "heading1", content: "비즈업클래스 강사 계약서" },
    { id: nextId(), type: "paragraph", content: template.introduction },
  ];

  const summaryId = nextId();
  content.push({
    id: summaryId,
    type: "rich_text",
    content: {
      type: "table",
      attrs: { blockId: summaryId },
      content: [
        tableRow([
          tableCell([{ text: "계약기간", bold: true }]),
          tableCell([{ text: "{{contractPeriod}}" }]),
        ]),
        tableRow([
          tableCell([{ text: "강의명", bold: true }]),
          tableCell([{ text: "{{lectureName}}" }]),
        ]),
      ],
    },
  });

  for (const section of template.sections) {
    content.push({ id: nextId(), type: "heading2", content: section.title });
    for (const [paragraphIndex, paragraph] of section.paragraphs.entries()) {
      content.push({
        id: nextId(),
        type: "paragraph",
        content: `${circledNumber(paragraphIndex)} ${paragraph}`,
      });
    }
  }

  const signatureId = nextId();
  content.push({
    id: signatureId,
    type: "rich_text",
    content: {
      type: "table",
      attrs: { blockId: signatureId },
      content: [
        tableRow([
          tableCell([
            { text: "“회사”", bold: true },
            { text: "상호 {{companyName}}" },
            { text: "주소 {{companyAddress}}" },
            { text: "대표이사 {{companyRepresentative}} (인)" },
          ]),
          tableCell([
            { text: "“강사”", bold: true },
            { text: "성명 {{instructorName}} (인)" },
            { text: "주소 {{address}}" },
            { text: "전화번호 {{phone}}" },
            { text: "이메일 {{email}}" },
          ]),
        ]),
      ],
    },
  });

  return content;
}

export const DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE: InstructorContractTemplate = {
  version: 2,
  content: legacyInstructorContractTemplateToContent(LEGACY_DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE),
};

function displayContractValue(value: string, fallback: string) {
  return value.trim() || fallback;
}

export function replaceInstructorContractVariables(
  text: string,
  values: InstructorContractValues,
) {
  const endDate = getContractEndDate(values.startDate, values.durationYears);
  const startDate = getKoreanDate(values.startDate) || "시작일 입력 예정";
  const formattedEndDate = getKoreanDate(endDate) || "종료일 입력 예정";
  const replacements: Record<string, string> = {
    instructorName: displayContractValue(values.instructorName, "강사명"),
    lectureName: displayContractValue(values.lectureName, "강의명"),
    instagram_number_of_reels: displayContractValue(values.instagramNumberOfReels, "입력 예정"),
    instagram_value_of_reels: displayContractValue(values.instagramValueOfReels, "입력 예정"),
    startDate,
    endDate: formattedEndDate,
    contractPeriod: `${startDate} ~ ${formattedEndDate} (${values.durationYears || 1}년간)`,
    durationYears: String(values.durationYears || 1),
    address: displayContractValue(values.address, "입력 예정"),
    phone: displayContractValue(values.phone, "입력 예정"),
    email: displayContractValue(values.email, "입력 예정"),
    companyName: COMPANY_CONTRACT_DETAILS.name,
    companyAddress: COMPANY_CONTRACT_DETAILS.address,
    companyRepresentative: COMPANY_CONTRACT_DETAILS.representative,
  };

  return text.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/gu, (token, key: string) => replacements[key] ?? token);
}

function replaceNodeVariables(node: RichTextNode, values: InstructorContractValues): RichTextNode {
  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (attrs) {
    for (const key of ["label", "alt", "title"] as const) {
      if (typeof attrs[key] === "string") {
        attrs[key] = replaceInstructorContractVariables(attrs[key], values);
      }
    }
  }
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(typeof node.text === "string"
      ? { text: replaceInstructorContractVariables(node.text, values) }
      : {}),
    ...(node.content
      ? { content: node.content.map((child) => replaceNodeVariables(child, values)) }
      : {}),
  };
}

export function renderInstructorContractTemplate(
  template: InstructorContractTemplate,
  values: InstructorContractValues,
): CourseDocumentBlock[] {
  return template.content.map((block): CourseDocumentBlock => {
    if (block.type === "heading1" || block.type === "heading2" || block.type === "paragraph") {
      return { ...block, content: replaceInstructorContractVariables(block.content, values) };
    }
    if (block.type === "unordered_list" || block.type === "ordered_list") {
      return {
        ...block,
        items: block.items.map((item) => replaceInstructorContractVariables(item, values)),
      };
    }
    if (block.type === "rich_text") {
      return { ...block, content: replaceNodeVariables(block.content, values) };
    }
    if (block.type === "image") {
      return { ...block, alt: replaceInstructorContractVariables(block.alt, values) };
    }
    if (block.type === "link" || block.type === "cta") {
      return { ...block, label: replaceInstructorContractVariables(block.label, values) };
    }
    return block;
  });
}
