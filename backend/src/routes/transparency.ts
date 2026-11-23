import { calculateShareOut } from '../lib/shareOut';
import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

// 1. KIKOKOTOO CHA MGAWO WA MWISHO WA MZUNGUKO (LIVE SHARE-OUT SIMULATOR)
router.get('/share-out', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;

    const [
      group,
      memberships,
      allShares,
      allPapoAccounts,
      allPaidFines,
      allUnpaidFines,
      allLoans,
      allTopUps,
      expensesAgg,
      transactions,
    ] = await prisma.$transaction([
      prisma.group.findUnique({ where: { id: groupId }, select: { groupType: true } }),
      prisma.groupMember.findMany({
        where: { groupId, isActive: true },
        include: { user: { select: { id: true, fullName: true, phone: true } } },
      }),
      prisma.shareRecord.findMany({ where: { groupId } }),
      prisma.papoAccount.findMany({ where: { groupId } }),
      prisma.fineRecord.findMany({ where: { groupId, isPaid: true } }),
      prisma.fineRecord.findMany({ where: { groupId, isPaid: false } }),
      prisma.loan.findMany({ where: { groupId } }),
      prisma.papoTopUp.findMany({ where: { groupId } }),
      prisma.groupExpense.aggregate({ where: { groupId }, _sum: { amount: true } }),
      prisma.transaction.findMany({ where: { groupId, type: { in: ['PAPO_INTEREST', 'LOAN_INTEREST_REPAYMENT'] } } }),
    ], { isolationLevel: 'RepeatableRead' });

    if (!group || !memberships.some(member => member.userId === userId)) {
      return res.status(404).json({ error: 'Uanachama hai wa kikundi haujapatikana.' });
    }
    if (!['KIKOBA', 'SHARES'].includes(group.groupType)) {
      return res.status(400).json({ error: 'Kanuni ya mgawo wa aina hii ya kikundi bado haijapatikana.' });
    }
    const result = calculateShareOut({
      members: memberships.map(member => ({ userId: member.userId, fullName: member.user.fullName })),
      shares: allShares,
      papoAccounts: allPapoAccounts,
      periodicPapo: transactions.filter(row => row.type === 'PAPO_INTEREST'),
      interest: transactions.filter(row => row.type === 'LOAN_INTEREST_REPAYMENT'),
      loans: allLoans,
      topUps: allTopUps,
      unpaidFines: allUnpaidFines,
      paidFines: allPaidFines.reduce((sum, fine) => sum + fine.amount, 0),
      expenses: expensesAgg._sum.amount ?? 0,
    });
    const myEstimate = result.membersPayout.find(member => member.userId === userId) ?? null;
    res.json({
      ...result,
      membersPayout: myEstimate ? [myEstimate] : [],
      myEstimate,
      calculation: 'KIKOBA_EQUAL_V1',
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kukokotoa mgawo wa mwisho wa mzunguko.' });
  }
});

// 2. DAFTARI LA UWAZI WA MATUMIZI & MFUKO WA JAMII
router.get('/expenses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const expenses = await prisma.groupExpense.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ expenses });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia daftari la matumizi.' });
  }
});

router.post('/expenses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kurekodi matumizi.' });
    }

    const category = String(req.body.category || 'SOCIAL_FUND').toUpperCase();
    const title = String(req.body.title || '').trim();
    const beneficiary = String(req.body.beneficiary || '').trim();
    const amount = Number(req.body.amount);

    if (title.length < 2 || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Weka maelezo ya matumizi na kiasi sahihi.' });
    }

    const recorder = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });

    const expense = await prisma.groupExpense.create({
      data: {
        groupId,
        category,
        title,
        beneficiary: beneficiary || null,
        amount,
        recordedBy: recorder?.fullName || 'Kiongozi',
      },
    });

    res.status(201).json({ message: 'Matumizi yamerekodiwa kwenye daftari la uwazi!', expense });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kurekodi matumizi.' });
  }
});

// 3. KUMBUKUMBU YA MABADILIKO YA SHERIA (KATIBA AUDIT LOG)
router.get('/audit-logs', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const logs = await prisma.ruleChangeLog.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ logs });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia historia ya katiba.' });
  }
});

export default router;
