import { unpaidInterestInstallments } from './loanInterest';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { blankRepaymentPlan, calendarLoanDue, quotePayment, repaymentQuote, RepaymentPlan } from './loanRepayment';
import { meetingDayEnd } from './meetingCalendar';
import { papoPayment } from './papoPayment';

const kind = z.enum(['LOAN_OUT','LOAN_IN','PAPO_OUT','PAPO_IN','PAPO_INTEREST','EXPENSE','FINE_PAID']);
export const historicalEventInput = z.object({
  kind, userId: z.string().min(1), debtId: z.string().optional(),
  amount: z.number().min(0).max(1_000_000_000).refine(n => Math.round(n * 100) / 100 === n),
  reference: z.string().trim().min(1).max(100), title: z.string().trim().max(150).optional(), includeSecond: z.boolean().optional(),
});
export class HistoricalConflict extends Error {}
export const historicalTypes = ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'LOAN_INTEREST_REPAYMENT', 'PAPO_TOPUP_DISBURSEMENT', 'PAPO_TOPUP_REPAYMENT', 'PAPO_TOPUP_INTEREST_REPAYMENT', 'PAPO_INTEREST', 'HISTORICAL_EXPENSE', 'HISTORICAL_FINE'] as const;

export async function saveHistoricalEvent(tx: Prisma.TransactionClient, groupId: string, date: Date, event: z.infer<typeof historicalEventInput>) {
  const { kind, userId, amount, debtId } = event;
  const id = createHash('sha256').update(JSON.stringify([groupId, date.toISOString(), event.reference.toLowerCase()])).digest('hex');
  const past = await tx.transaction.findUnique({ where: { id }, select: { id: true } });
  if (past) throw new HistoricalConflict('Rejea hii tayari imetumika kwenye kikao hiki.');
  const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
  const member = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member || member.removedAt) throw new HistoricalConflict('Mwanachama hayupo kwenye kikundi.');
  if (kind.startsWith('PAPO') && !group.hasPapo) throw new HistoricalConflict('Washa Papo kwenye mipangilio ya kikundi.');
  if (kind !== 'LOAN_IN' && amount <= 0) throw new HistoricalConflict('Weka kiasi kikubwa kuliko sifuri.');
  let first = true;
  async function ledger(type: string, value: number, related?: string, due?: Date) {
    if (value <= 0) return;
    await tx.transaction.create({ data: { ...(first ? { id } : {}), groupId, userId, createdAt: date,
      type, amount: value, notes: event.reference, interestLoanId: related, interestDueAt: due } });
    first = false;
  }
  if (kind === 'LOAN_OUT') {
    const loan = await tx.loan.create({ data: { groupId, userId, createdAt: date, disbursedAt: date, principalAmount: amount,
      fundedAmount: amount, interestRate: 10, repaymentMonths: 2, totalRepayable: Math.round(amount * 110) / 100, repaymentPlan: blankRepaymentPlan,
      status: 'DISBURSED', guarantorStatus: 'ACCEPTED', dueDate: calendarLoanDue(date, 2), nextInterestDue: calendarLoanDue(date, 1) } });
    await ledger('LOAN_DISBURSEMENT', amount, loan.id);
  } else if (kind === 'PAPO_OUT') {
    const interestRate = group.topUpPapoInterest;
    await tx.papoTopUp.create({ data: { groupId, userId, createdAt: date, principalAmount: amount, fundedAmount: amount,
      interestRate, totalPayable: Math.round(amount * (100 + interestRate)) / 100,
      status: 'ACTIVE', dueDate: new Date(date.getTime() + group.topUpPapoWeeks * 7 * 86400000) } });
    await ledger('PAPO_TOPUP_DISBURSEMENT', amount);
  } else if (kind === 'LOAN_IN') {
    const loan = await tx.loan.findFirst({ where: { id: debtId ?? '', groupId, userId, disbursedAt: { lte: date }, status: { in: ['DISBURSED','OVERDUE'] } } });
    if (!loan?.disbursedAt) throw new HistoricalConflict('Chagua mkopo uliotolewa kabla au siku ya kikao hiki.');
    if (!loan.repaymentPlan) {
      const later = await tx.transaction.count({ where: { groupId, userId, type: { in: ['LOAN_INTEREST_REPAYMENT','LOAN_REPAYMENT'] }, createdAt: { gte: meetingDayEnd(date) } } });
      if (later) throw new HistoricalConflict('Ingiza marejesho kwa mpangilio wa tarehe.');
      const installments = unpaidInterestInstallments(loan);
      const principalLeft = Math.max(0, Math.round((loan.totalRepayable - loan.amountPaid - installments.reduce((sum, row) => sum + row.amount, 0)) * 100) / 100);
      if (amount > principalLeft) throw new HistoricalConflict('Kiasi kinazidi mtaji uliobaki.');
      const interest = installments.reduce((sum, row) => sum + row.amount, 0);
      if (!interest && !amount) throw new HistoricalConflict('Hakuna malipo ya kuhifadhi.');
      const amountPaid = Math.round((loan.amountPaid + amount + interest) * 100) / 100;
      await tx.loan.update({ where: { id: loan.id }, data: { amountPaid, status: amountPaid >= loan.totalRepayable ? 'PAID' : 'DISBURSED', nextInterestDue: null } });
      await ledger('LOAN_REPAYMENT', amount, loan.id);
      for (const installment of installments) await ledger('LOAN_INTEREST_REPAYMENT', installment.amount, loan.id, installment.dueAt ?? undefined);
      return;
    }
    const plan = loan.repaymentPlan as RepaymentPlan;
    if (plan.history?.some(p => new Date(p.receivedAt ?? p.requestedAt) > date)) throw new HistoricalConflict('Ingiza marejesho kwa mpangilio wa tarehe. Mkopo una malipo ya baadaye tayari.');
    const quote = repaymentQuote(loan.principalAmount, plan, loan.disbursedAt, date);
    const pay = quotePayment(quote, amount, event.includeSecond ?? false);
    if (!pay) throw new HistoricalConflict('Kiasi hakilingani na salio la mkopo.');
    const receivedAt = date.toISOString();
    const updated: RepaymentPlan = { ...plan, principalPaid: Math.round((plan.principalPaid + pay.principal) * 100) / 100,
      firstPaid: plan.firstPaid || pay.first > 0, secondPaid: plan.secondPaid || pay.second > 0,
      history: [...(plan.history ?? []), { ...pay, id, status: 'APPROVED', reason: event.reference, requestedAt: receivedAt, receivedAt }] };
    const next = repaymentQuote(loan.principalAmount, updated, loan.disbursedAt, date);
    const amountPaid = Math.round((loan.amountPaid + pay.principal + pay.first + pay.second) * 100) / 100;
    await tx.loan.update({ where: { id: loan.id }, data: { repaymentPlan: updated, amountPaid, totalRepayable: amountPaid + next.dueBalance,
      status: next.principalRemaining === 0 ? 'PAID' : next.secondRequired ? 'OVERDUE' : 'DISBURSED',
      nextInterestDue: next.principalRemaining === 0 ? null : !updated.firstPaid ? next.firstDue : !updated.secondPaid ? next.secondDue : null } });
    await ledger('LOAN_REPAYMENT', pay.principal, loan.id);
    await ledger('LOAN_INTEREST_REPAYMENT', pay.first, loan.id, new Date(meetingDayEnd(quote.firstDue).getTime() - 1));
    await ledger('LOAN_INTEREST_REPAYMENT', pay.second, loan.id, new Date(meetingDayEnd(quote.secondDue).getTime() - 1));
  } else if (kind === 'PAPO_IN') {
    const entry = await tx.papoTopUp.findFirst({ where: { id: debtId ?? '', groupId, userId, createdAt: { lte: date }, status: { in: ['ACTIVE','OVERDUE'] } } });
    if (!entry) throw new HistoricalConflict('Chagua Papo iliyotolewa kabla au siku ya kikao hiki.');
    if (await tx.transaction.count({ where: { groupId, userId, type: { in: ['PAPO_TOPUP_REPAYMENT','PAPO_TOPUP_INTEREST_REPAYMENT'] }, createdAt: { gte: meetingDayEnd(date) } } })) {
      throw new HistoricalConflict('Ingiza marejesho ya Papo kwa mpangilio wa tarehe.');
    }
    const pay = papoPayment(entry, amount);
    if (!pay) throw new HistoricalConflict('Kiasi kinazidi salio la Papo.');
    await tx.papoTopUp.update({ where: { id: entry.id }, data: { amountPaid: pay.totalPaid, status: pay.remaining === 0 ? 'PAID' : 'ACTIVE' } });
    await ledger('PAPO_TOPUP_REPAYMENT', pay.principal);
    await ledger('PAPO_TOPUP_INTEREST_REPAYMENT', pay.interest);
  } else if (kind === 'EXPENSE') {
    if (!event.title) throw new HistoricalConflict('Weka maelezo ya matumizi.');
    await tx.groupExpense.create({ data: { groupId, category: 'OPERATIONS', title: event.title, amount, recordedBy: 'Mwenyekiti', createdAt: date } });
    await ledger('HISTORICAL_EXPENSE', amount);
  } else if (kind === 'FINE_PAID') {
    const fine = await tx.fineRecord.findFirst({ where: { id: debtId ?? '', groupId, userId, createdAt: { lte: date }, isPaid: false } });
    if (!fine || fine.amount !== amount) throw new HistoricalConflict('Chagua faini na tumia kiasi chake kamili.');
    await tx.fineRecord.update({ where: { id: fine.id }, data: { isPaid: true, paidAt: date } });
    await ledger('HISTORICAL_FINE', amount, fine.id);
  } else {
    await ledger('PAPO_INTEREST', amount);
  }
}

export async function correctHistoricalLoan(tx: Prisma.TransactionClient, groupId: string, editor: string, id: string, before: Date, after: Date, amount: number, includeSecond?: boolean) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HistoricalConflict('Tukio hili halikurekodiwa kupitia daftari la nyuma.');
  const ledger = await tx.transaction.findFirst({ where: { id, groupId, createdAt: { gte: before, lt: meetingDayEnd(before) },
    type: { in: ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'LOAN_INTEREST_REPAYMENT'] } } });
  if (!ledger?.interestLoanId || !ledger.notes) throw new HistoricalConflict('Tukio la mkopo halijapatikana.');
  const loan = await tx.loan.findFirst({ where: { id: ledger.interestLoanId, groupId, userId: ledger.userId } });
  if (!loan?.disbursedAt || !loan.repaymentPlan) throw new HistoricalConflict('Rekodi hii ya zamani haiwezi kusahihishwa kupitia fomu hii.');
  const plan = loan.repaymentPlan as RepaymentPlan;
  if (loan.status === 'REPAYMENT_PENDING') throw new HistoricalConflict('Malizia ombi linalosubiri kabla ya kusahihisha rekodi.');
  if (ledger.type === 'LOAN_DISBURSEMENT') {
    if (amount <= 0) throw new HistoricalConflict('Kiasi cha mkopo lazima kiwe zaidi ya sifuri.');
    if (loan.amountPaid > 0 || plan.history?.length || plan.latest) throw new HistoricalConflict('Mkopo wenye marejesho unahitaji uhakiki wa daftari kabla ya kubadili kiasi au tarehe ya kutolewa.');
    await tx.loan.update({ where: { id: loan.id }, data: {
      createdAt: after, disbursedAt: after, dueDate: calendarLoanDue(after, 2), nextInterestDue: calendarLoanDue(after, 1),
      principalAmount: amount, fundedAmount: amount, totalRepayable: Math.round(amount * 110) / 100,
    } });
    const newId = createHash('sha256').update(JSON.stringify([groupId, after.toISOString(), ledger.notes.toLowerCase()])).digest('hex');
    if (newId !== id && await tx.transaction.findUnique({ where: { id: newId } })) throw new HistoricalConflict('Rejea tayari inatumika kwenye tarehe hiyo.');
    await tx.transaction.update({ where: { id }, data: { id: newId, amount, createdAt: after } });
  } else {
    const history = plan.history ?? [];
    const latest = history.at(-1);
    if (latest?.id !== id || latest.status !== 'APPROVED') throw new HistoricalConflict('Marekebisho yanaruhusiwa kwa marejesho ya mwisho ili kulinda hesabu za malipo yanayofuata.');
    const restored: RepaymentPlan = {
      ...plan, history: history.slice(0, -1), principalPaid: Math.round((plan.principalPaid - latest.principal) * 100) / 100,
      firstPaid: plan.firstPaid && !latest.first, secondPaid: plan.secondPaid && !latest.second,
    };
    const previousAmount = Math.round((loan.amountPaid - latest.principal - latest.first - latest.second) * 100) / 100;
    const quote = repaymentQuote(loan.principalAmount, restored, loan.disbursedAt, after);
    await tx.loan.update({ where: { id: loan.id }, data: {
      status: 'DISBURSED', repaymentPlan: restored, amountPaid: previousAmount,
      totalRepayable: previousAmount + quote.dueBalance,
    } });
    await tx.transaction.deleteMany({ where: {
      groupId, userId: loan.userId, interestLoanId: loan.id, createdAt: ledger.createdAt, notes: ledger.notes,
      type: { in: ['LOAN_REPAYMENT', 'LOAN_INTEREST_REPAYMENT'] },
    } });
    const originalReference = ledger.notes;
    await saveHistoricalEvent(tx, groupId, after, { kind: 'LOAN_IN', userId: loan.userId, debtId: loan.id, amount, reference: originalReference, includeSecond: includeSecond ?? latest.second > 0 });
  }
  await tx.transaction.create({ data: { groupId, userId: loan.userId, type: 'HISTORICAL_LOAN_EDIT', amount: 0,
    notes: JSON.stringify({ editor, eventId: id, loanId: loan.id, before: { date: before.toISOString(), amount: ledger.amount },
      after: { date: after.toISOString(), principal: amount } }) } });
}
