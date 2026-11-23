ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "interestLoanId" TEXT,
  ADD COLUMN IF NOT EXISTS "interestDueAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Transaction_groupId_type_createdAt_idx"
  ON "Transaction"("groupId", "type", "createdAt");
