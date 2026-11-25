CREATE TABLE "PapoInterestDebt" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL CHECK ("amount" > 0),
    "requestId" TEXT,
    "reportedPaidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "feedback" TEXT,
    CONSTRAINT "PapoInterestDebt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PapoInterestDebt_groupId_userId_meetingDate_key" ON "PapoInterestDebt"("groupId", "userId", "meetingDate");
CREATE INDEX "PapoInterestDebt_groupId_confirmedAt_idx" ON "PapoInterestDebt"("groupId", "confirmedAt");
