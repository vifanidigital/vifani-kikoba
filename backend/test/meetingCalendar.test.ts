import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historicalSchedule, localDate, meetingDayEnd, parseMeetingDate } from '../src/lib/meetingCalendar';

test('backfills only the configured weekly meeting day before today', () => {
  const today = parseMeetingDate('2026-11-19')!;
  assert.deepEqual(historicalSchedule(parseMeetingDate('2026-11-02')!, 4, today), ['2026-11-12', '2026-11-05']);
  assert.deepEqual(historicalSchedule(parseMeetingDate('2026-11-12')!, 4, today), ['2026-11-12']);
});

test('validates dates and uses East Africa midnight for ledger bounds', () => {
  assert.equal(parseMeetingDate('2026-02-29'), null);
  assert.equal(parseMeetingDate('2026-1-02'), null);
  const meeting = parseMeetingDate('2028-02-29')!;
  assert.equal(meeting.toISOString(), '2028-02-28T21:00:00.000Z');
  assert.equal(localDate(meetingDayEnd(meeting)), '2028-03-01');
});
