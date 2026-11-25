const EAT_OFFSET = 3 * 60 * 60 * 1000;

export function meetingDateKey(raw: string | null | undefined) {
  if (!raw) return '';
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time + EAT_OFFSET).toISOString().slice(0, 10) : '';
}
