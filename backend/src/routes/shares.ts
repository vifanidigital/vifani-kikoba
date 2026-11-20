import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

router.get('/session-members', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const memberships = await prisma.groupMember.findMany({
      where: { groupId, isActive: true },
      include: {
        user: {
          include: {
            papoAccounts: { where: { groupId } },
            papoTopUps: { where: { groupId, status: { in: ['ACTIVE', 'OVERDUE'] } } },
            loans: { where: { groupId, status: { in: ['DISBURSED', 'OVERDUE'] } } },
            fines: { where: { groupId, isPaid: false }, orderBy: { createdAt: 'desc' } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const membersList = memberships.map((m) => {
      const u = m.user;
      const papoAccount = u.papoAccounts[0] || null;
      const mandatoryBalance = papoAccount ? papoAccount.mandatoryBalance : 0;
      const activeTopUpsTotal = u.papoTopUps.reduce((sum, t) => sum + (t.principalAmount - t.amountPaid), 0);
      const combinedPapoCapital = mandatoryBalance + activeTopUpsTotal;
      const expectedPapoInterest = group.hasPapo
        ? Math.round((combinedPapoCapital * group.papoMeetingInterest) / 100)
        : 0;

      const totalBigLoanBalance = u.loans.reduce((sum, l) => sum + (l.totalRepayable - l.amountPaid), 0);
      const totalUnpaidFines = u.fines.reduce((sum, f) => sum + f.amount, 0);

      return {
        userId: u.id,
        fullName: u.fullName,
        phone: u.phone,
        role: m.role,
        mandatoryPapoBalance: mandatoryBalance,
        activeTopUpsTotal,
        combinedPapoCapital,
        expectedPapoInterest,
        totalBigLoanBalance,
        activeBigLoans: u.loans,
        totalUnpaidFines,
        unpaidFines: u.fines,
      };
    });

    res.json({
      group: {
        shareValue: group.shareValue,
        minSharesPerMeeting: group.minSharesPerMeeting,
        maxSharesPerMeeting: group.maxSharesPerMeeting,
        socialFundMin: group.socialFundMin,
        socialFundMax: group.socialFundMax,
        hasPapo: group.hasPapo,
        papoMeetingInterest: group.papoMeetingInterest,
        fineRates: {
          latePenalty: group.latePenalty,
          absentPenalty: group.absentPenalty,
          noSharePenalty: group.noSharePenalty,
          noSocialFundPenalty: group.noSocialFundPenalty,
          noPapoInterestPenalty: group.noPapoInterestPenalty,
          lateTopUpPenalty: group.lateTopUpPenalty,
          lateLoanInterestPenalty: group.lateLoanInterestPenalty,
          disciplinePenalty: group.disciplinePenalty,
          otherPenalty: group.otherPenalty,
        },
      },
      members: membersList,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia orodha ya kikao.' });
  }
});

router.post('/record-session', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kurekodi michango.' });
    }

    const {
      targetUserId,
      sharesCount = 0,
      socialFundPaid = 0,
      papoInterestPaid = 0,
      bigLoanRepayment = 0,
      paidFineIds = [],
      newFine = null,
    } = req.body;

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const count = Number(sharesCount);
    if (count > 0 && (count < group.minSharesPerMeeting || count > group.maxSharesPerMeeting)) {
      return res.status(400).json({
        error: `Idadi ya hisa lazima iwe kati ya ${group.minSharesPerMeeting} na ${group.maxSharesPerMeeting}.`,
      });
    }

    const social = Number(socialFundPaid);
    if (social > 0 && group.socialFundMax > 0 && (social < group.socialFundMin || social > group.socialFundMax)) {
      return res.status(400).json({
        error: `Mfuko wa jamii lazima uwe kati ya TZS ${group.socialFundMin.toLocaleString()} na TZS ${group.socialFundMax.toLocaleString()}.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      if (count > 0 || social > 0) {
        await tx.shareRecord.create({
          data: {
            groupId,
            userId: targetUserId,
            sharesCount: count,
            amountPaid: count * group.shareValue,
            socialFundPaid: social,
          },
        });
      }

      if (Number(papoInterestPaid) > 0) {
        await tx.transaction.create({
          data: {
            groupId,
            userId: targetUserId,
            type: 'PAPO_MEETING_INTEREST',
            amount: Number(papoInterestPaid),
            description: 'Malipo ya riba ya Papo ya kikao',
          },
        });
      }

      if (Number(bigLoanRepayment) > 0) {
        const activeLoan = await tx.loan.findFirst({
          where: { groupId, userId: targetUserId, status: { in: ['DISBURSED', 'OVERDUE'] } },
          orderBy: { createdAt: 'asc' },
        });
        if (activeLoan) {
          const newAmountPaid = activeLoan.amountPaid + Number(bigLoanRepayment);
          const isCompleted = newAmountPaid >= activeLoan.totalRepayable;
          await tx.loan.update({
            where: { id: activeLoan.id },
            data: {
              amountPaid: newAmountPaid,
              status: isCompleted ? 'COMPLETED' : activeLoan.status,
            },
          });
        }
      }

      if (Array.isArray(paidFineIds) && paidFineIds.length > 0) {
        await tx.fineRecord.updateMany({
          where: { id: { in: paidFineIds }, groupId, userId: targetUserId },
          data: { isPaid: true, paidAt: new Date() },
        });
      }

      if (newFine && Number(newFine.amount) > 0) {
        await tx.fineRecord.create({
          data: {
            groupId,
            userId: targetUserId,
            category: newFine.category || 'OTHER',
            reason: newFine.reason || 'Adhabu ya kikao',
            amount: Number(newFine.amount),
            isPaid: false,
          },
        });
      }
    });

    res.json({ message: 'Taarifa za mwanachama zimehifadhiwa kikamilifu!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuhifadhi taarifa za kikao.' });
  }
});

router.get('/my-fines', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const fines = await prisma.fineRecord.findMany({
      where: { userId, groupId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ fines });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia rekodi za faini.' });
  }
});

router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const [groupShares, myShares, activeLoans, activeTopUps, papoAccounts] = await Promise.all([
      prisma.shareRecord.aggregate({ where: { groupId }, _sum: { amountPaid: true, socialFundPaid: true } }),
      prisma.shareRecord.aggregate({ where: { groupId, userId }, _sum: { amountPaid: true, sharesCount: true } }),
      prisma.loan.aggregate({ where: { groupId, status: { in: ['DISBURSED', 'OVERDUE'] } }, _sum: { principalAmount: true, amountPaid: true } }),
      prisma.papoTopUp.aggregate({ where: { groupId, status: { in: ['ACTIVE', 'OVERDUE'] } }, _sum: { principalAmount: true, amountPaid: true } }),
      prisma.papoAccount.aggregate({ where: { groupId }, _sum: { mandatoryBalance: true } }),
    ]);

    const totalSharesValue = groupShares._sum.amountPaid || 0;
    const totalSocialFund = groupShares._sum.socialFundPaid || 0;
    const totalPapoMandatory = papoAccounts._sum.mandatoryBalance || 0;
    const totalGroupBalance = totalSharesValue + totalSocialFund + totalPapoMandatory;

    const loansOut =
      ((activeLoans._sum.principalAmount || 0) - (activeLoans._sum.amountPaid || 0)) +
      ((activeTopUps._sum.principalAmount || 0) - (activeTopUps._sum.amountPaid || 0));

    res.json({
      totalGroupBalance,
      cashInHand: Math.max(0, totalGroupBalance - loansOut),
      mySharesValue: myShares._sum.amountPaid || 0,
      mySharesCount: myShares._sum.sharesCount || 0,
      totalLoansOut: Math.max(0, loansOut),
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia muhtasari.' });
  }
});


export default router;
