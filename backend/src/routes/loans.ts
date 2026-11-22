import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;

    const [group, member, myShares, loans, membersList] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.groupMember.findUnique({ where: { userId_groupId: { userId, groupId } } }),
      prisma.shareRecord.aggregate({ where: { groupId, userId }, _sum: { amountPaid: true } }),
      prisma.loan.findMany({
        where: { groupId },
        include: {
          user: { select: { id: true, fullName: true, phone: true } },
          guarantor: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.groupMember.findMany({
        where: { groupId, isActive: true, userId: { not: userId } },
        include: { user: { select: { id: true, fullName: true, phone: true } } },
      }),
    ]);

    if (!group || !member) return res.status(404).json({ error: 'Taarifa hazijapatikana.' });

    const mySharesVal = myShares._sum.amountPaid || 0;
    const multiplier = group.loanLimitMultiplier || 3;
    const activeDebt = loans
      .filter((l: any) => l.userId === userId && ['PENDING', 'DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'].includes(l.status))
      .reduce((s: number, l: any) => s + Math.max(0, l.totalRepayable - l.amountPaid), 0);

    let rawMax = mySharesVal * multiplier;
    if (group.maxBigLoanCap && group.maxBigLoanCap > 0) {
      rawMax = Math.min(rawMax, group.maxBigLoanCap);
    }
    const effectiveMaxLoan = Math.max(0, rawMax - activeDebt);

    const guarantorRequests = loans.filter(
      (l: any) => l.guarantorId === userId && l.guarantorStatus === 'PENDING' && l.status === 'PENDING'
    );

    res.json({
      loans,
      effectiveMaxLoan,
      myInterestProfit: member.memberInterestProfit || 0,
      interestRate: group.interestRate,
      maxRepaymentMonths: group.maxRepaymentMonths,
      requireGuarantor: group.requireGuarantor,
      guarantorRequests,
      potentialGuarantors: membersList.map((m: any) => m.user),
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia mikopo.' });
  }
});

router.get('/dashboard-feed', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    const isLeader = LEADER_ROLES.includes(role);

    const [guarantorRequests, leaderPendingLoans, myActiveLoans, guarantorRepaidNotices] = await Promise.all([
      prisma.loan.findMany({
        where: { groupId, guarantorId: userId, guarantorStatus: 'PENDING', status: 'PENDING' },
        include: { user: { select: { fullName: true } } },
      }),
      isLeader
        ? prisma.loan.findMany({
            where: { groupId, status: 'PENDING' },
            include: {
              user: { select: { fullName: true } },
              guarantor: { select: { fullName: true } },
            },
          })
        : Promise.resolve([]),
      prisma.loan.findMany({
        where: { groupId, userId, status: { in: ['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'] } },
        include: { guarantor: { select: { fullName: true } } },
      }),
      prisma.loan.findMany({
        where: { groupId, guarantorId: userId, guarantorStatus: 'REPAID_NOTIFY' },
        include: { user: { select: { fullName: true } } },
      }),
    ]);

    res.json({
      guarantorRequests,
      leaderPendingLoans,
      unreadAnnouncements: [],
      myActiveLoans,
      guarantorRepaidNotices,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia arifa za dashboard.' });
  }
});
router.post('/apply', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const amount = Number(req.body.amount);
    const guarantorId = req.body.guarantorId ? String(req.body.guarantorId) : null;

    const [group, myShares, activeLoans] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.shareRecord.aggregate({ where: { groupId, userId }, _sum: { amountPaid: true } }),
      prisma.loan.findMany({
        where: { groupId, userId, status: { in: ['PENDING', 'DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'] } },
      }),
    ]);

    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const mySharesVal = myShares._sum.amountPaid || 0;
    const activeDebt = activeLoans.reduce((s: number, l: any) => s + Math.max(0, l.totalRepayable - l.amountPaid), 0);
    let rawMax = mySharesVal * (group.loanLimitMultiplier || 3);
    if (group.maxBigLoanCap && group.maxBigLoanCap > 0) {
      rawMax = Math.min(rawMax, group.maxBigLoanCap);
    }
    const maxAllowed = Math.max(0, rawMax - activeDebt);

    if (!amount || amount <= 0 || amount > maxAllowed) {
      return res.status(400).json({
        error: `Kiasi kimezidi ukomo wako wa mkopo (TZS ${maxAllowed.toLocaleString()}).`,
      });
    }

    if (group.requireGuarantor && !guarantorId) {
      return res.status(400).json({ error: 'Lazima uchague mdhamini.' });
    }

    const months = Math.max(1, group.maxRepaymentMonths || 1);
    const interest = Math.round((amount * (group.interestRate || 10) * months) / 100);

    const loan = await prisma.loan.create({
      data: {
        groupId,
        userId,
        principalAmount: amount,
        repaymentMonths: months,
        totalRepayable: amount + interest,
        guarantorId,
        guarantorStatus: guarantorId ? 'PENDING' : 'ACCEPTED',
        status: 'PENDING',
      },
    });

    res.status(201).json({ message: 'Ombi la mkopo limetumwa kikamilifu!', loan });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kutuma ombi la mkopo.' });
  }
});

router.post('/guarantor-respond/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const id = String(req.params.id);
    const decision = String(req.body.decision);

    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.guarantorId !== userId) {
      return res.status(404).json({ error: 'Ombi halijapatikana.' });
    }

    await prisma.loan.update({
      where: { id },
      data: {
        guarantorStatus: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        status: decision === 'ACCEPT' ? 'PENDING' : 'REJECTED',
      },
    });

    res.json({ message: decision === 'ACCEPT' ? 'Umekubali kuwa mdhamini!' : 'Umekataa udhamini.' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kujibu udhamini.' });
  }
});

router.post('/approve/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuidhinisha.' });
    }

    const id = String(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.groupId !== groupId) {
      return res.status(404).json({ error: 'Mkopo haujapatikana.' });
    }

    const dueDate = new Date(Date.now() + (loan.repaymentMonths || 1) * 30 * 24 * 60 * 60 * 1000);

    await prisma.loan.update({
      where: { id },
      data: { status: 'DISBURSED', disbursedAt: new Date(), dueDate },
    });

    res.json({ message: 'Mkopo umeidhinishwa na kutolewa!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuidhinisha mkopo.' });
  }
});
router.post('/pay-monthly-interest/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuthibitisha malipo ya riba.' });
    }
    const id = String(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.groupId !== groupId) {
      return res.status(404).json({ error: 'Mkopo haujapatikana.' });
    }

    const months = Math.max(1, loan.repaymentMonths || 1);
    const totalInterest = Math.max(0, loan.totalRepayable - loan.principalAmount);
    const oneMonthInterest = Math.round(totalInterest / months);

    await prisma.$transaction(async (tx: any) => {
      await tx.loan.update({
        where: { id },
        data: { amountPaid: { increment: oneMonthInterest }, status: 'DISBURSED' },
      });

      await tx.transaction.create({
        data: {
          groupId,
          userId: loan.userId,
          type: 'LOAN_INTEREST_REPAYMENT',
          amount: oneMonthInterest,
          notes: 'Malipo ya riba ya mwezi ya mkopo mkubwa',
        },
      });
    });

    res.json({ message: `Riba ya mwezi (TZS ${oneMonthInterest.toLocaleString()}) imelipwa na kufutwa!` });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kurekodi malipo ya riba.' });
  }
});

router.post('/request-repay/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const id = String(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.groupId !== groupId || loan.userId !== userId) {
      return res.status(404).json({ error: 'Mkopo haujapatikana.' });
    }
    await prisma.loan.update({
      where: { id },
      data: { status: 'REPAYMENT_PENDING' },
    });
    res.json({ message: 'Ombi la kurejesha mkopo limetumwa kwa kiongozi kuthibitisha!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kutuma ombi la marejesho.' });
  }
});

router.post('/confirm-repay/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuthibitisha marejesho.' });
    }
    const id = String(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.groupId !== groupId) {
      return res.status(404).json({ error: 'Mkopo haujapatikana.' });
    }

    const remainingTotal = Math.max(0, loan.totalRepayable - loan.amountPaid);
    const totalInterest = Math.max(0, loan.totalRepayable - loan.principalAmount);
    const remainingInterest = Math.max(0, totalInterest - Math.min(totalInterest, loan.amountPaid));
    const remainingPrincipal = Math.max(0, remainingTotal - remainingInterest);

    await prisma.$transaction(async (tx: any) => {
      await tx.loan.update({
        where: { id },
        data: {
          status: 'PAID',
          amountPaid: loan.totalRepayable,
          guarantorStatus: loan.guarantorId ? 'REPAID_NOTIFY' : loan.guarantorStatus,
        },
      });

      if (remainingPrincipal > 0) {
        await tx.transaction.create({
          data: {
            groupId,
            userId: loan.userId,
            type: 'LOAN_REPAYMENT',
            amount: remainingPrincipal,
            notes: 'Marejesho ya mtaji wa mkopo mkubwa',
          },
        });
      }

      if (remainingInterest > 0) {
        await tx.transaction.create({
          data: {
            groupId,
            userId: loan.userId,
            type: 'LOAN_INTEREST_REPAYMENT',
            amount: remainingInterest,
            notes: 'Malipo ya riba ya mkopo mkubwa',
          },
        });
      }
    });

    res.json({ message: 'Marejesho yamethibitishwa na mdhamini amearifiwa!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuthibitisha marejesho.' });
  }
});

router.post('/dismiss-guarantor-notice/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.user!;
    const id = String(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.guarantorId !== userId) {
      return res.status(404).json({ error: 'Taarifa haijapatikana.' });
    }
    await prisma.loan.update({
      where: { id },
      data: { guarantorStatus: 'ACCEPTED' },
    });
    res.json({ message: 'Ujumbe umefutwa.' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kufuta ujumbe.' });
  }
});

export default router;
