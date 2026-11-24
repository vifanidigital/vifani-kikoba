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

    const mandatoryBalance = papoAcc?.mandatoryBalance || 0;
    const rate = group.papoMeetingInterest || 0;

    // Hesabu ya Papo zote za hiari zilizo ACTIVE au zinazosubiri uhakiki wa marejesho
    const activeList = myTopUps.filter((t) => t.status === 'ACTIVE' || t.status === 'OVERDUE' || t.status === 'REPAYMENT_PENDING');
    const activeTopUpPrincipal = activeList.reduce((s, t) => s + t.principalAmount, 0);
    const activeTopUpTotalInterest = activeList.reduce(
      (s, t) => s + Math.round((t.principalAmount * rate) / 100),
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
      const interestPerMeeting = Math.round((t.principalAmount * rate) / 100);
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

    const currentUsed = activeTopUps.reduce((s, t) => s + t.principalAmount, 0);
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
  try {
    const { userId, groupId } = req.user!;
    const id = String(req.params.id);

    const topUp = await prisma.papoTopUp.findUnique({ where: { id } });
    if (!topUp || topUp.groupId !== groupId || topUp.userId !== userId) {
      return res.status(404).json({ error: 'Rekodi ya Papo haijapatikana.' });
    }

    const requested = await prisma.papoTopUp.updateMany({
      where: { id, groupId, userId, status: { in: ['ACTIVE', 'OVERDUE'] } },
      data: { status: 'REPAYMENT_PENDING', feedback: null },
    });
    if (!requested.count) return res.status(409).json({ error: 'Papo hii haiwezi kuombewa marejesho kwa sasa.' });

    res.json({ message: 'Ombi la kurejesha Papo ya hiari limetumwa kwa kiongozi kuthibitisha!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kutuma ombi la marejesho.' });
  }
});

// 5. KIONGOZI KUTHIBITISHA MAREJESHO YA PAPO YA HIARI (INAFUTIKA KWENYE MADENI)
router.post('/confirm-repay-topup/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuthibitisha marejesho.' });
    }

    const id = String(req.params.id);
    const topUp = await prisma.papoTopUp.findUnique({ where: { id } });
    if (!topUp || topUp.groupId !== groupId) {
      return res.status(404).json({ error: 'Rekodi haijapatikana.' });
    }

    const recorded = await prisma.$transaction(async (tx) => {
      const updated = await tx.papoTopUp.updateMany({
        where: { id, groupId, status: 'REPAYMENT_PENDING', amountPaid: topUp.amountPaid },
        data: {
          status: 'PAID',
          feedback: null,
          amountPaid: topUp.totalPayable,
        },
      });

      if (!updated.count) return false;
      const principalRemaining = Math.max(0, topUp.principalAmount - Math.max(0, topUp.amountPaid - (topUp.totalPayable - topUp.principalAmount)));
      if (principalRemaining > 0) await tx.transaction.create({
        data: {
          groupId,
          userId: topUp.userId,
          type: 'PAPO_TOPUP_REPAYMENT',
          amount: principalRemaining,
          notes: 'Marejesho ya mtaji wa Papo ya hiari',
        },
      });
      return true;
    });
    if (!recorded) return res.status(409).json({ error: 'Papo hii haisubiri uthibitisho wa marejesho.' });

    res.json({ message: 'Marejesho ya Papo ya hiari yamethibitishwa na kufutwa kwenye madeni!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuthibitisha marejesho.' });
  }
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
    data: { status: repayment ? 'ACTIVE' : 'REJECTED', feedback: input.data.reason },
  });
  if (!result.count) return res.status(409).json({ error: 'Ombi hili halisubiri uamuzi.' });
  res.json({ message: 'Ombi limekataliwa na sababu inaonekana kwa mwanachama.' });
});

export default router;