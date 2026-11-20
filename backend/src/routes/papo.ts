import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';
import { alignToNextMeetingDay } from './loans';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const papoAccount = await prisma.papoAccount.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    const activeTopUps = await prisma.papoTopUp.findMany({
      where: { userId, groupId, status: { in: ['PENDING', 'ACTIVE', 'OVERDUE'] } },
      orderBy: { createdAt: 'desc' },
    });

    const mandatoryBalance = papoAccount ? papoAccount.mandatoryBalance : 0;
    const activeTopUpPrincipal = activeTopUps
      .filter((t) => t.status === 'ACTIVE' || t.status === 'OVERDUE')
      .reduce((sum, t) => sum + (t.principalAmount - t.amountPaid), 0);

    const combinedPapoCapital = mandatoryBalance + activeTopUpPrincipal;
    const combinedMeetingInterest = group.hasPapo
      ? Math.round((combinedPapoCapital * group.papoMeetingInterest) / 100)
      : 0;

    res.json({
      hasPapo: group.hasPapo,
      allowTopUpPapo: group.allowTopUpPapo,
      minTopUpPapoCap: group.minTopUpPapoCap,
      maxTopUpPapoCap: group.maxTopUpPapoCap,
      topUpPapoWeeks: group.topUpPapoWeeks,
      papoMeetingInterestRate: group.papoMeetingInterest,
      mandatoryBalance,
      activeTopUpPrincipal,
      combinedPapoCapital,
      combinedMeetingInterest,
      topUps: activeTopUps,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia taarifa za Papo.' });
  }
});

router.post('/request-topup', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const amount = Number(req.body.amount);

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || !group.hasPapo || !group.allowTopUpPapo) {
      return res.status(400).json({ error: 'Papo ya hiari haijawashwa kwenye kikoba hiki.' });
    }

    if (group.minTopUpPapoCap > 0 && amount < group.minTopUpPapoCap) {
      return res.status(400).json({ error: `Kiwango cha chini cha Papo ya hiari ni TZS ${group.minTopUpPapoCap.toLocaleString()}.` });
    }
    if (group.maxTopUpPapoCap > 0 && amount > group.maxTopUpPapoCap) {
      return res.status(400).json({ error: `Kiwango cha juu cha Papo ya hiari ni TZS ${group.maxTopUpPapoCap.toLocaleString()}.` });
    }

    const existingActive = await prisma.papoTopUp.findFirst({
      where: { userId, groupId, status: { in: ['PENDING', 'ACTIVE', 'OVERDUE'] } },
    });
    if (existingActive) {
      return res.status(400).json({ error: 'Tayari una ombi au deni la Papo ya hiari ambalo halijakamilika.' });
    }

    const rawDue = new Date();
    rawDue.setDate(rawDue.getDate() + (group.topUpPapoWeeks || 4) * 7);
    const alignedDueDate = alignToNextMeetingDay(rawDue, group.meetingDayOfWeek);

    const topUp = await prisma.papoTopUp.create({
      data: {
        groupId,
        userId,
        principalAmount: amount,
        interestRate: group.papoMeetingInterest,
        totalPayable: amount,
        dueDate: alignedDueDate,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      message: `Ombi limetumwa! Tarehe ya kurejesha imepangwa siku ya kikao (${alignedDueDate.toLocaleDateString('sw-TZ')}).`,
      topUp,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kutuma ombi la Papo ya hiari.' });
  }
});

router.post('/approve-topup/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kuidhinisha Papo ya hiari.' });
    }
    const id = String(req.params.id);
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    const rawDue = new Date();
    rawDue.setDate(rawDue.getDate() + (group?.topUpPapoWeeks || 4) * 7);
    const alignedDueDate = alignToNextMeetingDay(rawDue, group?.meetingDayOfWeek ?? 4);

    await prisma.papoTopUp.update({
      where: { id },
      data: { status: 'ACTIVE', dueDate: alignedDueDate },
    });
    res.json({ message: 'Papo ya hiari imeidhinishwa na kupangwa siku ya kikao!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuidhinisha Papo ya hiari.' });
  }
});

router.get('/leader-meeting-sheet', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const [
      memberships,
      sharesAgg,
      papoAgg,
      loansAgg,
      topUpsAgg,
      paidFinesAgg,
      unpaidFinesAgg,
    ] = await Promise.all([
      prisma.groupMember.findMany({
        where: { groupId, isActive: true },
        include: {
          user: {
            include: {
              papoAccounts: { where: { groupId } },
              papoTopUps: { where: { groupId, status: { in: ['ACTIVE', 'OVERDUE'] } } },
              loans: { where: { groupId, status: { in: ['DISBURSED', 'OVERDUE'] } } },
              fines: { where: { groupId, isPaid: false }, orderBy: { createdAt: 'asc' } },
            },
          },
        },
      }),
      prisma.shareRecord.aggregate({ where: { groupId }, _sum: { amountPaid: true, socialFundPaid: true, sharesCount: true } }),
      prisma.papoAccount.aggregate({ where: { groupId }, _sum: { mandatoryBalance: true } }),
      prisma.loan.aggregate({ where: { groupId, status: { in: ['DISBURSED', 'OVERDUE'] } }, _sum: { principalAmount: true, totalRepayable: true, amountPaid: true } }),
      prisma.papoTopUp.aggregate({ where: { groupId, status: { in: ['ACTIVE', 'OVERDUE'] } }, _sum: { principalAmount: true, amountPaid: true } }),
      prisma.fineRecord.aggregate({ where: { groupId, isPaid: true }, _sum: { amount: true } }),
      prisma.fineRecord.aggregate({ where: { groupId, isPaid: false }, _sum: { amount: true } }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextMeeting = alignToNextMeetingDay(today, group.meetingDayOfWeek);
    const nextMeetingEnd = new Date(nextMeeting);
    nextMeetingEnd.setHours(23, 59, 59, 999);

    const topUpRepayers: any[] = [];
    const bigLoanInterestRepayers: any[] = [];
    const unpaidFinesMembers: any[] = [];

    for (const m of memberships) {
      const u = m.user;

      for (const t of u.papoTopUps) {
        const due = t.dueDate ? new Date(t.dueDate) : nextMeeting;
        const isOverdue = due < today;
        const isDueOnMeeting = due <= nextMeetingEnd;
        if (isDueOnMeeting || isOverdue) {
          topUpRepayers.push({
            id: t.id,
            userId: u.id,
            fullName: u.fullName,
            phone: u.phone,
            amountDue: t.principalAmount - t.amountPaid,
            dueDate: due,
            isOverdue,
          });
        }
      }

      for (const l of u.loans) {
        const monthlyInterest = Math.round((l.principalAmount * l.interestRate) / 100);
        const due = l.nextInterestDue ? new Date(l.nextInterestDue) : nextMeeting;
        const isOverdue = due < today;
        bigLoanInterestRepayers.push({
          id: l.id,
          userId: u.id,
          fullName: u.fullName,
          phone: u.phone,
          monthlyInterest,
          remainingLoanBalance: l.totalRepayable - l.amountPaid,
          dueDate: due,
          isOverdue,
        });
      }

      if (u.fines.length > 0) {
        const totalUnpaid = u.fines.reduce((s, f) => s + f.amount, 0);
        unpaidFinesMembers.push({
          userId: u.id,
          fullName: u.fullName,
          phone: u.phone,
          totalUnpaid,
          fines: u.fines,
        });
      }
    }

    const totalSharesValue = sharesAgg._sum.amountPaid || 0;
    const totalSocialFund = sharesAgg._sum.socialFundPaid || 0;
    const totalPapoMandatory = papoAgg._sum.mandatoryBalance || 0;
    const totalActiveTopUps = (topUpsAgg._sum.principalAmount || 0) - (topUpsAgg._sum.amountPaid || 0);
    const totalBigLoansPrincipal = loansAgg._sum.principalAmount || 0;
    const totalBigLoansOutstanding = (loansAgg._sum.totalRepayable || 0) - (loansAgg._sum.amountPaid || 0);
    const totalPaidFines = paidFinesAgg._sum.amount || 0;
    const totalUnpaidFines = unpaidFinesAgg._sum.amount || 0;

    res.json({
      meetingSchedule: {
        meetingDayOfWeek: group.meetingDayOfWeek,
        meetingTime: group.meetingTime,
        meetingVenue: group.meetingVenue || 'Haijawekwa',
        nextMeetingDate: nextMeeting,
      },
      groupSummary: {
        totalSharesCount: sharesAgg._sum.sharesCount || 0,
        totalSharesValue,
        totalSocialFund,
        totalPapoMandatory,
        totalActiveTopUps,
        totalBigLoansPrincipal,
        totalBigLoansOutstanding,
        totalPaidFines,
        totalUnpaidFines,
        grandFundTotal: totalSharesValue + totalSocialFund + totalPapoMandatory + totalPaidFines,
      },
      topUpRepayers,
      bigLoanInterestRepayers,
      unpaidFinesMembers,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia muhtasari wa kikao.' });
  }
});

export default router;
