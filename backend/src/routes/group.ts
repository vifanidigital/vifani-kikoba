import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

router.get('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });
    res.json({ group });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia mipangilio ya kikoba.' });
  }
});

router.put('/settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kubadili sheria za kikoba.' });
    }

    const d = req.body;
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        announcement: d.announcement !== undefined ? String(d.announcement) : undefined,
        meetingDayOfWeek: d.meetingDayOfWeek !== undefined ? Number(d.meetingDayOfWeek) : undefined,
        meetingTime: d.meetingTime !== undefined ? String(d.meetingTime) : undefined,
        meetingVenue: d.meetingVenue !== undefined ? String(d.meetingVenue) : undefined,
        shareValue: Number(d.shareValue) || 5000,
        minSharesPerMeeting: Number(d.minSharesPerMeeting) || 1,
        maxSharesPerMeeting: Number(d.maxSharesPerMeeting) || 10,
        socialFundMin: Number(d.socialFundMin) || 0,
        socialFundMax: Number(d.socialFundMax) || 0,
        hasPapo: Boolean(d.hasPapo),
        mandatoryPapoAmount: Number(d.mandatoryPapoAmount) || 0,
        papoMeetingInterest: Number(d.papoMeetingInterest) || 0,
        allowTopUpPapo: Boolean(d.allowTopUpPapo),
        minTopUpPapoCap: Number(d.minTopUpPapoCap) || 0,
        maxTopUpPapoCap: Number(d.maxTopUpPapoCap) || 0,
        topUpPapoWeeks: Number(d.topUpPapoWeeks) || 4,
        topUpPapoInterest: Number(d.topUpPapoInterest) || 0,
        interestRate: Number(d.interestRate) || 10,
        loanLimitMultiplier: Number(d.loanLimitMultiplier) || 3,
        maxBigLoanCap: Number(d.maxBigLoanCap) || 0,
        maxRepaymentMonths: Number(d.maxRepaymentMonths) || 3,
        requireGuarantor: d.requireGuarantor !== undefined ? Boolean(d.requireGuarantor) : true,
        latePenalty: Number(d.latePenalty) || 0,
        absentPenalty: Number(d.absentPenalty) || 0,
        noSharePenalty: Number(d.noSharePenalty) || 0,
        noSocialFundPenalty: Number(d.noSocialFundPenalty) || 0,
        noPapoInterestPenalty: Number(d.noPapoInterestPenalty) || 0,
        lateTopUpPenalty: Number(d.lateTopUpPenalty) || 0,
        lateLoanInterestPenalty: Number(d.lateLoanInterestPenalty) || 0,
        disciplinePenalty: Number(d.disciplinePenalty) || 0,
        otherPenalty: Number(d.otherPenalty) || 0,
      },
    });

    res.json({ message: 'Mipangilio ya kikoba imehifadhiwa kikamilifu!', group: updatedGroup });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi mipangilio.' });
  }
});

router.put('/announcement', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (role !== 'CHAIRPERSON' && role !== 'SECRETARY') {
      return res.status(403).json({ error: 'Mwenyekiti au Katibu pekee ndio wanaweza kutoa tangazo.' });
    }
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: { announcement: String(req.body.announcement || '').trim() },
    });
    res.json({ message: 'Tangazo la kikoba limechapishwa!', group: updatedGroup });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuchapisha tangazo.' });
  }
});

export default router;
