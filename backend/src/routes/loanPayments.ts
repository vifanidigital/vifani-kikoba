import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middlewares/auth';
import { localDate, meetingDayEnd, parseMeetingDate } from '../lib/meetingCalendar';
import { quotePayment, repaymentQuote, RepaymentPlan } from '../lib/loanRepayment';
import { LoanConflict, lockLoanGroup } from './loanQueue';

const router = Router();
router.use(authenticateToken);

router.post('/:id', async (req: AuthRequest, res) => {
  const { groupId, userId } = req.user!;
  const id = String(req.params.id);
  const input = z.object({ principal: z.number().nonnegative(), includeSecond: z.boolean().default(false), expectedTotal: z.number().positive() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Weka kiasi halali cha marejesho.' });
  await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const loan = await tx.loan.findFirst({ where: { id, groupId, userId } });
    if (!loan?.repaymentPlan || !loan.disbursedAt || !['DISBURSED', 'OVERDUE'].includes(loan.status)) throw new LoanConflict('Mkopo huu hauwezi kuombewa marejesho kwa sasa.');
    const plan = loan.repaymentPlan as RepaymentPlan;
    const now = new Date();
    const quote = repaymentQuote(loan.principalAmount, plan, loan.disbursedAt, now);
    const payment = quotePayment(quote, input.data.principal, input.data.includeSecond);
    if (!payment) throw new LoanConflict('Kiasi kinazidi mtaji uliobaki au hakuna malipo ya kurekodi.');
    const total = Math.round((payment.principal + payment.first + payment.second) * 100) / 100;
    if (input.data.expectedTotal !== total) throw new LoanConflict('Kiasi cha kulipa kimebadilika. Sasisha ukaguzi kabla ya kutuma tena.');
    await tx.loan.update({ where: { id }, data: {
      status: 'REPAYMENT_PENDING',
      repaymentPlan: { ...plan, latest: { ...payment, id: randomUUID(), requestedAt: now.toISOString(), status: 'PENDING', reason: '' } },
    } });
  });
  res.status(201).json({ message: 'Ombi la malipo limetumwa kwa mwenyekiti.' });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const { groupId, role } = req.user!;
  if (role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayethibitisha marejesho.' });
  const id = String(req.params.id);
  const input = z.object({ requestId: z.string().uuid(), accept: z.boolean(), receivedOn: z.string().optional(), reason: z.string().trim().max(300).default('') }).safeParse(req.body);
  if (!input.success || (!input.data.accept && input.data.reason.length < 3)) return res.status(400).json({ error: 'Weka sababu ya kukataa yenye angalau herufi tatu.' });
  await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const loan = await tx.loan.findFirst({ where: { id, groupId, status: 'REPAYMENT_PENDING' } });
    if (!loan?.repaymentPlan || !loan.disbursedAt) throw new LoanConflict('Mkopo hausubiri marejesho.');
    const plan = loan.repaymentPlan as RepaymentPlan;
    const payment = plan.latest;
    if (!payment || payment.status !== 'PENDING' || input.data.requestId !== payment.id) throw new LoanConflict('Ombi hili tayari limejibiwa au limebadilika.');
    const now = new Date();
    const requestedAt = new Date(payment.requestedAt);
    const receivedDate = input.data.receivedOn ?? localDate(now);
    const receivedAt = parseMeetingDate(receivedDate);
    const original = repaymentQuote(loan.principalAmount, plan, loan.disbursedAt, requestedAt);
    if (input.data.accept) {
      if (!receivedAt || receivedDate < localDate(requestedAt) || receivedDate > localDate(now)) {
        throw new LoanConflict('Weka tarehe halali ya kupokea fedha kuanzia siku ya ombi hadi leo.');
      }
      const atReceipt = repaymentQuote(loan.principalAmount, plan, loan.disbursedAt, receivedAt);
      if (atReceipt.secondRequired && payment.second < atReceipt.secondInterest) {
        throw new LoanConflict('Tarehe ya kupokea imefika muda wa riba ya pili. Kataa ombi hili kwa sababu hiyo ili mkopaji atume ombi lenye riba sahihi.');
      }
      plan.principalPaid = Math.round((plan.principalPaid + payment.principal) * 100) / 100;
      plan.firstPaid ||= payment.first > 0;
      plan.secondPaid ||= payment.second > 0;
      await tx.transaction.createMany({ data: [
        { amount: payment.first, type: 'LOAN_INTEREST_REPAYMENT', interestDueAt: new Date(meetingDayEnd(original.firstDue).getTime() - 1) },
        { amount: payment.second, type: 'LOAN_INTEREST_REPAYMENT', interestDueAt: new Date(meetingDayEnd(original.secondDue).getTime() - 1) },
        { amount: payment.principal, type: 'LOAN_REPAYMENT', interestDueAt: null },
      ].filter(row => row.amount > 0).map(row => ({
        ...row, groupId, userId: loan.userId, interestLoanId: id, createdAt: receivedAt,
        notes: 'Marejesho yaliyothibitishwa na mwenyekiti',
      })) });
    }
    const quote = repaymentQuote(loan.principalAmount, plan, loan.disbursedAt, now);
    const amountPaid = Math.round((loan.amountPaid + (input.data.accept ? payment.principal + payment.first + payment.second : 0)) * 100) / 100;
    const cleared = quote.principalRemaining === 0 && quote.firstInterest === 0;
    const decision = { ...payment, status: input.data.accept ? 'APPROVED' as const : 'REJECTED' as const, reason: input.data.reason, ...(input.data.accept && receivedAt ? { receivedAt: receivedAt.toISOString() } : {}) };
    await tx.loan.update({ where: { id }, data: {
      repaymentPlan: { ...plan, latest: decision, history: [...(plan.history ?? []), decision] },
      amountPaid, totalRepayable: amountPaid + quote.dueBalance,
      status: cleared ? 'PAID' : now >= quote.secondDue ? 'OVERDUE' : 'DISBURSED',
      nextInterestDue: cleared ? null : !plan.firstPaid ? quote.firstDue : !plan.secondPaid ? quote.secondDue : null,
      guarantorStatus: cleared && loan.guarantorId ? 'REPAID_NOTIFY' : loan.guarantorStatus,
    } });
  });
  res.json({ message: input.data.accept ? 'Marejesho yamethibitishwa na salio limesasishwa.' : 'Ombi limekataliwa. Sababu imeonyeshwa kwa mkopaji.' });
});

export default router;
