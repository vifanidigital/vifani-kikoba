import { z } from 'zod';

const record = z.looseObject({ id: z.string() });
const member = z.looseObject({
  memberId: z.string(),
  userId: z.string(),
  fullName: z.string(),
  phone: z.string().nullish(),
  role: z.string(),
  joinedAt: z.string(),
  isActive: z.boolean().default(true),
  suspendedAt: z.string().nullish(),
  suspensionReason: z.string().nullish(),
});

const fundingEntry = z.object({
  id: z.string(), userId: z.string(), fullName: z.string(), requested: z.number(), funded: z.number(),
  remaining: z.number(), needsGuarantor: z.boolean().optional(),
});

const papoInterestDebt = z.object({
  id: z.string(), meetingDate: z.string(), amount: z.number(), paidDate: z.string().nullable(),
});
export type PapoInterestDebt = z.infer<typeof papoInterestDebt> & { pending: boolean; feedback: string | null };
export type PapoInterestPaymentRequest = z.infer<typeof papoInterestDebt> & { requestId: string; fullName: string };

export const parsePapo = z.looseObject({
  hasPapo: z.boolean(),
  topUps: z.array(record),
  interestDebtTotal: z.number().optional(),
  totalDebt: z.number().optional(),
  interestDebts: z.array(papoInterestDebt.extend({ pending: z.boolean(), feedback: z.string().nullable() })).optional(),
  interestPaymentRequests: z.array(papoInterestDebt.extend({ requestId: z.string(), fullName: z.string() })).optional(),
  fundingQueue: z.array(fundingEntry).optional(),
  repayingTopUpRequests: z.array(record).optional(),
}).parse;

export const parseLoans = z.looseObject({
  loans: z.array(record),
  fundingQueue: z.array(fundingEntry).optional(),
  guarantorRepaidNotices: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  interestPayments: z.array(z.object({
    id: z.string(), userId: z.string(), fullName: z.string(),
    amount: z.number(), paidAt: z.string(), dueAt: z.string().nullable(),
    timing: z.enum(['ON_TIME', 'LATE', 'UNKNOWN']),
  })).optional(),
  guarantorRequests: z.array(record).optional(),
  potentialGuarantors: z.array(record).optional(),
}).parse;

const cycleMember = z.object({
  userId: z.string(), fullName: z.string(), myPapoMandatory: z.number(), myPapoMandatoryDebt: z.number(),
  otherDeductions: z.number(), payoutAfterPapoRepayment: z.number(), netPayout: z.number(), grossPayout: z.number(), balanceToCollect: z.number(),
});
const equalShareOut = z.object({
  calculation: z.literal('KIKOBA_EQUAL_V1'),
  cycleClosedAt: z.string().nullish(),
  closePreview: z.object({ token: z.string(), members: z.array(cycleMember) }).nullish(),
  myEstimate: z.object({
    fullName: z.string(), myCapital: z.number(), mySocialFund: z.number(),
    myPapoMandatory: z.number(), myPapoMandatoryDebt: z.number().optional(), payoutAfterPapoRepayment: z.number().optional(), otherDeductions: z.number().optional(), myPapoInterestDebt: z.number().optional(), balanceToCollect: z.number().optional(), myOnTimeLoanInterest: z.number(), myPapoInterestPaid: z.number(),
    myPapoInterestRefund: z.number(), estimatedProfitDividend: z.number(),
    totalDeductions: z.number(), netPayout: z.number(),
  }).nullable(),
  groupPool: z.object({
    memberCount: z.number(), papoInterestPool: z.number(), lateLoanInterestPool: z.number(),
    finesPool: z.number(), expenses: z.number(), totalDistributableProfit: z.number(),
    unclassifiedLoanInterest: z.number(), expenseShortfall: z.number(),
  }),
});

export const parseShareOut = z.union([
  equalShareOut,
  z.object({ calculation: z.undefined(), myEstimate: z.looseObject({ fullName: z.string().optional() }).nullable() }),
]).parse;

export const parseExpenses = z.object({
  expenses: z.array(record.extend({
    title: z.string(),
    category: z.string(),
    createdAt: z.string(),
    beneficiary: z.string().nullish(),
    recordedBy: z.string().nullish(),
  })),
}).parse;

export const parseAuditLogs = z.object({
  logs: z.array(record.extend({
    summary: z.string(),
    changedBy: z.string(),
    createdAt: z.string(),
  })),
}).parse;

export const parseOffice = z.object({
  viewerRole: z.string().optional(),
  subscriptionAccess: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED']).optional(),
  group: record.extend({
    name: z.string(),
    constitution: z.string().nullish(),
    meetingVenue: z.string().nullish(),
    meetingTime: z.string().nullish(),
  }),
  directory: z.array(member),
}).parse;

export const parseLoanQueue = z.object({
  spun: z.boolean(), next: z.string().nullable(),
  positions: z.array(z.object({ id: z.string(), name: z.string(), number: z.number() })),
  swaps: z.array(z.object({ id: z.string(), from: z.string(), to: z.string(), fromName: z.string().optional(), toName: z.string().optional(), status: z.string() })),
}).parse;
