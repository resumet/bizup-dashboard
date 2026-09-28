export const TEMPORARY_COURSE_BANNER_WIDTH = 1600;
export const TEMPORARY_COURSE_BANNER_HEIGHT = 900;

export type TemporaryCourseBannerInput = {
  title: string;
  instructorName: string;
  webinarDate: string;
};

export function normalizeTemporaryCourseBannerInput(
  input: TemporaryCourseBannerInput,
) {
  const title = input.title.trim();
  const instructorName = input.instructorName.trim();
  const webinarDate = input.webinarDate.trim();

  if (!title) throw new Error("강의명을 먼저 입력해 주세요.");
  if (!instructorName) throw new Error("강사명을 먼저 입력해 주세요.");
  if (!webinarDate) throw new Error("웨비나 날짜를 먼저 입력해 주세요.");

  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(webinarDate);
  if (!match) throw new Error("웨비나 날짜 형식이 올바르지 않습니다.");

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error("웨비나 날짜 형식이 올바르지 않습니다.");
  }

  return {
    title,
    instructorName,
    webinarDate: `${year}년 ${Number(month)}월 ${Number(day)}일`,
  };
}

export function wrapTemporaryBannerText(
  text: string,
  maxWidth: number,
  measureText: (value: string) => number,
) {
  const lines: string[] = [];
  let line = "";

  for (const character of Array.from(text)) {
    const candidate = `${line}${character}`;
    if (line && measureText(candidate) > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line.trim());
  return lines;
}

export async function createTemporaryCourseBannerFile(
  input: TemporaryCourseBannerInput,
) {
  const content = normalizeTemporaryCourseBannerInput(input);
  const canvas = document.createElement("canvas");
  canvas.width = TEMPORARY_COURSE_BANNER_WIDTH;
  canvas.height = TEMPORARY_COURSE_BANNER_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("임시 배너 제작을 지원하지 않는 브라우저입니다.");

  context.fillStyle = "#071b4a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#facc15";
  context.textAlign = "center";
  context.textBaseline = "top";

  const fontFamily = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  let titleFontSize = 96;
  let titleLines: string[] = [];
  do {
    context.font = `800 ${titleFontSize}px ${fontFamily}`;
    titleLines = wrapTemporaryBannerText(
      content.title,
      1320,
      (value) => context.measureText(value).width,
    );
    if (titleLines.length <= 3) break;
    titleFontSize -= 4;
  } while (titleFontSize > 48);

  if (titleLines.length > 3) {
    titleLines = titleLines.slice(0, 3);
    let lastLine = titleLines[2];
    while (
      lastLine.length > 1 &&
      context.measureText(`${lastLine}…`).width > 1320
    ) {
      lastLine = Array.from(lastLine).slice(0, -1).join("");
    }
    titleLines[2] = `${lastLine.trimEnd()}…`;
  }

  const titleLineHeight = Math.round(titleFontSize * 1.22);
  const instructorFontSize = 52;
  const dateFontSize = 42;
  const titleHeight = titleLines.length * titleLineHeight;
  const titleToInstructorGap = 62;
  const instructorLineHeight = 66;
  const instructorToDateGap = 20;
  const dateLineHeight = 54;
  const contentHeight =
    titleHeight +
    titleToInstructorGap +
    instructorLineHeight +
    instructorToDateGap +
    dateLineHeight;
  let y = (canvas.height - contentHeight) / 2;

  context.font = `800 ${titleFontSize}px ${fontFamily}`;
  for (const line of titleLines) {
    context.fillText(line, canvas.width / 2, y);
    y += titleLineHeight;
  }

  y += titleToInstructorGap;
  context.font = `700 ${instructorFontSize}px ${fontFamily}`;
  context.fillText(content.instructorName, canvas.width / 2, y);

  y += instructorLineHeight + instructorToDateGap;
  context.font = `600 ${dateFontSize}px ${fontFamily}`;
  context.fillText(content.webinarDate, canvas.width / 2, y);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new Error("임시 배너 이미지를 만들지 못했습니다.");

  return new File([blob], `temporary-course-banner-${input.webinarDate}.png`, {
    type: "image/png",
  });
}
