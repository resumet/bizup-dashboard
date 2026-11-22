export function contrastingColorStyle(backgroundColor: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(backgroundColor.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return { backgroundColor, color: blackContrast >= whiteContrast ? "#000000" : "#ffffff" };
}
