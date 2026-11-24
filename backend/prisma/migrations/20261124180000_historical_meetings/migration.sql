ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "historicalMeetingStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "historicalMeetingWeekday" INTEGER;
