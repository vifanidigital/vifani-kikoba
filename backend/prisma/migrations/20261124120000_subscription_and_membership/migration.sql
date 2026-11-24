ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "paidUntil" TIMESTAMP(3);
ALTER TABLE "GroupMember"
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT;
CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
  "id" TEXT PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reference" TEXT NOT NULL UNIQUE,
  "amount" INTEGER NOT NULL,
  "months" INTEGER NOT NULL,
  "paidUntil" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_groupId_recordedAt_idx"
  ON "SubscriptionPayment"("groupId", "recordedAt");
