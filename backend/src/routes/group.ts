import { currentLoanQuote } from '../lib/loanRepayment';
import { subscriptionAccess } from '../lib/subscription';
import { interestTiming } from '../lib/loanInterest';
import { Router, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
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

async function saveGroupChange(
  groupId: string,
  userId: string,
  data: Prisma.GroupUpdateInput,
  summary: string
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.group.update({ where: { id: groupId }, data });
    if (updated.hasPapo && (data.hasPapo !== undefined || data.mandatoryPapoAmount !== undefined)) {
      const members = await tx.groupMember.findMany({ where: { groupId, isActive: true }, select: { userId: true } });
      await tx.papoAccount.createMany({ data: members.map(({ userId }) => ({ groupId, userId, mandatoryBalance: updated.mandatoryPapoAmount })), skipDuplicates: true });
      await tx.papoAccount.updateMany({ where: { groupId, userId: { in: members.map(member => member.userId) } }, data: { mandatoryBalance: updated.mandatoryPapoAmount } });
    }
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    await tx.ruleChangeLog.create({
      data: { groupId, changedBy: actor?.fullName || 'Mwenyekiti', summary },
    });
    return updated;
  });
}

// 1. PATA TAARIFA ZA OFISI, SHERIA, KATIBA & ORODHA YA WANACHAMA (YENYE USIRI)
router.get('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    const isLeader = LEADER_ROLES.includes(role);

    const [group, members] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.groupMember.findMany({
        where: { groupId },
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
      isActive: m.isActive,
      suspendedAt: m.suspendedAt,
      suspensionReason: isLeader ? m.suspensionReason : null,
      joinedAt: m.joinedAt,
    }));

    res.json({
      group: group.announcementExpiresAt && group.announcementExpiresAt.getTime() <= Date.now() && role !== 'CHAIRPERSON'
        ? { ...group, announcement: null }
        : group,
      isLeader,
      viewerRole: role,
      subscriptionAccess: subscriptionAccess(group),
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

    const [sharesAgg, papoAcc, activeLoans, activeTopUps, unpaidFinesAgg, memberInfo, interestLedger, allTopUps] = await Promise.all([
      prisma.shareRecord.aggregate({
        where: { groupId, userId: targetUserId },
        _sum: { sharesCount: true, amountPaid: true, socialFundPaid: true },
      }),
      prisma.papoAccount.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      }),
      prisma.loan.findMany({
        where: { groupId, userId: targetUserId, status: { in: ['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING', 'PENDING'] } },
      }),
      prisma.papoTopUp.findMany({
        where: { groupId, userId: targetUserId, status: { in: ['ACTIVE', 'OVERDUE', 'REPAYMENT_PENDING', 'PENDING'] } },
      }),
      prisma.fineRecord.aggregate({
        where: { groupId, userId: targetUserId, isPaid: false },
        _sum: { amount: true },
      }),
      prisma.groupMember.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      }),
      prisma.transaction.findMany({ where: { groupId, userId: targetUserId, type: { in: ['LOAN_INTEREST_REPAYMENT', 'PAPO_INTEREST'] } } }),
      prisma.papoTopUp.findMany({ where: { groupId, userId: targetUserId } }),
    ]);

    if (!memberInfo) return res.status(404).json({ error: 'Mwanachama hajapatikana kwenye kikundi hiki.' });
    const loanDebt = activeLoans.reduce((s, l) => s + (l.status === 'PENDING' ? l.fundedAmount ?? 0 : currentLoanQuote(l)?.dueBalance ?? Math.max(0, l.totalRepayable - l.amountPaid)), 0);
    const papoTopUpDebt = activeTopUps.reduce((sum, topUp) => sum + (topUp.status === 'PENDING' ? topUp.fundedAmount ?? 0 : Math.max(0, topUp.totalPayable - topUp.amountPaid)), 0);
    const onTime = interestLedger.filter(row => row.type === 'LOAN_INTEREST_REPAYMENT' && interestTiming(row) === 'ON_TIME').reduce((sum, row) => sum + row.amount, 0);
    const periodicPapo = interestLedger.filter(row => row.type === 'PAPO_INTEREST').reduce((sum, row) => sum + row.amount, 0);
    const topUpInterest = allTopUps.reduce((sum, row) => sum + Math.max(0, Math.min(row.amountPaid, row.totalPayable - row.principalAmount)), 0);
    const personalClaims = (sharesAgg._sum.amountPaid ?? 0) + (sharesAgg._sum.socialFundPaid ?? 0) + (papoAcc?.mandatoryBalance ?? 0) + onTime + Math.floor((periodicPapo + topUpInterest) * 50) / 100;
    const totalDebt = loanDebt + papoTopUpDebt + (unpaidFinesAgg._sum.amount ?? 0);

    res.json({
      sharesCount: sharesAgg._sum.sharesCount || 0,
      sharesValue: sharesAgg._sum.amountPaid || 0,
      socialFundValue: sharesAgg._sum.socialFundPaid || 0,
      papoMandatory: papoAcc?.mandatoryBalance || 0,
      loanDebt,
      papoTopUpDebt,
      unpaidFines: unpaidFinesAgg._sum.amount || 0,
      interestProfit: onTime,
      personalClaims,
      totalDebt,
      netPersonalClaims: personalClaims - totalDebt,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuvuta taarifa za mwanachama.' });
  }
});
// 3. MWENYEKITI KUANDIKA AU KU-EDIT KATIBA YA KIKOBA
router.put('/constitution', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role, userId } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kuhariri Katiba ya kikoba.' });
    }

    const constitution = String(req.body.constitution || '').trim();
    const updated = await saveGroupChange(groupId, userId, { constitution }, 'Katiba imesasishwa.');

    res.json({ message: 'Katiba ya kikoba imehifadhiwa kikamilifu!', group: updated });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi Katiba.' });
  }
});

// 4. MWENYEKITI KUSASISHA SHERIA NA FAINI
router.put('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role, userId } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kubadilisha sheria.' });
    }

    const b = req.body;
    if (b.mandatoryPapoAmount !== undefined && (!Number.isFinite(Number(b.mandatoryPapoAmount)) || Number(b.mandatoryPapoAmount) < 0)) {
      return res.status(400).json({ error: 'Weka kiwango halali cha Papo ya lazima.' });
    }
    const updated = await saveGroupChange(groupId, userId, {
      name: b.name !== undefined ? String(b.name) : undefined,
      meetingDayOfWeek: b.meetingDayOfWeek !== undefined ? Number(b.meetingDayOfWeek) : undefined,
      meetingTime: b.meetingTime !== undefined ? String(b.meetingTime) : undefined,
      meetingVenue: b.meetingVenue !== undefined ? b.meetingVenue === null ? null : String(b.meetingVenue) : undefined,
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
    }, 'Sheria na mipangilio ya kikundi imesasishwa.');

    res.json({ message: 'Sheria na mipangilio vimehifadhiwa na kuanza kutumika kote!', group: updated });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi sheria.' });
  }
});

const announcementInput = z.object({
  text: z.string().trim().min(1).max(1000),
  durationHours: z.number().int().min(1).max(90 * 24).optional(),
});

async function canManageAnnouncement(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true, isActive: true },
  });
  return membership?.isActive && membership.role === 'CHAIRPERSON';
}

router.put('/announcement', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, userId } = req.user!;
    if (!await canManageAnnouncement(groupId, userId)) {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kuweka tangazo.' });
    }
    const input = announcementInput.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: 'Andika tangazo la hadi herufi 1000 na weka muda kati ya saa 1 na siku 90.' });
    }
    const { text, durationHours } = input.data;
    const now = new Date();
    const current = await prisma.group.findUnique({
      where: { id: groupId },
      select: { announcement: true, announcementPublishedAt: true, announcementExpiresAt: true, announcementUpdatedAt: true },
    });
    if (!current) return res.status(404).json({ error: 'Kikundi hakijapatikana.' });
    const active = Boolean(current.announcement && (!current.announcementExpiresAt || current.announcementExpiresAt > now));
    const expiresAt = durationHours === undefined
      ? current.announcementExpiresAt
      : new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    if (durationHours === undefined && (!active || !expiresAt)) {
      return res.status(400).json({ error: 'Chagua muda wa tangazo kuonekana.' });
    }
    const announcement = {
      announcement: text,
      announcementPublishedAt: (active ? current.announcementPublishedAt : null) ?? now,
      announcementExpiresAt: expiresAt,
      announcementUpdatedAt: new Date(Math.max(now.getTime(), (current.announcementUpdatedAt?.getTime() ?? 0) + 1)),
    };
    const changed = await prisma.group.updateMany({
      where: { id: groupId, announcementUpdatedAt: current.announcementUpdatedAt }, data: announcement,
    });
    if (!changed.count) return res.status(409).json({ error: 'Tangazo limebadilika. Pakia tena kisha ujaribu.' });
    res.json({ message: 'Tangazo limehifadhiwa.', announcement });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi tangazo.' });
  }
});

router.delete('/announcement', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, userId } = req.user!;
    if (!await canManageAnnouncement(groupId, userId)) {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kufuta tangazo.' });
    }
    const group = await prisma.group.update({
      where: { id: groupId },
      data: { announcement: null, announcementPublishedAt: null, announcementExpiresAt: null, announcementUpdatedAt: new Date() },
      select: { announcement: true, announcementPublishedAt: true, announcementExpiresAt: true, announcementUpdatedAt: true },
    });
    res.json({ message: 'Tangazo limefutwa.', announcement: group });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kufuta tangazo.' });
  }
});

export default router;
