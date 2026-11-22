import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

const formatLocalPhone = (phone?: string | null) => {
  if (!phone) return '';
  const clean = phone.replace(/\s+/g, '');
  if (clean.startsWith('+255')) return '0' + clean.slice(4);
  if (clean.startsWith('255') && clean.length >= 12) return '0' + clean.slice(3);
  return clean;
};

// 1. PATA TAARIFA ZA OFISI, SHERIA, KATIBA & ORODHA YA WANACHAMA (YENYE USIRI)
router.get('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    const isLeader = LEADER_ROLES.includes(role);

    const [group, members] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.groupMember.findMany({
        where: { groupId, isActive: true },
        include: {
          user: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);

    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    // Taarifa za umma kwa wanakikundi wote (BILA siri za hisa wala madeni ya mtu mwingine)
    const directory = members.map((m) => ({
      memberId: m.id,
      userId: m.user.id,
      fullName: m.user.fullName,
      phone: formatLocalPhone(m.user.phone),
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    res.json({
      group,
      isLeader,
      directory,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia taarifa za ofisi na sheria.' });
  }
});

// 2. UKAGUZI WA KIFEDHA WA MWANACHAMA MMOJA (KWA VIONGOZI PEKEE)
router.get('/member-audit/:targetUserId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kukagua taarifa za kifedha za mwanachama.' });
    }

    const targetUserId = String(req.params.targetUserId);

    const [sharesAgg, papoAcc, activeLoans, activeTopUps, unpaidFinesAgg, memberInfo] = await Promise.all([
      prisma.shareRecord.aggregate({
        where: { groupId, userId: targetUserId },
        _sum: { sharesCount: true, amountPaid: true, socialFundPaid: true },
      }),
      prisma.papoAccount.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      }),
      prisma.loan.findMany({
        where: { groupId, userId: targetUserId, status: { in: ['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'] } },
      }),
      prisma.papoTopUp.findMany({
        where: { groupId, userId: targetUserId, status: { in: ['ACTIVE', 'OVERDUE', 'REPAYMENT_PENDING'] } },
      }),
      prisma.fineRecord.aggregate({
        where: { groupId, userId: targetUserId, isPaid: false },
        _sum: { amount: true },
      }),
      prisma.groupMember.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      }),
    ]);

    const loanDebt = activeLoans.reduce((s, l) => s + Math.max(0, l.totalRepayable - l.amountPaid), 0);
    const papoTopUpDebt = activeTopUps.reduce((s, t) => s + t.principalAmount, 0);

    res.json({
      sharesCount: sharesAgg._sum.sharesCount || 0,
      sharesValue: sharesAgg._sum.amountPaid || 0,
      socialFundValue: sharesAgg._sum.socialFundPaid || 0,
      papoMandatory: papoAcc?.mandatoryBalance || 0,
      loanDebt,
      papoTopUpDebt,
      unpaidFines: unpaidFinesAgg._sum.amount || 0,
      interestProfit: memberInfo?.memberInterestProfit || 0,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuvuta taarifa za mwanachama.' });
  }
});
// 3. MWENYEKITI KUANDIKA AU KU-EDIT KATIBA YA KIKOBA
router.put('/constitution', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kuhariri Katiba ya kikoba.' });
    }

    const constitution = String(req.body.constitution || '').trim();
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { constitution },
    });

    res.json({ message: 'Katiba ya kikoba imehifadhiwa kikamilifu!', group: updated });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi Katiba.' });
  }
});

// 4. MWENYEKITI KUSASISHA SHERIA, FAINI & TANGAZO
router.put('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kubadilisha sheria.' });
    }

    const b = req.body;
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: {
        name: b.name !== undefined ? String(b.name) : undefined,
        announcement: b.announcement !== undefined ? String(b.announcement) : undefined,
        meetingDayOfWeek: b.meetingDayOfWeek !== undefined ? Number(b.meetingDayOfWeek) : undefined,
        meetingTime: b.meetingTime !== undefined ? String(b.meetingTime) : undefined,
        meetingVenue: b.meetingVenue !== undefined ? String(b.meetingVenue) : undefined,
        cycleMonths: b.cycleMonths !== undefined ? Number(b.cycleMonths) : undefined,
        shareValue: b.shareValue !== undefined ? Number(b.shareValue) : undefined,
        minSharesPerMeeting: b.minSharesPerMeeting !== undefined ? Number(b.minSharesPerMeeting) : undefined,
        maxSharesPerMeeting: b.maxSharesPerMeeting !== undefined ? Number(b.maxSharesPerMeeting) : undefined,
        socialFundMin: b.socialFundMin !== undefined ? Number(b.socialFundMin) : undefined,
        socialFundMax: b.socialFundMax !== undefined ? Number(b.socialFundMax) : undefined,
        hasPapo: b.hasPapo !== undefined ? Boolean(b.hasPapo) : undefined,
        mandatoryPapoAmount: b.mandatoryPapoAmount !== undefined ? Number(b.mandatoryPapoAmount) : undefined,
        papoMeetingInterest: b.papoMeetingInterest !== undefined ? Number(b.papoMeetingInterest) : undefined,
        allowTopUpPapo: b.allowTopUpPapo !== undefined ? Boolean(b.allowTopUpPapo) : undefined,
        minTopUpPapoCap: b.minTopUpPapoCap !== undefined ? Number(b.minTopUpPapoCap) : undefined,
        maxTopUpPapoCap: b.maxTopUpPapoCap !== undefined ? Number(b.maxTopUpPapoCap) : undefined,
        topUpPapoWeeks: b.topUpPapoWeeks !== undefined ? Number(b.topUpPapoWeeks) : undefined,
        interestRate: b.interestRate !== undefined ? Number(b.interestRate) : undefined,
        loanLimitMultiplier: b.loanLimitMultiplier !== undefined ? Number(b.loanLimitMultiplier) : undefined,
        maxBigLoanCap: b.maxBigLoanCap !== undefined ? Number(b.maxBigLoanCap) : undefined,
        maxRepaymentMonths: b.maxRepaymentMonths !== undefined ? Number(b.maxRepaymentMonths) : undefined,
        requireGuarantor: b.requireGuarantor !== undefined ? Boolean(b.requireGuarantor) : undefined,
        latePenalty: b.latePenalty !== undefined ? Number(b.latePenalty) : undefined,
        absentPenalty: b.absentPenalty !== undefined ? Number(b.absentPenalty) : undefined,
        noSharePenalty: b.noSharePenalty !== undefined ? Number(b.noSharePenalty) : undefined,
        noSocialFundPenalty: b.noSocialFundPenalty !== undefined ? Number(b.noSocialFundPenalty) : undefined,
        noPapoInterestPenalty: b.noPapoInterestPenalty !== undefined ? Number(b.noPapoInterestPenalty) : undefined,
        lateTopUpPenalty: b.lateTopUpPenalty !== undefined ? Number(b.lateTopUpPenalty) : undefined,
        lateLoanInterestPenalty: b.lateLoanInterestPenalty !== undefined ? Number(b.lateLoanInterestPenalty) : undefined,
        disciplinePenalty: b.disciplinePenalty !== undefined ? Number(b.disciplinePenalty) : undefined,
        otherPenalty: b.otherPenalty !== undefined ? Number(b.otherPenalty) : undefined,
      },
    });

    res.json({ message: 'Sheria na mipangilio vimehifadhiwa na kuanza kutumika kote!', group: updated });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi sheria.' });
  }
});


export default router;
