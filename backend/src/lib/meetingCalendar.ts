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

export function historicalSchedule(start: Date, weekday: number, today: Date) {
  const localWeekday = new Date(start.getTime() + EAT).getUTCDay();
  const first = start.getTime() + ((weekday - localWeekday + 7) % 7) * DAY;
  const dates: string[] = [];
  for (let next = first; next < today.getTime(); next += 7 * DAY) {
    dates.push(localDate(new Date(next)));
  }
  return dates.reverse();
}
