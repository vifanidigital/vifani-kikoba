import { currentLoanQuote } from '../lib/loanRepayment';
import { HistoricalConflict, historicalEventInput, historicalTypes, saveHistoricalEvent } from '../lib/historicalEvents';
import { lockLoanGroup } from './loanQueue';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { historicalSchedule, meetingProgress, meetingWeekday, localDate, meetingDayEnd, parseMeetingDate } from '../lib/meetingCalendar';
import { addMonths } from '../lib/subscription';
import { authenticateToken, type AuthRequest } from '../middlewares/auth';

const router = Router();
router.use(authenticateToken, (req: AuthRequest, res, next) => {
  if (req.user?.role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee anaweza kuingiza vikao vya nyuma.' });
  next();
});

const groupFields = { historicalMeetingStart: true, historicalMeetingWeekday: true, meetingDayOfWeek: true, hasPapo: true } as const;
const todayInTanzania = () => parseMeetingDate(localDate(new Date()))!;

async function scheduleResponse(groupId: string, start: Date | null, weekday: number) {
  const today = todayInTanzania();
  const newestFirst = start ? historicalSchedule(start, weekday, today) : [];
  const dates = [...newestFirst].reverse();
  const [members, records] = start && dates.length ? await Promise.all([
    prisma.groupMember.findMany({ where: { groupId, isActive: true }, select: { userId: true } }),
    prisma.shareRecord.findMany({
      where: { groupId, meetingDate: { gte: start, lt: today } },
      select: { userId: true, meetingDate: true },
    }),
  ]) : [[], []];
  const sessions = meetingProgress(dates, members.map(member => member.userId), records);
  return {
    startDate: start ? localDate(start) : null, startWeekday: start ? meetingWeekday(start) : null,
    weekday, firstMeetingDate: dates[0] ?? null, dates, sessions,
    totalWeeks: sessions.length, remainingWeeks: sessions.filter(session => !session.complete).length,
  };
}

router.get('/', async (req: AuthRequest, res) => {
  const groupId = req.user!.groupId;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupFields });
  if (!group) return res.sendStatus(404);
  res.json(await scheduleResponse(groupId, group.historicalMeetingStart, group.historicalMeetingWeekday ?? group.meetingDayOfWeek));
});

router.put('/start', async (req: AuthRequest, res) => {
  const input = z.object({ startDate: z.string() }).safeParse(req.body);
  const date = input.success ? parseMeetingDate(input.data.startDate) : null;
  const today = todayInTanzania();
  if (!date) return res.status(400).json({ error: 'Tarehe si halali. Tumia mpangilio wa mwaka, mwezi na siku.' });
  if (date >= today) return res.status(400).json({ error: 'Chagua tarehe kabla ya leo. Taarifa za leo zinajazwa kwenye kikao cha leo.' });
  if (date < addMonths(today, -60)) return res.status(400).json({ error: 'Chagua tarehe iliyo ndani ya miaka mitano iliyopita.' });
  const groupId = req.user!.groupId;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupFields });
  if (!group) return res.sendStatus(404);
  const weekday = group.historicalMeetingWeekday ?? group.meetingDayOfWeek;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return res.status(400).json({ error: 'Kwanza weka siku halali ya kikao kwenye Ofisi na Sheria.' });
  if (group.historicalMeetingStart && date > group.historicalMeetingStart) {
    const before = await prisma.shareRecord.count({ where: { groupId, meetingDate: { gte: group.historicalMeetingStart, lt: date } } });
    if (before) return res.status(409).json({ error: 'Tarehe hiyo ingeondoa vikao vyenye rekodi kwenye orodha.' });
  }
  await prisma.group.update({ where: { id: groupId }, data: { historicalMeetingStart: date, historicalMeetingWeekday: weekday } });
  res.json(await scheduleResponse(groupId, date, weekday));
});

function isScheduled(date: Date, group: { historicalMeetingStart: Date | null; historicalMeetingWeekday: number | null; meetingDayOfWeek: number }) {
  const start = group.historicalMeetingStart;
  return Boolean(start && date >= start && date < todayInTanzania() &&
    meetingWeekday(date) === (group.historicalMeetingWeekday ?? group.meetingDayOfWeek));
}

router.get('/:date', async (req: AuthRequest, res) => {
  const date = parseMeetingDate(String(req.params.date));
  const groupId = req.user!.groupId;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupFields });
  if (!group || !date || !isScheduled(date, group)) return res.status(400).json({ error: 'Tarehe hiyo haipo kwenye ratiba ya nyuma.' });
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true, isActive: true, user: { select: { fullName: true } } }, orderBy: { joinedAt: 'asc' },
  });
  const records = await prisma.shareRecord.findMany({
    where: { groupId, meetingDate: { gte: date, lt: meetingDayEnd(date) } },
    select: { userId: true, sharesCount: true, amountPaid: true, socialFundPaid: true },
  });
  const byMember = new Map(records.map(entry => [entry.userId, entry]));
  res.json({ hasPapo: group.hasPapo, members: members.map(member => ({ userId: member.userId, fullName: member.user.fullName, isActive: member.isActive, record: byMember.get(member.userId) ?? null })) });
});

router.get('/:date/events', async (req: AuthRequest, res) => {
  const date = parseMeetingDate(String(req.params.date));
  const groupId = req.user!.groupId;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupFields });
  if (!group || !date || !isScheduled(date, group)) return res.status(400).json({ error: 'Tarehe haipo kwenye ratiba.' });
  const [loans, papo, fines, events] = await Promise.all([
    prisma.loan.findMany({ where: { groupId, disbursedAt: { lte: date }, status: { in: ['DISBURSED','OVERDUE'] } }, select: { id: true, userId: true, principalAmount: true, amountPaid: true, totalRepayable: true, disbursedAt: true, repaymentPlan: true } }),
    prisma.papoTopUp.findMany({ where: { groupId, createdAt: { lte: date }, status: { in: ['ACTIVE','OVERDUE'] } }, select: { id: true, userId: true, principalAmount: true, amountPaid: true, totalPayable: true } }),
    prisma.fineRecord.findMany({ where: { groupId, createdAt: { lte: date }, isPaid: false }, select: { id: true, userId: true, reason: true, amount: true } }),
    prisma.transaction.findMany({ where: { groupId, createdAt: { gte: date, lt: meetingDayEnd(date) }, type: { in: [...historicalTypes] } }, select: { id: true, userId: true, type: true, amount: true, notes: true } }),
  ]);
  res.json({
    loans: loans.map(loan => {
      const quote = currentLoanQuote(loan, date);
      return { id: loan.id, userId: loan.userId, principalAmount: loan.principalAmount,
        balance: quote?.dueBalance ?? Math.max(0, loan.totalRepayable - loan.amountPaid),
        first: quote?.firstInterest ?? 0, second: quote?.secondInterest ?? 0, secondRequired: quote?.secondRequired ?? false };
    }),
    papo: papo.map(entry => ({ ...entry, balance: Math.max(0, entry.totalPayable - entry.amountPaid) })),
    fines, events,
  });
});

router.post('/:date/events', async (req: AuthRequest, res) => {
  const date = parseMeetingDate(String(req.params.date));
  const input = historicalEventInput.safeParse(req.body);
  if (!date || !input.success) return res.status(400).json({ error: 'Weka tukio, mwanachama, kiasi na rejea ya daftari.' });
  const groupId = req.user!.groupId;
  try {
    await prisma.$transaction(async tx => {
      await lockLoanGroup(tx, groupId);
      const group = await tx.group.findUnique({ where: { id: groupId }, select: { ...groupFields, cycleClosedAt: true } });
      if (!group || group.cycleClosedAt || !isScheduled(date, group)) throw new HistoricalConflict('Kikao hiki hakipo wazi kwa taarifa za nyuma.');
      await saveHistoricalEvent(tx, groupId, date, input.data);
    }, { timeout: 25000 });
    res.status(201).json({ message: 'Tukio limehifadhiwa kwa tarehe halisi ya kikao.' });
  } catch (error) {
    if (error instanceof HistoricalConflict) return res.status(409).json({ error: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: 'Rejea hiyo tayari imetumika.' });
    throw error;
  }
});

const money = z.number().min(0).max(1_000_000_000);
const recordInput = z.object({
  targetUserId: z.string().min(1),
  sharesCount: z.number().int().min(0).max(1_000_000),
  amountPaid: money, socialFundPaid: money, papoInterestPaid: money,
  paidFine: money, unpaidFine: money,
});

router.post('/:date', async (req: AuthRequest, res) => {
  const date = parseMeetingDate(String(req.params.date));
  const input = recordInput.safeParse(req.body);
  if (!date || !input.success) return res.status(400).json({ error: 'Thibitisha tarehe, mwanachama na kiasi cha kila rekodi.' });
  const groupId = req.user!.groupId;
  const { targetUserId: userId, sharesCount, amountPaid, socialFundPaid, papoInterestPaid, paidFine, unpaidFine } = input.data;
  try {
    const outcome = await prisma.$transaction(async tx => {
      const group = await tx.group.findUnique({ where: { id: groupId }, select: groupFields });
      if (!group || !isScheduled(date, group)) return 'DATE';
      if (papoInterestPaid > 0 && !group.hasPapo) return 'PAPO';
      const membership = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { isActive: true } });
      if (!membership) return 'MEMBER';
      const window = { gte: date, lt: meetingDayEnd(date) };
      const existing = await tx.shareRecord.findFirst({ where: { groupId, userId, meetingDate: window } });
      if (existing) return 'EXISTS';
      if (papoInterestPaid > 0 && await tx.transaction.count({ where: { groupId, userId, type: 'PAPO_INTEREST', createdAt: window } })) return 'EXISTS';
      if ((paidFine > 0 || unpaidFine > 0) && await tx.fineRecord.count({ where: { groupId, userId, createdAt: window } })) return 'EXISTS';
      await tx.shareRecord.create({ data: { groupId, userId, sharesCount, amountPaid, socialFundPaid, meetingDate: date } });
      if (papoInterestPaid > 0) await tx.transaction.create({
        data: { groupId, userId, amount: papoInterestPaid, type: 'PAPO_INTEREST', notes: 'Riba ya Papo ya kikao cha nyuma', createdAt: date },
      });
      for (const [amount, paid] of [[paidFine, true], [unpaidFine, false]] as const) {
        if (amount > 0) await tx.fineRecord.create({
          data: { groupId, userId, amount, reason: 'Faini ya kikao cha nyuma', isPaid: paid, paidAt: paid ? date : null, createdAt: date },
        });
      }
      return 'SAVED';
    }, { isolationLevel: 'Serializable' });
    if (outcome === 'DATE') return res.status(400).json({ error: 'Tarehe hiyo haipo kwenye ratiba ya nyuma.' });
    if (outcome === 'PAPO') return res.status(400).json({ error: 'Huduma ya Papo haijawashwa kwa kikundi hiki.' });
    if (outcome === 'MEMBER') return res.status(409).json({ error: 'Mwanachama huyu hayupo katika kikundi.' });
    if (outcome === 'EXISTS') return res.status(409).json({ error: 'Kikao kina rekodi zilizopo kwa mwanachama huyu. Kagua daftari kabla ya kuongeza nyingine.' });
    res.status(201).json({ message: 'Rekodi ya kikao cha nyuma imehifadhiwa.' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return res.status(409).json({ error: 'Rekodi imebadilika wakati wa kuhifadhi. Pakia tena.' });
    }
    throw error;
  }
});

router.use((error: unknown, _req: AuthRequest, res: import('express').Response, _next: import('express').NextFunction) => {
  console.error('Historical meetings request failed', error instanceof Error ? error.name : 'Unknown');
  res.status(500).json({ error: 'Seva imeshindwa kupakia kikao. Jaribu tena.' });
});

export default router;
