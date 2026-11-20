import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

export function alignToNextMeetingDay(targetDate: Date, meetingDayOfWeek: number): Date {
  const result = new Date(targetDate);
  result.setHours(0, 0, 0, 0);
  const currentDay = result.getDay();
  const diff = (meetingDayOfWeek - currentDay + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const myShares = await prisma.shareRecord.aggregate({
      where: { userId, groupId },
      _sum: { amountPaid: true },
    });
    const shareValueTotal = myShares._sum.amountPaid || 0;
    const calculatedByShares = shareValueTotal * group.loanLimitMultiplier;
    const effectiveMaxLoan =
      group.maxBigLoanCap > 0
        ? Math.min(calculatedByShares, group.maxBigLoanCap)
        : calculatedByShares;

    const loans = await prisma.loan.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
        guarantor: { select: { id: true, fullName: true, phone: true } },
        approvals: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const guarantorRequests = loans.filter(
      (l) => l.guarantorId === userId && l.guarantorStatus === 'PENDING'
    );

    const memberships = await prisma.groupMember.findMany({
      where: { groupId, isActive: true, userId: { not: userId } },
      include: { user: { select: { id: true, fullName: true, phone: true } } },
    });
    const potentialGuarantors = memberships.map((m) => m.user);

    const myProfitAgg = await prisma.transaction.aggregate({
      where: { groupId, userId, type: 'MEMBER_LOAN_INTEREST_PROFIT' },
      _sum: { amount: true },
    });

    res.json({
      shareValueTotal,
      calculatedByShares,
      groupMaxCap: group.maxBigLoanCap,
      effectiveMaxLoan,
      interestRate: group.interestRate,
      loanLimitMultiplier: group.loanLimitMultiplier,
      maxRepaymentMonths: group.maxRepaymentMonths,
      requireGuarantor: group.requireGuarantor,
      myInterestProfit: myProfitAgg._sum.amount || 0,
      loans,
      guarantorRequests,
      potentialGuarantors,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia mikopo.' });
  }
});

router.post('/apply', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const amount = Number(req.body.amount);
    const months = Number(req.body.months) || 1;
    const guarantorId = req.body.guarantorId ? String(req.body.guarantorId) : null;

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    if (months < 1 || months > group.maxRepaymentMonths) {
      return res.status(400).json({ error: `Muda wa marejesho usizidi miezi ${group.maxRepaymentMonths}.` });
    }
    if (group.requireGuarantor && !guarantorId) {
      return res.status(400).json({ error: 'Lazima uchague mwanachama mdhamini kabla ya kuomba mkopo.' });
    }
    if (guarantorId === userId) {
      return res.status(400).json({ error: 'Huwezi kujidhamini wewe mwenyewe.' });
    }

    const myShares = await prisma.shareRecord.aggregate({
      where: { userId, groupId },
      _sum: { amountPaid: true },
    });
    const calculatedByShares = (myShares._sum.amountPaid || 0) * group.loanLimitMultiplier;
    const effectiveMaxLoan =
      group.maxBigLoanCap > 0
        ? Math.min(calculatedByShares, group.maxBigLoanCap)
        : calculatedByShares;

    if (amount <= 0 || amount > effectiveMaxLoan) {
      return res.status(400).json({
        error: `Kiasi kimezidi ukomo wako wa mkopo (TZS ${effectiveMaxLoan.toLocaleString()}).`,
      });
    }

    const totalInterest = Math.round(((amount * group.interestRate) / 100) * months);
    const totalRepayable = amount + totalInterest;

    const rawDue = new Date();
    rawDue.setMonth(rawDue.getMonth() + months);
    const alignedDueDate = alignToNextMeetingDay(rawDue, group.meetingDayOfWeek);

    const rawFirstInterest = new Date();
    rawFirstInterest.setMonth(rawFirstInterest.getMonth() + 1);
    const alignedFirstInterest = alignToNextMeetingDay(rawFirstInterest, group.meetingDayOfWeek);

    const loan = await prisma.loan.create({
      data: {
        groupId,
        userId,
        principalAmount: amount,
        interestRate: group.interestRate,
        repaymentMonths: months,
        totalRepayable,
        dueDate: alignedDueDate,
        nextInterestDue: alignedFirstInterest,
        guarantorId: group.requireGuarantor ? guarantorId : null,
        guarantorStatus: group.requireGuarantor ? 'PENDING' : 'ACCEPTED',
        status: group.requireGuarantor ? 'AWAITING_GUARANTOR' : 'PENDING',
      },
    });

    res.status(201).json({
      message: group.requireGuarantor
        ? 'Ombi limetumwa kwa mdhamini wako! Tarehe ya marejesho imepangwa siku ya kikao.'
        : 'Ombi la mkopo limetumwa kwa viongozi!',
      loan,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kutuma ombi la mkopo.' });
  }
});

router.post('/guarantor-respond/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const decision = String(req.body.decision);

    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.guarantorId !== userId) {
      return res.status(403).json({ error: 'Huna ruhusa ya kujibu udhamini huu.' });
    }

    if (decision === 'ACCEPT') {
      await prisma.loan.update({
        where: { id },
        data: { guarantorStatus: 'ACCEPTED', status: 'PENDING' },
      });
      return res.json({ message: 'Umekubali udhamini! Ombi sasa limepelekwa kwa uongozi.' });
    } else {
      await prisma.loan.update({
        where: { id },
        data: { guarantorStatus: 'REJECTED', status: 'REJECTED' },
      });
      return res.json({ message: 'Umekataa udhamini wa mkopo huu.' });
    }
  } catch {
    res.status(500).json({ error: 'Imeshindikana kushughulikia udhamini.' });
  }
});

router.post('/approve/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    const id = String(req.params.id);
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuidhinisha mkopo.' });
    }

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: { approvals: true, group: true },
    });
    if (!loan || loan.groupId !== groupId) {
      return res.status(404).json({ error: 'Mkopo haujapatikana.' });
    }
    if (loan.group.requireGuarantor && loan.guarantorStatus !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Mdhamini bado hajakubali mkopo huu.' });
    }

    const alreadyApproved = loan.approvals.some((a) => a.leaderId === userId);
    if (alreadyApproved) {
      return res.status(400).json({ error: 'Tayari umeshapiga kura ya kuidhinisha mkopo huu.' });
    }

    await prisma.loanApproval.create({
      data: { loanId: loan.id, leaderId: userId, role },
    });

    const leadersCount = await prisma.groupMember.count({
      where: { groupId, isActive: true, role: { in: LEADER_ROLES } },
    });
    const requiredApprovals = leadersCount <= 1 ? 1 : 2;
    const totalApprovals = loan.approvals.length + 1;

    if (totalApprovals >= requiredApprovals) {
      const rawDue = new Date();
      rawDue.setMonth(rawDue.getMonth() + loan.repaymentMonths);
      const alignedDueDate = alignToNextMeetingDay(rawDue, loan.group.meetingDayOfWeek);

      const rawNextInt = new Date();
      rawNextInt.setMonth(rawNextInt.getMonth() + 1);
      const alignedNextInt = alignToNextMeetingDay(rawNextInt, loan.group.meetingDayOfWeek);

      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          status: 'DISBURSED',
          disbursedAt: new Date(),
          dueDate: alignedDueDate,
          nextInterestDue: alignedNextInt,
        },
      });
      return res.json({ message: 'Mkopo umeidhinishwa! Tarehe za marejesho zimepangwa siku za kikao.' });
    }

    res.json({ message: `Idhini yako imepokelewa (${totalApprovals}/${requiredApprovals}).` });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuidhinisha mkopo.' });
  }
});

router.post('/approve-overdue-fine', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeidhinisha faini ya kuchelewesha marejesho.' });
    }

    const { targetUserId, type, customAmount } = req.body;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const amount =
      Number(customAmount) > 0
        ? Number(customAmount)
        : type === 'TOPUP'
        ? group.lateTopUpPenalty
        : group.lateLoanInterestPenalty;

    const reason =
      type === 'TOPUP'
        ? 'Faini ya kuvuka siku ya kikao bila kurejesha Papo ya hiari (Imeidhinishwa na Mwenyekiti)'
        : 'Faini ya kuvuka siku ya kikao bila kurejesha riba ya mkopo mkubwa (Imeidhinishwa na Mwenyekiti)';

    await prisma.fineRecord.create({
      data: {
        groupId,
        userId: String(targetUserId),
        category: type === 'TOPUP' ? 'LATE_TOPUP_PAPO' : 'LATE_BIG_LOAN',
        reason,
        amount: amount || 5000,
        isPaid: false,
      },
    });

    res.json({ message: 'Faini ya kuchelewesha marejesho imeidhinishwa na kuwekwa kwenye daftari la mwanachama!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuidhinisha faini.' });
  }
});

export default router;
