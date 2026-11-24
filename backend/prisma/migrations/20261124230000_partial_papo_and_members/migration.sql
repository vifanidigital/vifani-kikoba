ALTER TABLE "PapoTopUp" ADD COLUMN IF NOT EXISTS "repaymentRequest" JSONB;
INSERT INTO "PapoAccount" ("id","groupId","userId","mandatoryBalance","updatedAt")
SELECT m."id", g."id", m."userId", g."mandatoryPapoAmount", CURRENT_TIMESTAMP
FROM "GroupMember" m JOIN "Group" g ON g."id"=m."groupId"
WHERE m."isActive" AND g."hasPapo" AND g."mandatoryPapoAmount">0 AND g."cycleClosedAt" IS NULL
ON CONFLICT ("userId","groupId") DO NOTHING;
