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
      memberships,
      allShares,
      allPapoAccounts,
      allPaidFines,
      allUnpaidFines,
      allLoans,
      allTopUps,
      expensesAgg,
    ] = await Promise.all([
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
    ]);

    const totalGroupSharesCount = allShares.reduce((s, r) => s + r.sharesCount, 0);
    const totalGroupSharesValue = allShares.reduce((s, r) => s + r.amountPaid, 0);
    const totalGroupSocialFund = allShares.reduce((s, r) => s + r.socialFundPaid, 0);
    const totalGroupPaidFines = allPaidFines.reduce((s, f) => s + f.amount, 0);
    const totalExpenses = expensesAgg._sum.amount || 0;

    // Jumla ya faida zote za kikundi zinazogawiwa kwa uwiano wa hisa
    let totalLoanInterestCollected = 0;
    for (const l of allLoans) {
      const interestPart = Math.max(0, (l.totalRepayable || 0) - (l.principalAmount || 0));
      totalLoanInterestCollected += Math.min(interestPart, l.amountPaid || 0);
    }

    let totalPapoInterestCollected = 0;
    for (const t of allTopUps) {
      const interestPart = Math.max(0, (t.totalPayable || 0) - (t.principalAmount || 0));
      totalPapoInterestCollected += Math.min(interestPart, t.amountPaid || 0);
    }

    // Faida ya pamoja inayogawiwa kwa uwiano wa hisa (Riba zote + Faini zilizolipwa - Matumizi ya uendeshaji)
    const distributableProfitPool = Math.max(
      0,
      totalLoanInterestCollected + totalPapoInterestCollected + totalGroupPaidFines - totalExpenses
    );

    const breakdownByMember = memberships.map((m) => {
      const mySharesList = allShares.filter((s) => s.userId === m.userId);
      const mySharesCount = mySharesList.reduce((s, r) => s + r.sharesCount, 0);
      const myCapital = mySharesList.reduce((s, r) => s + r.amountPaid, 0);
      const myPapoMandatory = allPapoAccounts.find((p) => p.userId === m.userId)?.mandatoryBalance || 0;

      // Gawio la faida kwa uwiano wa hisa zake
      const shareRatio = totalGroupSharesCount > 0 ? mySharesCount / totalGroupSharesCount : 0;
      const estimatedProfitDividend = Math.round(distributableProfitPool * shareRatio);

      // Makato ya madeni yake yote (Mikopo mikubwa + Papo ya hiari + Faini zisizolipwa)
      const myActiveLoansDebt = allLoans
        .filter((l) => l.userId === m.userId && (l.status === 'DISBURSED' || l.status === 'OVERDUE'))
        .reduce((s, l) => s + Math.max(0, (l.totalRepayable || 0) - (l.amountPaid || 0)), 0);

      const myActiveTopUpDebt = allTopUps
        .filter((t) => t.userId === m.userId && (t.status === 'ACTIVE' || t.status === 'OVERDUE'))
        .reduce((s, t) => s + Math.max(0, (t.totalPayable || 0) - (t.amountPaid || 0)), 0);

      const myUnpaidFines = allUnpaidFines
        .filter((f) => f.userId === m.userId)
        .reduce((s, f) => s + f.amount, 0);

      const totalDeductions = myActiveLoansDebt + myActiveTopUpDebt + myUnpaidFines;
      const grossPayout = myCapital + myPapoMandatory + estimatedProfitDividend;
      const netPayout = Math.max(0, grossPayout - totalDeductions);

      return {
        userId: m.userId,
        fullName: m.user.fullName,
        mySharesCount,
        myCapital,
        myPapoMandatory,
        estimatedProfitDividend,
        totalDeductions,
        grossPayout,
        netPayout,
      };
    });

    const myEstimate = breakdownByMember.find((x) => x.userId === userId) || null;

    res.json({
      totalGroupSharesValue,
      totalGroupSocialFund,
      distributableProfitPool,
      totalExpenses,
      myEstimate,
      membersPayout: breakdownByMember,
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

    if (title.length < 2 || !amount || amount <= 0) {
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
