import { randomInt } from 'node:crypto';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { normalizeTzPhone } from './auth';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const recoveryChecks = new Map<string, { count: number; until: number }>();
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

const memberInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim(),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
});

router.post('/add', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee anaweza kuongeza mwanachama.' });
  const input = memberInput.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Weka jina, namba sahihi na PIN yenye tarakimu 4 hadi 6 kwa akaunti mpya.' });
  let phone: string;
  try { phone = normalizeTzPhone(input.data.phone); }
  catch { return res.status(400).json({ error: 'Weka namba halali ya simu ya Tanzania.' }); }
  const { groupId } = req.user!;
  const { fullName, pin } = input.data;

  try {
    const pinHash = pin ? await bcrypt.hash(pin, 10) : null;
    const result = await prisma.$transaction(async tx => {
      const matches = await tx.user.findMany({ where: { phone: { in: [phone, '0' + phone.slice(3), '+' + phone, phone.slice(3), '00' + phone] } } });
      if (matches.length > 1) return 'DUPLICATE_PHONE';
      let member = matches[0];
      const existingAccount = Boolean(member);
      if (!member) {
        if (!pinHash) return 'PIN_REQUIRED';
        member = await tx.user.create({ data: { fullName, phone, pinHash, isVerified: false } });
      }
      const existing = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: member.id } } });
      if (existing) return existing.isActive ? 'ACTIVE_MEMBER' : 'SUSPENDED_MEMBER';
      await tx.groupMember.create({ data: { groupId, userId: member.id } });
      const settings = await tx.group.findUniqueOrThrow({ where: { id: groupId }, select: { hasPapo: true, mandatoryPapoAmount: true } });
      if (settings.hasPapo && settings.mandatoryPapoAmount > 0) {
        await tx.papoAccount.upsert({
          where: { userId_groupId: { userId: member.id, groupId } },
          create: { groupId, userId: member.id, mandatoryBalance: settings.mandatoryPapoAmount },
          update: {},
        });
      }
      return existingAccount ? 'EXISTING_ACCOUNT' : 'CREATED';
    }, { isolationLevel: 'Serializable' });
    if (result === 'PIN_REQUIRED') return res.status(400).json({ error: 'Akaunti mpya inahitaji PIN ya awali.' });
    if (result === 'DUPLICATE_PHONE') return res.status(409).json({ error: 'Namba hii ina akaunti zaidi ya moja. Wasiliana na msimamizi.' });
    if (result === 'ACTIVE_MEMBER') return res.status(409).json({ error: 'Mwanachama huyu tayari yupo.' });
    if (result === 'SUSPENDED_MEMBER') return res.status(409).json({ error: 'Mwanachama huyu amesimamishwa. Tumia Rejesha kwenye orodha.' });
    res.status(201).json({ message: result === 'EXISTING_ACCOUNT'
      ? 'Mwanachama ameongezwa. Atumie PIN yake ya sasa.'
      : 'Mwanachama ameongezwa. Mpe PIN yake ya awali faraghani.' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kuongeza mwanachama. Hakiki orodha kisha ujaribu tena.' });
  }
});

router.post('/:targetUserId/pin-reset', authenticateToken, async (req: AuthRequest, res: Response) => {
  res.set('Cache-Control', 'no-store');
  const { userId, groupId, role } = req.user!;
  if (role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee anaweza kutoa kodi ya kurejesha PIN.' });
  const target = String(req.params.targetUserId);
  const input = z.object({ chairPin: z.string().regex(/^\d{4,6}$/) }).safeParse(req.body);
  if (target === userId || !input.success) return res.status(400).json({ error: 'Weka PIN yako ya mwenyekiti na uchague mwanachama mwingine.' });
  const now = Date.now();
  for (const [id, window] of recoveryChecks) if (window.until <= now) recoveryChecks.delete(id);
  const check = recoveryChecks.get(userId) ?? { count: 0, until: now + 5 * 60000 };
  if (check.count >= 5) return res.status(429).json({ error: 'Majaribio yamezidi. Subiri dakika tano kisha ujaribu tena.' });
  check.count++;
  recoveryChecks.set(userId, check);
  const chair = await prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } });
  if (!chair || !(await bcrypt.compare(input.data.chairPin, chair.pinHash))) {
    return res.status(400).json({ error: 'PIN ya mwenyekiti si sahihi.' });
  }
  recoveryChecks.delete(userId);
  const code = String(randomInt(100000, 1000000));
  const otpCode = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 15 * 60000);
  const updated = await prisma.$transaction(async tx => {
    const canReset = await tx.groupMember.count({ where: { groupId, userId, isActive: true, role: 'CHAIRPERSON', user: { pinHash: chair.pinHash } } });
    if (!canReset) return false;
    const result = await tx.user.updateMany({
      where: { id: target, memberships: { some: { groupId, isActive: true, role: { not: 'CHAIRPERSON' } }, none: { groupId: { not: groupId } } } },
      data: { otpCode, otpExpiresAt: expiresAt, pinResetAttempts: 0 },
    });
    return result.count === 1;
  }, { isolationLevel: 'Serializable' });
  if (!updated) return res.status(409).json({ error: 'Kodi inaruhusiwa kwa mwanachama hai mwenye akaunti ya kikundi hiki pekee.' });
  res.status(201).json({ code, expiresAt });
});

router.patch('/:targetUserId/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { groupId, userId, role } = req.user!;
  if (role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee anaweza kubadili hali ya uanachama.' });
  const target = String(req.params.targetUserId);
  const input = z.object({ active: z.boolean(), reason: z.string().trim().max(240).optional() }).safeParse(req.body);
  if (target === userId || !input.success || (!input.data.active && !input.data.reason)) {
    return res.status(400).json({ error: 'Weka sababu ya kusimamisha mwanachama. Mwenyekiti hawezi kujisimamisha.' });
  }
  try {
    const { active, reason } = input.data;
    const changed = await prisma.groupMember.updateMany({
      where: { groupId, userId: target, role: { not: 'CHAIRPERSON' } },
      data: { isActive: active, suspendedAt: active ? null : new Date(), suspensionReason: active ? null : reason },
    });
    if (!changed.count) return res.status(404).json({ error: 'Mwanachama wa kubadili hali yake hajapatikana.' });
    res.json({ message: active ? 'Uanachama umerejeshwa.' : 'Mwanachama amesimamishwa.' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kubadili hali ya uanachama.' });
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

    if (!['MEMBER', 'SECRETARY', 'TREASURER'].includes(newRole) || fullName.length < 2 || !/^255[67]\d{8}$/.test(phone)) {
      return res.status(400).json({ error: 'Jina, namba au nafasi ya mwanachama si sahihi.' });
    }

    const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: targetUserId } } });
    if (!membership || membership.role === 'CHAIRPERSON') return res.status(403).json({ error: 'Uanachama huu hauwezi kuhaririwa hapa.' });
    if (await prisma.groupMember.count({ where: { userId: targetUserId, groupId: { not: groupId } } })) {
      return res.status(409).json({ error: 'Akaunti hii inatumika kwenye vikundi vingine. Mwanachama asasishe wasifu wake mwenyewe.' });
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