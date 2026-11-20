import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

function normalizePhone(raw: string): string {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('255') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '255' + digits.slice(1);
  if ((digits.startsWith('6') || digits.startsWith('7')) && digits.length === 9) return '255' + digits;
  return digits;
}

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const memberships = await prisma.groupMember.findMany({
      where: { groupId, isActive: true },
      include: {
        user: {
          include: {
            shareRecords: { where: { groupId } },
            fines: { where: { groupId, isPaid: false } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const activeTerminations = await prisma.memberTermination.findMany({
      where: { groupId, status: 'VOTING' },
      include: {
        targetUser: { select: { id: true, fullName: true, phone: true } },
        votes: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalActiveCount = memberships.length;
    const requiredVotes = Math.ceil(totalActiveCount / 2);

    const terminationsFormatted = activeTerminations.map((t) => {
      const yesVotes = t.votes.filter((v) => v.approveRemove).length;
      const myVote = t.votes.find((v) => v.voterUserId === userId);
      return {
        id: t.id,
        targetUserId: t.targetUserId,
        targetName: t.targetUser.fullName,
        reason: t.reason,
        yesVotes,
        requiredVotes,
        totalActiveCount,
        hasVoted: Boolean(myVote),
      };
    });

    const members = memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      fullName: m.user.fullName,
      phone: m.user.phone,
      role: m.role,
      memberInterestProfit: m.memberInterestProfit,
      totalSharesCount: m.user.shareRecords.reduce((s, r) => s + r.sharesCount, 0),
      totalSharesValue: m.user.shareRecords.reduce((s, r) => s + r.amountPaid, 0),
      unpaidFinesTotal: m.user.fines.reduce((s, f) => s + f.amount, 0),
    }));

    res.json({ members, terminations: terminationsFormatted });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia orodha ya wanachama.' });
  }
});

router.post('/add', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kusajili wanachama.' });
    }

    const fullName = String(req.body.fullName || '').trim();
    const phone = normalizePhone(req.body.phone);
    const memberRole = String(req.body.role || 'MEMBER').toUpperCase();

    if (fullName.length < 2 || !/^255\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Weka jina kamili na namba sahihi ya simu (mf. 0712345678).' });
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const defaultPinHash = await bcrypt.hash('2580', 10);

    await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { phone } });
      if (!user) {
        user = await tx.user.create({
          data: { fullName, phone, pinHash: defaultPinHash, isVerified: false },
        });
      }

      const existing = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: user.id } },
      });
      if (existing && existing.isActive) {
        throw new Error('Mwanachama huyu tayari yupo hai kwenye kikoba hiki.');
      }

      if (existing) {
        await tx.groupMember.update({
          where: { id: existing.id },
          data: { isActive: true, role: memberRole },
        });
      } else {
        await tx.groupMember.create({
          data: { groupId, userId: user.id, role: memberRole, isActive: true },
        });
      }

      if (group.hasPapo && group.mandatoryPapoAmount > 0) {
        await tx.papoAccount.upsert({
          where: { userId_groupId: { userId: user.id, groupId } },
          update: {},
          create: { groupId, userId: user.id, mandatoryBalance: group.mandatoryPapoAmount },
        });
      }
    });

    res.status(201).json({
      message: `${fullName} amesajiliwa! Atatumia namba yake na PIN ya awali 2580 kuingia.`,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Imeshindikana kusajili mwanachama.' });
  }
});

router.put('/update/:targetUserId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kurekebisha taarifa za mwanachama.' });
    }

    const targetUserId = String(req.params.targetUserId);
    const fullName = String(req.body.fullName || '').trim();
    const phone = normalizePhone(req.body.phone);
    const newRole = String(req.body.role || 'MEMBER').toUpperCase();

    if (fullName.length < 2 || !/^255\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Jina kamili au namba ya simu si sahihi.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { fullName, phone },
      });
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: targetUserId } },
        data: { role: newRole },
      });
    });

    res.json({ message: `Taarifa za ${fullName} zimesasishwa kikamilifu!` });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kurekebisha taarifa (hakikisha namba haitumiwi na mtu mwingine).' });
  }
});

router.post('/initiate-termination', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    if (role !== 'CHAIRPERSON') {
      return res.status(403).json({ error: 'Mwenyekiti pekee ndiye anayeweza kuanzisha mchakato wa kusitisha uanachama.' });
    }

    const targetUserId = String(req.body.targetUserId);
    const reason = String(req.body.reason || '').trim();

    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Huwezi kuanzisha kura ya kujiondoa wewe mwenyewe.' });
    }
    if (reason.length < 3) {
      return res.status(400).json({ error: 'Weka sababu ya kusitisha uanachama.' });
    }

    const existing = await prisma.memberTermination.findFirst({
      where: { groupId, targetUserId, status: 'VOTING' },
    });
    if (existing) {
      return res.status(400).json({ error: 'Tayari kuna kura inayoendelea dhidi ya mwanachama huyu.' });
    }

    const termination = await prisma.memberTermination.create({
      data: { groupId, targetUserId, reason, status: 'VOTING' },
    });

    await prisma.terminationVote.create({
      data: { terminationId: termination.id, voterUserId: userId, approveRemove: true },
    });

    res.status(201).json({
      message: 'Mchakato wa kura umeanzishwa! Wanachama wakipiga kura za ndiyo zikafika nusu (50%), mwanachama atasitishwa.',
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuanzisha mchakato wa kusitisha uanachama.' });
  }
});

router.post('/vote-termination/:terminationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const terminationId = String(req.params.terminationId);
    const approveRemove = Boolean(req.body.approveRemove);

    const termination = await prisma.memberTermination.findUnique({
      where: { id: terminationId },
      include: { votes: true },
    });
    if (!termination || termination.groupId !== groupId || termination.status !== 'VOTING') {
      return res.status(404).json({ error: 'Kura hii haipo au imeshafungwa.' });
    }
    if (termination.targetUserId === userId) {
      return res.status(403).json({ error: 'Mhusika anayepigiwa kura hawezi kujipigia kura.' });
    }

    await prisma.terminationVote.upsert({
      where: { terminationId_voterUserId: { terminationId, voterUserId: userId } },
      update: { approveRemove },
      create: { terminationId, voterUserId: userId, approveRemove },
    });

    const totalActiveMembers = await prisma.groupMember.count({
      where: { groupId, isActive: true },
    });
    const yesVotes = await prisma.terminationVote.count({
      where: { terminationId, approveRemove: true },
    });

    const requiredVotes = Math.ceil(totalActiveMembers / 2);

    if (yesVotes >= requiredVotes) {
      await prisma.$transaction([
        prisma.memberTermination.update({
          where: { id: terminationId },
          data: { status: 'APPROVED' },
        }),
        prisma.groupMember.update({
          where: { groupId_userId: { groupId, userId: termination.targetUserId } },
          data: { isActive: false },
        }),
      ]);
      return res.json({
        message: `Kura zimetimia (${yesVotes}/${totalActiveMembers})! Uanachama umesitishwa rasmi.`,
      });
    }

    res.json({
      message: `Kura yako imerekodiwa (${yesVotes} kati ya ${requiredVotes} zinazohitajika).`,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kurekodi kura yako.' });
  }
});

export default router;