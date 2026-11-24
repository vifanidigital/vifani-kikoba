import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { historicalSchedule, localDate, meetingDayEnd, parseMeetingDate } from '../lib/meetingCalendar';
import { addMonths } from '../lib/subscription';
import { authenticateToken, type AuthRequest } from '../middlewares/auth';

const router = Router();
router.use(authenticateToken, (req: AuthRequest, res, next) => {
  if (req.user?.role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee anaweza kuingiza vikao vya nyuma.' });
  next();
});

const groupFields = { historicalMeetingStart: true, historicalMeetingWeekday: true, meetingDayOfWeek: true, hasPapo: true } as const;
const todayInTanzania = () => parseMeetingDate(localDate(new Date()))!;

router.get('/', async (req: AuthRequest, res) => {
  const groupId = req.user!.groupId;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupFields });
  if (!group) return res.sendStatus(404);
  const weekday = group.historicalMeetingWeekday ?? group.meetingDayOfWeek;
  const start = group.historicalMeetingStart;
  const dates = start ? historicalSchedule(start, weekday, todayInTanzania()) : [];
  res.json({ startDate: start ? localDate(start) : null, weekday, dates });
});

router.put('/start', async (req: AuthRequest, res) => {
  const input = z.object({ startDate: z.string() }).safeParse(req.body);
  const date = input.success ? parseMeetingDate(input.data.startDate) : null;
  const today = todayInTanzania();
  if (!date || date >= today || date < addMonths(today, -60)) {
    return res.status(400).json({ error: 'Weka tarehe halali ya nyuma ndani ya miaka mitano (YYYY-MM-DD).' });
  }
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
  res.json({ startDate: localDate(date), weekday, dates: historicalSchedule(date, weekday, today) });
});

function isScheduled(date: Date, group: { historicalMeetingStart: Date | null; historicalMeetingWeekday: number | null; meetingDayOfWeek: number }) {
  const start = group.historicalMeetingStart;
  return Boolean(start && date >= start && date < todayInTanzania() &&
    new Date(date.getTime() + 3 * 3600000).getUTCDay() === (group.historicalMeetingWeekday ?? group.meetingDayOfWeek));
}

router.get('/:date', async (req: AuthRequest, res) => {
  const date = parseMeetingDate(String(req.params.date));
  const groupId = req.user!.groupId;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: groupFields });
  if (!group || !date || !isScheduled(date, group)) return res.status(400).json({ error: 'Tarehe hiyo haipo kwenye ratiba ya nyuma.' });
  const members = await prisma.groupMember.findMany({
    where: { groupId, isActive: true },
    select: { userId: true, user: { select: { fullName: true } } }, orderBy: { joinedAt: 'asc' },
  });
  const records = await prisma.shareRecord.findMany({
    where: { groupId, meetingDate: { gte: date, lt: meetingDayEnd(date) } },
    select: { userId: true, sharesCount: true, amountPaid: true, socialFundPaid: true },
  });
  const byMember = new Map(records.map(entry => [entry.userId, entry]));
  res.json({ hasPapo: group.hasPapo, members: members.map(member => ({ userId: member.userId, fullName: member.user.fullName, record: byMember.get(member.userId) ?? null })) });
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
      if (!membership?.isActive) return 'MEMBER';
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
    if (outcome === 'MEMBER') return res.status(409).json({ error: 'Mwanachama huyu si hai katika kikundi.' });
    if (outcome === 'EXISTS') return res.status(409).json({ error: 'Kikao kina rekodi zilizopo kwa mwanachama huyu. Kagua daftari kabla ya kuongeza nyingine.' });
    res.status(201).json({ message: 'Rekodi ya kikao cha nyuma imehifadhiwa.' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return res.status(409).json({ error: 'Rekodi imebadilika wakati wa kuhifadhi. Pakia tena.' });
    }
    throw error;
  }
});

export default router;
