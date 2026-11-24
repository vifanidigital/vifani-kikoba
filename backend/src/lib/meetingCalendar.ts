const DAY = 86_400_000;
const EAT = 3 * 60 * 60 * 1000;

export function localDate(date: Date) {
  return new Date(date.getTime() + EAT).toISOString().slice(0, 10);
}

export function parseMeetingDate(value: string) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return null;
  const parsed = new Date(value + 'T00:00:00+03:00');
  return Number.isFinite(parsed.getTime()) && localDate(parsed) === value ? parsed : null;
}

export function meetingDayEnd(date: Date) {
  return new Date(date.getTime() + DAY);
}

export const meetingWeekday = (date: Date) => new Date(date.getTime() + EAT).getUTCDay();

export function historicalSchedule(start: Date, weekday: number, today: Date) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return [];
  const localWeekday = meetingWeekday(start);
  const first = start.getTime() + ((weekday - localWeekday + 7) % 7) * DAY;
  const dates: string[] = [];
  for (let next = first; next < today.getTime(); next += 7 * DAY) {
    dates.push(localDate(new Date(next)));
  }
  return dates.reverse();
}

export function meetingProgress(dates: string[], memberIds: string[], records: { userId: string; meetingDate: Date }[]) {
  const savedByDate = new Map<string, Set<string>>();
  const expected = new Set(memberIds);
  for (const row of records) {
    if (!expected.has(row.userId)) continue;
    const day = localDate(row.meetingDate);
    const saved = savedByDate.get(day) ?? new Set<string>();
    saved.add(row.userId);
    savedByDate.set(day, saved);
  }
  return dates.map(date => {
    const filled = savedByDate.get(date)?.size ?? 0;
    return { date, filled, total: expected.size, complete: expected.size > 0 && filled === expected.size };
  });
}
