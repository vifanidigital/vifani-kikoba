import { fundingInput, fundingOrder, fundingEntry, recordFunding } from '../lib/loanFunding';
import { calendarLoanDue, currentLoanQuote, blankRepaymentPlan, RepaymentPlan } from '../lib/loanRepayment';
import loanQueue, { takeLoanTurn, LoanConflict, LoanQueue, lockLoanGroup } from './loanQueue';
import loanPayments from './loanPayments';
import { interestTiming, unpaidInterestInstallments } from '../lib/loanInterest';
import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
router.use('/queue', loanQueue);
router.use('/payments', loanPayments);
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
      .reduce((s: number, l: any) => s + (currentLoanQuote(l)?.dueBalance ?? Math.max(0, l.totalRepayable - l.amountPaid)), 0);

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
        .map(loan => ({ ...loan, repaymentQuote: currentLoanQuote(loan), nextInterestInstallment: loan.repaymentPlan ? null : unpaidInterestInstallments(loan)[0] ?? null })),
      fundingQueue: loans.filter(loan => loan.status === 'PENDING')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
        .map(loan => ({ ...fundingEntry(loan), needsGuarantor: Boolean(loan.guarantorId && loan.guarantorStatus !== 'ACCEPTED') })),
      guarantorRepaidNotices: loans.filter(loan => loan.guarantorId === userId && loan.guarantorStatus === 'REPAID_NOTIFY')
        .map(loan => ({ id: loan.id, name: loan.user.fullName })),
      interestPayments,
      effectiveMaxLoan,
      myInterestProfit: interestPayments
        .filter(payment => payment.userId === userId && payment.timing === 'ON_TIME')
        .reduce((sum, payment) => sum + payment.amount, 0),
      interestRate: 10,
      maxRepaymentMonths: 2,
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

    const [guarantorRequests, leaderPendingLoans, myActiveLoans, guarantorRepaidNotices, unreadAnnouncements, recentLoans, recentPapo, queue, loanPaymentsPending, papoRequestsPending] = await Promise.all([
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
      prisma.loan.findMany({ where: { groupId, userId }, orderBy: { createdAt: 'desc' }, take: 12,
        select: { id: true, feedback: true, repaymentPlan: true } }),
      prisma.papoTopUp.findMany({ where: { groupId, userId, feedback: { not: null } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, feedback: true } }),
      prisma.group.findUnique({ where: { id: groupId }, select: { loanQueue: true } }),
      role === 'CHAIRPERSON' ? prisma.loan.count({ where: { groupId, status: 'REPAYMENT_PENDING', repaymentPlan: { not: Prisma.DbNull } } }) : Promise.resolve(0),
      isLeader ? prisma.papoTopUp.count({ where: { groupId, status: { in: ['PENDING', 'REPAYMENT_PENDING'] } } }) : Promise.resolve(0),
    ]);
    const swaps = (queue?.loanQueue as LoanQueue | undefined)?.swaps ?? [];
    const requestFeedback = [
      ...recentLoans.flatMap(loan => {
        const latest = (loan.repaymentPlan as RepaymentPlan | null)?.latest;
        if (loan.feedback) return [{ id: loan.id, message: 'Mkopo: ' + loan.feedback }];
        if (latest?.status === 'REJECTED') return [{ id: latest.id, message: 'Marejesho ya mkopo: ' + latest.reason }];
        if (latest?.status === 'APPROVED') return [{ id: latest.id, message: 'Marejesho ya mkopo yamethibitishwa.' }];
        return [];
      }),
      ...recentPapo.map(row => ({ id: row.id, message: 'Papo: ' + row.feedback })),
      ...swaps.filter(row => row.from === userId && row.status !== 'PENDING').slice(0, 3)
        .map(row => ({ id: row.id, message: row.status === 'ACCEPTED' ? 'Ombi la kubadili namba limekubaliwa.' : 'Ombi la kubadili namba limekataliwa.' })),
    ].slice(0, 8);
    res.json({
      requestFeedback,
      loanPaymentsPending, papoRequestsPending,
      swapRequestsPending: swaps.filter(row => row.to === userId && row.status === 'PENDING').length,
      guarantorRequests,
      leaderPendingLoans,
      unreadAnnouncements,
      myActiveLoans: myActiveLoans.map(loan => ({ ...loan, repaymentQuote: currentLoanQuote(loan) })),
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
    const activeDebt = activeLoans.reduce((s: number, l: any) => s + (currentLoanQuote(l)?.dueBalance ?? Math.max(0, l.totalRepayable - l.amountPaid)), 0);
    let rawMax = mySharesVal * (group.loanLimitMultiplier || 3);
    if (group.maxBigLoanCap && group.maxBigLoanCap > 0) {
      rawMax = Math.min(rawMax, group.maxBigLoanCap);
    }
    const maxAllowed = Math.max(0, rawMax - activeDebt);

    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > maxAllowed) {
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
    const loan = await prisma.$transaction(async tx => {
      await takeLoanTurn(tx, groupId, userId);
      const outstanding = await tx.loan.findMany({ where: { groupId, userId, status: { in: ['PENDING', 'DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'] } } });
      if (outstanding.some(item => item.status === 'PENDING')) throw new LoanConflict('Subiri jibu la ombi lako la awali.');
      const debt = outstanding.reduce((total, item) => total + (currentLoanQuote(item)?.dueBalance ?? Math.max(0, item.totalRepayable - item.amountPaid)), 0);
      if (amount + debt > rawMax) throw new LoanConflict('Salio limebadilika. Hakiki ukomo wa mkopo.');
      return tx.loan.create({ data: {
        groupId, userId, principalAmount: amount, interestRate: 10, repaymentMonths: 2,
        totalRepayable: amount + Math.round(amount * 10) / 100, repaymentPlan: blankRepaymentPlan,
        guarantorId, guarantorStatus: guarantorId ? 'PENDING' : 'ACCEPTED', status: 'PENDING',
      } });
    });
    res.status(201).json({ message: 'Ombi la mkopo limetumwa kikamilifu!', loan });
  } catch (error) {
    if (error instanceof LoanConflict) return res.status(409).json({ error: error.message });
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
      where: { id, groupId, guarantorId: userId, status: 'PENDING', guarantorStatus: 'PENDING', OR: [{ fundedAmount: null }, { fundedAmount: 0 }] },
      data: {
        guarantorStatus: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        status: decision === 'ACCEPT' ? 'PENDING' : 'REJECTED',
        feedback: decision === 'ACCEPT' ? null : 'Mdhamini amekataa ombi la udhamini.',
      },
    });

    if (!changed.count) return res.status(409).json({ error: 'Ombi hili halisubiri jibu la udhamini.' });
    res.json({ message: decision === 'ACCEPT' ? 'Umekubali kuwa mdhamini!' : 'Umekataa udhamini.' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kujibu udhamini.' });
  }
});

router.post('/reject/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { groupId, role } = req.user!;
  if (!LEADER_ROLES.includes(role)) return res.sendStatus(403);
  const reason = z.string().trim().min(3).max(300).safeParse(req.body?.reason);
  if (!reason.success) return res.status(400).json({ error: 'Andika sababu ya kukataa ombi.' });
  const result = await prisma.loan.updateMany({
    where: { id: String(req.params.id), groupId, status: 'PENDING', OR: [{ fundedAmount: null }, { fundedAmount: 0 }] },
    data: { status: 'REJECTED', feedback: reason.data },
  });
  if (!result.count) throw new LoanConflict('Ombi hili halisubiri uamuzi.');
  res.json({ message: 'Ombi limekataliwa. Sababu inaonekana kwa mkopaji.' });
});

router.post('/approve/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { groupId, role } = req.user!;
  if (!LEADER_ROLES.includes(role)) return res.status(403).json({ error: 'Viongozi pekee wanaweza kurekodi utoaji wa mkopo.' });
  const input = fundingInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Weka kiasi halisi cha fedha ulichotoa kwenye foleni ya mikopo.' });
  const id = String(req.params.id);
  const funding = await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const loan = await tx.loan.findFirst({ where: { groupId, status: 'PENDING' }, orderBy: fundingOrder });
    if (!loan || loan.id !== id) throw new LoanConflict('Mwanachama wa kwanza kwenye foleni ndiye anayehudumiwa.');
    if (loan.guarantorId && loan.guarantorStatus !== 'ACCEPTED') throw new LoanConflict('Subiri uthibitisho wa mdhamini.');
    const member = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: loan.userId } } });
    if (!member?.isActive) throw new LoanConflict('Mwanachama huyu si hai.');
    const result = recordFunding(loan.principalAmount, loan.fundedAmount ?? 0, input.data.amount, input.data.expectedFunded);
    if (!result) throw new LoanConflict('Kiasi kinazidi fedha zilizobaki kutolewa au taarifa zimebadilika. Sasisha foleni.');
    const now = new Date();
    const dates = result.remaining === 0 ? {
      status: 'DISBURSED', disbursedAt: now,
      dueDate: loan.repaymentPlan ? calendarLoanDue(now, 2) : new Date(now.getTime() + loan.repaymentMonths * 30 * 86400000),
      nextInterestDue: loan.repaymentPlan ? calendarLoanDue(now, 1) : unpaidInterestInstallments({ ...loan, disbursedAt: now })[0]?.dueAt ?? null,
    } : {};
    const changed = await tx.loan.updateMany({
      where: { id, status: 'PENDING', fundedAmount: loan.fundedAmount },
      data: { fundedAmount: result.fundedAmount, ...dates },
    });
    if (!changed.count) throw new LoanConflict('Ombi limebadilika. Sasisha foleni.');
    await tx.transaction.create({ data: { groupId, userId: loan.userId, type: 'LOAN_DISBURSEMENT',
      amount: Math.round((result.fundedAmount - (loan.fundedAmount ?? 0)) * 100) / 100, interestLoanId: id } });
    return result;
  });
  res.json({ ...funding, message: funding.remaining ? 'Fedha za sehemu zimerekodiwa.' : 'Mkopo umetolewa kikamilifu.' });
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
    if (loan.repaymentPlan) return res.status(409).json({ error: 'Tumia sehemu mpya ya malipo ya mkopo.' });

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
    if (loan.repaymentPlan) return res.status(409).json({ error: 'Tumia sehemu mpya ya malipo ya mkopo.' });
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
    if (loan.repaymentPlan) return res.status(409).json({ error: 'Tumia sehemu mpya ya malipo ya mkopo.' });

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

router.use((error: unknown, _req: AuthRequest, res: Response, _next: import('express').NextFunction) => {
  if (error instanceof LoanConflict) return res.status(409).json({ error: error.message });
  console.error('Loan workflow failed', error instanceof Error ? error.name : 'Unknown');
  res.status(500).json({ error: 'Ombi halijakamilika. Jaribu tena.' });
});

export default router;
