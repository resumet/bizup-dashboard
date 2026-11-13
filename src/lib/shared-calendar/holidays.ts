import { getHolidayPreset } from "@hyunbinseo/holidays-kr";

export type KoreanHolidayMap = Record<string, string[]>;

const presetCache = new Map<string, Promise<KoreanHolidayMap>>();

function loadHolidayPreset(year: string) {
  const cached = presetCache.get(year);
  if (cached) return cached;

  const preset = getHolidayPreset(year)
    .then((holidays) => holidays as KoreanHolidayMap)
    .catch((error: unknown) => {
      // Official holiday presets are published year by year. Keep the calendar
      // usable when a future year's preset has not been released yet.
      if (error instanceof RangeError) return {};
      throw error;
    });
  presetCache.set(year, preset);
  return preset;
}

export async function koreanHolidaysForDates(dates: readonly string[]): Promise<KoreanHolidayMap> {
  const dateSet = new Set(dates);
  const years = [...new Set(dates.map((date) => date.slice(0, 4)).filter((year) => /^\d{4}$/u.test(year)))];
  const presets = await Promise.all(years.map(loadHolidayPreset));
  const holidays: KoreanHolidayMap = {};

  for (const preset of presets) {
    for (const [date, names] of Object.entries(preset)) {
      if (dateSet.has(date)) holidays[date] = names;
    }
  }

  return holidays;
}
