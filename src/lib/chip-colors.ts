export function distinctChipColors(keys: string[]) {
  const unique = [...new Set(keys)].sort((a, b) => a.localeCompare(b, "ko"));
  return new Map(unique.map((key, index) => {
    const hue = (index * 360) / unique.length;
    return [key, {
      borderColor: `hsl(${hue} 62% 70%)`,
      backgroundColor: `hsl(${hue} 75% 95%)`,
      color: `hsl(${hue} 52% 28%)`,
    }];
  }));
}
