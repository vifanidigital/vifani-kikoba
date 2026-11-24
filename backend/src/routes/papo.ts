import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { papoPayment, outstandingPapoPrincipal } from '../lib/papoPayment';
import { fundingInput, fundingOrder, fundingEntry, recordFunding } from '../lib/loanFunding';
import { lockLoanGroup, LoanConflict } from './loanQueue';
import { z } from 'zod';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

// 1. HALI YA PAPO YA MWANACHAMA + ORODHA YA MAOMBI & MAREJESHO KWA VIONGOZI
router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    const isLeader = LEADER_ROLES.includes(role);

    const [group, papoAcc, myTopUps, groupPendingTopUps, groupRepayingTopUps] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.papoAccount.findUnique({ where: { userId_groupId: { userId, groupId } } }),
      prisma.papoTopUp.findMany({
        where: { groupId, userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.papoTopUp.findMany({
        where: { groupId, status: 'PENDING' }, include: { user: { select: { fullName: true } } }, orderBy: fundingOrder,
      }),
      isLeader
        ? prisma.papoTopUp.findMany({
            where: { groupId, status: 'REPAYMENT_PENDING' },
            include: { user: { select: { id: true, fullName: true, phone: true } } },
            orderBy: {  createdAt: 'asc'},
          })
        : Promise.resolve([]),
    ]);

    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const mandatoryBalance = group.hasPapo ? (papoAcc?.mandatoryBalance || group.mandatoryPapoAmount) : 0;
    const rate = group.papoMeetingInterest || 0;

    // Hesabu ya Papo zote za hiari zilizo ACTIVE au zinazosubiri uhakiki wa marejesho
    const activeList = myTopUps.filter((t) => t.status === 'ACTIVE' || t.status === 'OVERDUE' || t.status === 'REPAYMENT_PENDING');
    const activeTopUpPrincipal = activeList.reduce((s, t) => s + outstandingPapoPrincipal(t), 0);
    const activeTopUpTotalInterest = activeList.reduce(
      (s, t) => s + Math.round((outstandingPapoPrincipal(t) * rate) / 100),
      0
    );

    const mandatoryMeetingInterest = Math.round((mandatoryBalance * rate) / 100);
    const combinedPapoCapital = mandatoryBalance + activeTopUpPrincipal;
    const combinedMeetingInterest = mandatoryMeetingInterest + activeTopUpTotalInterest;

    const maxCap = group.maxTopUpPapoCap || 0;
    const pendingPrincipal = myTopUps.filter((t) => t.status === 'PENDING').reduce((sum, t) => sum + t.principalAmount, 0);
    const remainingTopUpCap = Math.max(0, maxCap - activeTopUpPrincipal - pendingPrincipal);

    const now = Date.now();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    const formattedTopUps = myTopUps.map((t) => {
      const weeksLeft = t.dueDate
        ? Math.max(0, Math.ceil((new Date(t.dueDate).getTime() - now) / msPerWeek))
        : group.topUpPapoWeeks;
      const interestPerMeeting = Math.round((outstandingPapoPrincipal(t) * rate) / 100);
      return {
        ...t,
        weeksRemaining: weeksLeft,
        interestPerMeeting,
      };
    });

    res.json({
      hasPapo: group.hasPapo,
      allowTopUpPapo: group.allowTopUpPapo,
      minTopUpPapoCap: group.minTopUpPapoCap,
      maxTopUpPapoCap: maxCap,
      remainingTopUpCap,
      topUpPapoWeeks: group.topUpPapoWeeks,
      papoMeetingInterestRate: rate,
      mandatoryBalance,
      activeTopUpPrincipal,
      activeTopUpTotalInterest,
      combinedPapoCapital,
      combinedMeetingInterest,
      topUps: formattedTopUps,
      fundingQueue: groupPendingTopUps.map(fundingEntry),
      repayingTopUpRequests: groupRepayingTopUps,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia taarifa za Papo.' });
  }
});
// 2. MWANACHAMA KUOMBA PAPO YA HIARI (MARA NYINGI HADI UKOMO UFIKE)
router.post('/request-topup', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const amount = Number(req.body.amount);

    const [group, activeTopUps] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.papoTopUp.findMany({
        where: { groupId, userId, status: { in: ['PENDING', 'ACTIVE', 'OVERDUE', 'REPAYMENT_PENDING'] } },
      }),
    ]);

    if (!group || !group.hasPapo || !group.allowTopUpPapo) {
      return res.status(400).json({ error: 'Papo ya hiari haijawashwa kwenye kikoba hiki.' });
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount < group.minTopUpPapoCap) {
      return res.status(400).json({
        error: `Kiasi cha chini cha Papo ya hiari ni TZS ${group.minTopUpPapoCap.toLocaleString()}.`,
      });
    }

    const currentUsed = activeTopUps.reduce((s, t) => s + (t.status === 'PENDING' ? t.principalAmount : outstandingPapoPrincipal(t)), 0);
    const remainingCap = Math.max(0, group.maxTopUpPapoCap - currentUsed);

    if (amount > remainingCap) {
      return res.status(400).json({
        error: `Ukomo wako uliobaki wa Papo ya hiari ni TZS ${remainingCap.toLocaleString()}.`,
      });
    }

    const interestAmount = Math.round((amount * (group.papoMeetingInterest || 0)) / 100);
    const topUp = await prisma.papoTopUp.create({
      data: {
        groupId,
        userId,
        principalAmount: amount,
        interestRate: group.papoMeetingInterest,
        totalPayable: amount + interestAmount,
        status: 'PENDING',
      },
    });

    res.status(201).json({ message: 'Ombi la Papo ya hiari limetumwa kwa viongozi!', topUp });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kutuma ombi la Papo ya hiari.' });
  }
});

// 3. KIONGOZI KUIDHINISHA PAPO YA HIARI (MAJUMA HALISI YA MWENYEKITI BILA JUMA LA ZIADA)
router.post('/approve-topup/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { groupId, role } = req.user!;
  if (!LEADER_ROLES.includes(role)) return res.status(403).json({ error: 'Viongozi pekee wanaweza kurekodi utoaji wa Papo.' });
  const input = fundingInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Weka kiasi halisi cha Papo ulichotoa.' });
  try {
    const funding = await prisma.$transaction(async tx => {
      await lockLoanGroup(tx, groupId);
      const topUp = await tx.papoTopUp.findFirst({ where: { groupId, status: 'PENDING' }, orderBy: fundingOrder });
      if (!topUp || topUp.id !== String(req.params.id)) throw new LoanConflict('Mwanachama wa kwanza kwenye foleni ndiye anayehudumiwa.');
      const member = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: topUp.userId } }, include: { group: { select: { topUpPapoWeeks: true } } } });
      if (!member?.isActive) throw new LoanConflict('Mwanachama huyu si hai.');
      const result = recordFunding(topUp.principalAmount, topUp.fundedAmount ?? 0, input.data.amount, input.data.expectedFunded);
      if (!result) throw new LoanConflict('Kiasi kinazidi fedha zilizobaki kutolewa au taarifa zimebadilika. Sasisha foleni.');
      const cleared = result.remaining === 0;
      const dueDate = new Date(Date.now() + (member.group.topUpPapoWeeks || 4) * 7 * 86400000);
      const changed = await tx.papoTopUp.updateMany({
        where: { id: topUp.id, status: 'PENDING', fundedAmount: topUp.fundedAmount },
        data: { fundedAmount: result.fundedAmount, ...(cleared ? { status: 'ACTIVE', dueDate, feedback: null } : {}) },
      });
      if (!changed.count) throw new LoanConflict('Ombi limebadilika. Sasisha foleni.');
      await tx.transaction.create({ data: { groupId, userId: topUp.userId, type: 'PAPO_TOPUP_DISBURSEMENT',
        amount: Math.round((result.fundedAmount - (topUp.fundedAmount ?? 0)) * 100) / 100, notes: topUp.id } });
      return result;
    });
    res.json({ ...funding, message: funding.remaining ? 'Fedha za sehemu zimerekodiwa.' : 'Papo imetolewa kikamilifu.' });
  } catch (error) {
    if (error instanceof LoanConflict) return res.status(409).json({ error: error.message });
    res.status(500).json({ error: 'Imeshindikana kurekodi utoaji wa Papo.' });
  }
});

// 4. MWANACHAMA KUOMBA KUREJESHA PAPO YA HIARI (ATA KABLA YA SIKU KUFIKA)
router.post('/request-repay-topup/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { userId, groupId } = req.user!;
  const id = String(req.params.id);
  const entry = await prisma.papoTopUp.findFirst({ where: { id, groupId, userId } });
  if (!entry) return res.status(404).json({ error: 'Rekodi ya Papo haijapatikana.' });
  const amount = req.body?.amount ?? Math.round((entry.totalPayable - entry.amountPaid) * 100) / 100;
  if (typeof amount !== 'number' || !papoPayment(entry, amount)) return res.status(400).json({ error: 'Weka kiasi kisichozidi salio la Papo.' });
  const result = await prisma.papoTopUp.updateMany({
    where: { id, groupId, userId, status: { in: ['ACTIVE', 'OVERDUE'] }, amountPaid: entry.amountPaid },
    data: { status: 'REPAYMENT_PENDING', feedback: null, repaymentRequest: { id: randomUUID(), amount } },
  });
  if (!result.count) return res.status(409).json({ error: 'Ombi hili tayari limebadilika.' });
  res.status(201).json({ message: 'Ombi la marejesho ya Papo limetumwa.' });
});

router.post('/confirm-repay-topup/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { groupId, role } = req.user!;
  if (!LEADER_ROLES.includes(role)) return res.status(403).json({ error: 'Viongozi pekee wanaweza kuthibitisha marejesho.' });
  const id = String(req.params.id);
  await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const entry = await tx.papoTopUp.findFirst({ where: { id, groupId, status: 'REPAYMENT_PENDING' } });
    if (!entry) throw new LoanConflict('Hakuna ombi linalosubiri uthibitisho.');
    const request = entry.repaymentRequest as { id: string; amount: number } | null;
    if (request && request.id !== req.body?.requestId) throw new LoanConflict('Ombi limebadilika. Pakia tena kwanza.');
    const amount = request?.amount ?? Math.round((entry.totalPayable - entry.amountPaid) * 100) / 100;
    const payment = papoPayment(entry, amount);
    if (!payment) throw new LoanConflict('Kiasi cha ombi si halali.');
    const result = await tx.papoTopUp.updateMany({
      where: { id, status: 'REPAYMENT_PENDING', amountPaid: entry.amountPaid },
      data: { amountPaid: payment.totalPaid, repaymentRequest: Prisma.DbNull, feedback: 'Marejesho yamethibitishwa.',
        status: payment.remaining === 0 ? 'PAID' : entry.dueDate && entry.dueDate < new Date() ? 'OVERDUE' : 'ACTIVE' },
    });
    if (!result.count) throw new LoanConflict('Ombi tayari limebadilika.');
    if (payment.principal > 0) await tx.transaction.create({ data: { groupId, userId: entry.userId, type: 'PAPO_TOPUP_REPAYMENT', amount: payment.principal, notes: id } });
    if (payment.interest > 0) await tx.transaction.create({ data: { groupId, userId: entry.userId, type: 'PAPO_TOPUP_INTEREST_REPAYMENT', amount: payment.interest, notes: id } });
  });
  res.json({ message: 'Marejesho yamethibitishwa na salio la Papo limesasishwa.' });
});

router.post('/decline/:id/:stage', authenticateToken, async (req: AuthRequest, res) => {
  const { groupId, role } = req.user!;
  if (!LEADER_ROLES.includes(role)) return res.sendStatus(403);
  const input = z.object({ stage: z.enum(['application', 'repayment']), reason: z.string().trim().min(3).max(300) })
    .safeParse({ stage: req.params.stage, reason: req.body?.reason });
  if (!input.success) return res.status(400).json({ error: 'Andika sababu ya kukataa.' });
  const repayment = input.data.stage === 'repayment';
  const result = await prisma.papoTopUp.updateMany({
    where: { id: String(req.params.id), groupId, status: repayment ? 'REPAYMENT_PENDING' : 'PENDING', ...(repayment ? {} : { OR: [{ fundedAmount: null }, { fundedAmount: 0 }] }) },
    data: { status: repayment ? 'ACTIVE' : 'REJECTED', feedback: input.data.reason, repaymentRequest: Prisma.DbNull },
  });
  if (!result.count) return res.status(409).json({ error: 'Ombi hili halisubiri uamuzi.' });
  res.json({ message: 'Ombi limekataliwa na sababu inaonekana kwa mwanachama.' });
});

router.use((error: unknown, _req: AuthRequest, res: Response, _next: import('express').NextFunction) => {
  if (error instanceof LoanConflict) return res.status(409).json({ error: error.message });
  console.error('Papo workflow failed', error instanceof Error ? error.name : 'Unknown');
  res.status(500).json({ error: 'Ombi la Papo halijakamilika.' });
});

export default router;