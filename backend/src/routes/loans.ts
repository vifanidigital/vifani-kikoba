import { interestTiming, unpaidInterestInstallments } from '../lib/loanInterest';
import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;

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

    const payments = await prisma.transaction.findMany({
      where: { groupId, type: 'LOAN_INTEREST_REPAYMENT', userId: LEADER_ROLES.includes(role) ? undefined : userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { fullName: true } } },
    });
    const interestPayments = payments.map(payment => ({
      id: payment.id,
      userId: payment.userId,
      fullName: payment.user.fullName,
      amount: payment.amount,
      paidAt: payment.createdAt,
      dueAt: payment.interestDueAt,
      timing: interestTiming(payment),
    }));

    res.json({
      loans: loans.filter(loan => LEADER_ROLES.includes(role) || loan.userId === userId)
        .map(loan => ({ ...loan, nextInterestInstallment: unpaidInterestInstallments(loan)[0] ?? null })),
      interestPayments,
      effectiveMaxLoan,
      myInterestProfit: interestPayments
        .filter(payment => payment.userId === userId && payment.timing === 'ON_TIME')
        .reduce((sum, payment) => sum + payment.amount, 0),
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

    const [guarantorRequests, leaderPendingLoans, myActiveLoans, guarantorRepaidNotices, unreadAnnouncements] = await Promise.all([
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
      prisma.loan.findMany({
        where: { groupId, userId, status: { in: ['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'] }, acks: { none: { userId } } },
        include: { user: { select: { fullName: true } }, guarantor: { select: { fullName: true } } },
        orderBy: { disbursedAt: 'desc' },
      }),
    ]);

    res.json({
      guarantorRequests,
      leaderPendingLoans,
      unreadAnnouncements,
      myActiveLoans,
      guarantorRepaidNotices,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia arifa za dashboard.' });
  }
});
router.post('/acknowledge/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, userId } = req.user!;
    const loan = await prisma.loan.findFirst({
      where: { id: String(req.params.id), groupId, userId, disbursedAt: { not: null } },
      select: { id: true },
    });
    if (!loan) return res.status(404).json({ error: 'Taarifa ya mkopo haipatikani.' });
    await prisma.loanAnnouncementAck.upsert({
      where: { loanId_userId: { loanId: loan.id, userId } },
      create: { loanId: loan.id, userId },
      update: {},
    });
    res.json({ message: 'Taarifa imesomwa.' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuweka alama ya kusoma.' });
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

    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAllowed) {
      return res.status(400).json({
        error: `Kiasi kimezidi ukomo wako wa mkopo (TZS ${maxAllowed.toLocaleString()}).`,
      });
    }

    if (group.requireGuarantor && !guarantorId) {
      return res.status(400).json({ error: 'Lazima uchague mdhamini.' });
    }

    if (guarantorId) {
      const guarantor = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: guarantorId } } });
      if (guarantorId === userId || !guarantor?.isActive) {
        return res.status(400).json({ error: 'Chagua mdhamini tofauti aliye hai kwenye kikundi hiki.' });
      }
    }
    const months = Math.max(1, group.maxRepaymentMonths || 1);
    const interest = Math.round((amount * (group.interestRate ?? 10) * months) / 100);

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
    const { userId, groupId } = req.user!;
    const id = String(req.params.id);
    const decision = String(req.body.decision);

    const loan = await prisma.loan.findUnique({ where: { id } });
    if (decision !== 'ACCEPT' && decision !== 'REJECT') return res.status(400).json({ error: 'Chagua jibu halali.' });
    if (!loan || loan.groupId !== groupId || loan.guarantorId !== userId) {
      return res.status(404).json({ error: 'Ombi halijapatikana.' });
    }

    const changed = await prisma.loan.updateMany({
      where: { id, groupId, guarantorId: userId, status: 'PENDING', guarantorStatus: 'PENDING' },
      data: {
        guarantorStatus: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        status: decision === 'ACCEPT' ? 'PENDING' : 'REJECTED',
      },
    });

    if (!changed.count) return res.status(409).json({ error: 'Ombi hili halisubiri jibu la udhamini.' });
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

    const disbursedAt = new Date();
    const dueDate = new Date(disbursedAt.getTime() + (loan.repaymentMonths || 1) * 30 * 24 * 60 * 60 * 1000);
    const nextInterestDue = unpaidInterestInstallments({ ...loan, disbursedAt })[0]?.dueAt ?? null;
    const approved = await prisma.loan.updateMany({
      where: { id, groupId, status: 'PENDING', OR: [{ guarantorId: null }, { guarantorStatus: 'ACCEPTED' }], group: { members: { some: { userId: loan.userId, isActive: true } } } },
      data: { status: 'DISBURSED', disbursedAt, dueDate, nextInterestDue },
    });
    if (!approved.count) return res.status(409).json({ error: 'Mkopo hausubiri idhini, udhamini haujakubaliwa au mwanachama si hai.' });

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

    if (!['DISBURSED', 'OVERDUE'].includes(loan.status)) {
      return res.status(409).json({ error: 'Mkopo huu haupo kwenye hali ya kulipia riba ya mwezi.' });
    }
    const [installment, following] = unpaidInterestInstallments(loan);
    if (!installment || installment.number >= loan.repaymentMonths) {
      return res.status(400).json({ error: 'Riba ya mwisho inalipwa pamoja na mtaji.' });
    }
    if (req.body?.expectedAmountPaid !== undefined && req.body.expectedAmountPaid !== loan.amountPaid) {
      return res.status(409).json({ error: 'Malipo yamebadilika. Sasisha orodha kwanza.' });
    }
    const createdAt = new Date();
    const recorded = await prisma.$transaction(async tx => {
      const updated = await tx.loan.updateMany({
        where: { id, groupId, amountPaid: loan.amountPaid, status: loan.status },
        data: { amountPaid: { increment: installment.amount }, nextInterestDue: following?.dueAt ?? null },
      });
      if (!updated.count) return false;
      await tx.transaction.create({
        data: {
          groupId, userId: loan.userId, type: 'LOAN_INTEREST_REPAYMENT',
          amount: installment.amount, interestLoanId: id, interestDueAt: installment.dueAt,
          createdAt, notes: 'Malipo ya riba ya mwezi ya mkopo mkubwa',
        },
      });
      return true;
    });
    if (!recorded) return res.status(409).json({ error: 'Malipo yamebadilika. Sasisha orodha kwanza.' });
    res.json({ message: 'Malipo ya riba yamerekodiwa.' });
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
    const requested = await prisma.loan.updateMany({
      where: { id, groupId, userId, status: { in: ['DISBURSED', 'OVERDUE'] } },
      data: { status: 'REPAYMENT_PENDING' },
    });
    if (!requested.count) return res.status(409).json({ error: 'Mkopo huu hauwezi kuombewa marejesho kwa sasa.' });
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

    if (loan.status !== 'REPAYMENT_PENDING') {
      return res.status(409).json({ error: 'Mkopo hausubiri uthibitisho wa marejesho.' });
    }
    const installments = unpaidInterestInstallments(loan);
    const remainingPrincipal = Math.max(0, loan.totalRepayable - loan.amountPaid - installments.reduce((sum, row) => sum + row.amount, 0));
    const createdAt = new Date();
    const recorded = await prisma.$transaction(async tx => {
      const updated = await tx.loan.updateMany({
        where: { id, groupId, status: 'REPAYMENT_PENDING', amountPaid: loan.amountPaid },
        data: {
          status: 'PAID',
          amountPaid: loan.totalRepayable,
          nextInterestDue: null,
          guarantorStatus: loan.guarantorId ? 'REPAID_NOTIFY' : loan.guarantorStatus,
        },
      });
      if (!updated.count) return false;
      if (remainingPrincipal > 0) {
        await tx.transaction.create({
          data: { groupId, userId: loan.userId, type: 'LOAN_REPAYMENT',
            amount: remainingPrincipal, notes: 'Marejesho ya mtaji wa mkopo mkubwa' },
        });
      }
      if (installments.length) {
        await tx.transaction.createMany({
          data: installments.map(installment => ({
            groupId, userId: loan.userId, type: 'LOAN_INTEREST_REPAYMENT',
            amount: installment.amount, interestLoanId: id, interestDueAt: installment.dueAt,
            createdAt, notes: 'Malipo ya riba ya mkopo mkubwa',
          })),
        });
      }
      return true;
    });

    if (!recorded) return res.status(409).json({ error: 'Marejesho haya tayari yamebadilika.' });
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
