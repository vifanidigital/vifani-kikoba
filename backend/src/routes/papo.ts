import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
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
      isLeader
        ? prisma.papoTopUp.findMany({
            where: { groupId, status: 'PENDING' },
            include: { user: { select: { id: true, fullName: true, phone: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
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
    const remainingTopUpCap = Math.max(0, maxCap - activeTopUpPrincipal);

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
      pendingTopUpRequests: groupPendingTopUps,
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

    if (!amount || amount < group.minTopUpPapoCap) {
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
        interestAmount,
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
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuidhinisha.' });
    }

    const id = String(req.params.id);
    const [topUp, group] = await Promise.all([
      prisma.papoTopUp.findUnique({ where: { id } }),
      prisma.group.findUnique({ where: { id: groupId } }),
    ]);

    if (!topUp || topUp.groupId !== groupId || !group) {
      return res.status(404).json({ error: 'Ombi halijapatikana.' });
    }

    // Tarehe halisi ya kurejesha = Leo + (topUpPapoWeeks * siku 7) bila juma la ziada
    const dueDate = new Date(Date.now() + (group.topUpPapoWeeks || 4) * 7 * 24 * 60 * 60 * 1000);

    await prisma.papoTopUp.update({
      where: { id },
      data: { status: 'ACTIVE', dueDate },
    });

    res.json({
      message: `Papo ya hiari imeidhinishwa! Siku ya kurejesha ni ${dueDate.toLocaleDateString('sw-TZ')} (Majuma ${group.topUpPapoWeeks}).`,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuidhinisha Papo ya hiari.' });
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

    await prisma.papoTopUp.update({
      where: { id },
      data: { status: 'REPAYMENT_PENDING' },
    });

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

    await prisma.$transaction(async (tx) => {
      await tx.papoTopUp.update({
        where: { id },
        data: {
          status: 'PAID',
          amountPaid: topUp.totalPayable,
        },
      });

      await tx.transaction.create({
        data: {
          groupId,
          userId: topUp.userId,
          type: 'PAPO_TOPUP_REPAYMENT',
          amount: topUp.principalAmount,
          notes: 'Marejesho ya mtaji wa Papo ya hiari',
        },
      });
    });

    res.json({ message: 'Marejesho ya Papo ya hiari yamethibitishwa na kufutwa kwenye madeni!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuthibitisha marejesho.' });
  }
});

export default router;