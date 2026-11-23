ALTER TABLE "Group"
  ADD COLUMN IF NOT EXISTS "announcementPublishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "announcementExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "announcementUpdatedAt" TIMESTAMP(3);
