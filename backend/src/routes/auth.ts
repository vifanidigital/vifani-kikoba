import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

// Kusawazisha namba zote za Tanzania ziwe muundo mmoja (255XXXXXXXXX)
export function normalizeTzPhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^0[67]\d{8}$/.test(cleaned)) {
    return '255' + cleaned.slice(1);
  }
  if (/^\+255[67]\d{8}$/.test(cleaned)) {
    return cleaned.slice(1);
  }
  if (/^255[67]\d{8}$/.test(cleaned)) {
    return cleaned;
  }
  throw new Error('Weka namba sahihi ya simu ya Tanzania (mf. 0712345678 au 255712345678).');
}

const tzPhoneSchema = z.string().transform((val, ctx) => {
  try {
    return normalizeTzPhone(val);
  } catch (e: any) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: e.message });
    return z.NEVER;
  }
});

const WEAK_PINS = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '123456', '654321'];

const strictPinSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN lazima iwe tarakimu 4 hadi 6 pekee.')
  .refine((val) => !WEAK_PINS.includes(val), {
    message: 'PIN hii ni rahisi mno kutabirika. Tumia PIN imara (mf. 2580).',
  });

const optionalLeaderSchema = z
  .object({
    fullName: z.string().optional().default(''),
    phone: z.string().optional().default(''),
  })
  .optional();

const registerGroupSchema = z.object({
  groupName: z.string().min(3, 'Jina la kikoba liwe na angalau herufi 3.'),
  groupType: z.string().trim().toUpperCase().pipe(z.enum(['KIKOBA', 'SHARES'], { error: 'Kwa sasa unaweza kusajili kikoba pekee. Aina nyingine zinakuja hivi punde.' })).default('KIKOBA'),
  cycleMonths: z.coerce.number().int().min(1).max(60).default(12),
  shareValue: z.coerce.number().min(500).default(5000),
  contributionFreq: z.string().transform((val) => val.trim().toUpperCase() || 'WEEKLY').default('WEEKLY'),
  latePenalty: z.coerce.number().min(0).default(0),
  socialFundAmount: z.coerce.number().min(0).default(0),
  interestRate: z.coerce.number().min(0).max(100).default(10),
  loanLimitMultiplier: z.coerce.number().int().min(1).max(10).default(3),
  maxRepaymentMonths: z.coerce.number().int().min(1).max(36).default(3),
  hasPapo: z.boolean().default(false),
  mandatoryPapoAmount: z.coerce.number().min(0).default(0),
  papoMeetingInterest: z.coerce.number().min(0).max(100).default(10),
  allowTopUpPapo: z.boolean().default(false),
  topUpPapoInterest: z.coerce.number().min(0).max(100).default(0),
  creatorRole: z.string().transform((val) => val.trim().toUpperCase() || 'CHAIRPERSON').default('CHAIRPERSON'),
  pin: strictPinSchema,
  deviceId: z.string().min(1).default('device-default-id'),
  chairperson: z.object({
    fullName: z.string().min(2, 'Jina kamili la Mwenyekiti linahitajika.'),
    phone: tzPhoneSchema,
  }),
  secretary: optionalLeaderSchema,
  treasurer: optionalLeaderSchema,
});

function buildToken(userId: string, groupId: string, role: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing');
  return jwt.sign(
    { userId, groupId, role },
    secret,
    { expiresIn: '30d' }
  );
}

router.post('/register-group', async (req: Request, res: Response) => {
  try {
    const data = registerGroupSchema.parse(req.body);
    const defaultPinHash = await bcrypt.hash('2580', 10);
    const creatorPinHash = await bcrypt.hash(data.pin, 10);

    const leadersToCreate: { fullName: string; phone: string; role: string }[] = [
      { fullName: data.chairperson.fullName.trim(), phone: data.chairperson.phone, role: 'CHAIRPERSON' },
    ];

    if (data.secretary && data.secretary.fullName.trim().length >= 2 && data.secretary.phone.trim().length >= 10) {
      const cleanSecPhone = normalizeTzPhone(data.secretary.phone);
      if (cleanSecPhone !== data.chairperson.phone) {
        leadersToCreate.push({
          fullName: data.secretary.fullName.trim(),
          phone: cleanSecPhone,
          role: 'SECRETARY',
        });
      }
    }

    if (data.treasurer && data.treasurer.fullName.trim().length >= 2 && data.treasurer.phone.trim().length >= 10) {
      const cleanTreasPhone = normalizeTzPhone(data.treasurer.phone);
      if (
        cleanTreasPhone !== data.chairperson.phone &&
        !leadersToCreate.some((l) => l.phone === cleanTreasPhone)
      ) {
        leadersToCreate.push({
          fullName: data.treasurer.fullName.trim(),
          phone: cleanTreasPhone,
          role: 'TREASURER',
        });
      }
    }

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 30);

    const result = await prisma.$transaction(
      async (tx) => {
        const group = await tx.group.create({
          data: {
            name: data.groupName.trim(),
            groupType: data.groupType,
            cycleMonths: data.cycleMonths,
            shareValue: data.shareValue,
            contributionFreq: data.contributionFreq,
            latePenalty: data.latePenalty,
            socialFundAmount: data.socialFundAmount,
            socialFundMin: data.socialFundAmount,
            socialFundMax: data.socialFundAmount,
            interestRate: data.interestRate,
            loanLimitMultiplier: data.loanLimitMultiplier,
            maxRepaymentMonths: data.maxRepaymentMonths,
            hasPapo: data.hasPapo,
            mandatoryPapoAmount: data.hasPapo ? data.mandatoryPapoAmount : 0,
            papoMeetingInterest: data.hasPapo ? data.papoMeetingInterest : 0,
            allowTopUpPapo: data.hasPapo ? data.allowTopUpPapo : false,
            topUpPapoInterest: data.hasPapo && data.allowTopUpPapo ? data.topUpPapoInterest : 0,
            subscriptionStatus: 'TRIAL',
            trialEndsAt: trialEnds,
          },
        });

        let creatorUser: any = null;

        for (const leader of leadersToCreate) {
          const isCreator = leader.role === data.creatorRole || leadersToCreate.length === 1;
          let user = await tx.user.findUnique({ where: { phone: leader.phone } });

          if (!user) {
            user = await tx.user.create({
              data: {
                fullName: leader.fullName,
                phone: leader.phone,
                pinHash: isCreator ? creatorPinHash : defaultPinHash,
                deviceId: isCreator ? data.deviceId : null,
                isVerified: isCreator,
              },
            });
          } else if (isCreator) {
            user = await tx.user.update({
              where: { id: user.id },
              data: { pinHash: creatorPinHash, deviceId: data.deviceId, isVerified: true },
            });
          }

          await tx.groupMember.create({
            data: {
              groupId: group.id,
              userId: user.id,
              role: leader.role,
              isActive: true,
            },
          });

          if (data.hasPapo && data.mandatoryPapoAmount > 0) {
            await tx.papoAccount.create({
              data: {
                groupId: group.id,
                userId: user.id,
                mandatoryBalance: data.mandatoryPapoAmount,
              },
            });
          }

          if (isCreator) {
            creatorUser = user;
          }
        }

        const memberships = await tx.groupMember.findMany({
          where: { userId: creatorUser.id, isActive: true },
          include: { group: true },
        });

        return { group, creator: creatorUser, memberships };
      },
      { maxWait: 10000, timeout: 15000 }
    );

    const activeRole =
      result.memberships.find((m) => m.groupId === result.group.id)?.role || 'CHAIRPERSON';
    const token = buildToken(result.creator.id, result.group.id, activeRole);

    res.status(201).json({
      message:
        leadersToCreate.length > 1
          ? 'Kikoba kimesajiliwa! Viongozi wenzako watatumia PIN ya muda 2580 kuingia.'
          : 'Kikoba kimesajiliwa kikamilifu!',
      token,
      activeGroup: result.group,
      activeRole,
      memberships: result.memberships,
      user: { id: result.creator.id, fullName: result.creator.fullName, phone: result.creator.phone },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    res.status(500).json({ error: error.message || 'Hitilafu imetokea wakati wa kusajili kikoba.' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.body.phone || '').trim();
    const pin = String(req.body.pin || '').trim();
    const deviceId = String(req.body.deviceId || 'device-default-id');

    let normalizedPhone = '';
    try {
      normalizedPhone = normalizeTzPhone(rawPhone);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    // Tafuta kwa muundo uliosawazishwa (2557...) au muundo wa zamani (07...) ikiwa upo
    const local0Format = '0' + normalizedPhone.slice(3);
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ phone: normalizedPhone }, { phone: local0Format }],
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Namba hii ya simu haijasajiliwa. Tafadhali wasiliana na kiongozi wako akusajili au sajili kikundi kipya.',
      });
    }

    const isPinValid = await bcrypt.compare(pin, user.pinHash);
    if (!isPinValid) {
      return res.status(401).json({
        error: 'PIN uliyoingiza si sahihi. Tafadhali hakikisha tarakimu zako za siri na ujaribu tena.',
      });
    }

    const memberships = await prisma.groupMember.findMany({
      where: { userId: user.id, isActive: true },
      include: { group: true },
    });

    if (memberships.length === 0) {
      return res.status(403).json({
        error: 'Akaunti yako haina kikundi chochote kwa sasa. Tafadhali omba uongozi wa kikoba ukusajili kwanza.',
      });
    }

    // Sasisha namba iwe muundo mmoja wa kimataifa (255...) na uhifadhi deviceId
    if (user.phone !== normalizedPhone || !user.deviceId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone: normalizedPhone, deviceId: user.deviceId || deviceId, isVerified: true },
      });
    }

    const primary = memberships[0];
    const token = buildToken(user.id, primary.groupId, primary.role);

    res.json({
      token,
      activeGroup: primary.group,
      activeRole: primary.role,
      memberships,
      user: { id: user.id, fullName: user.fullName, phone: normalizedPhone },
    });
  } catch {
    res.status(500).json({ error: 'Hitilafu imetokea wakati wa kuingia.' });
  }
});

router.post('/switch-group', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const targetGroupId = String(req.body.groupId);

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: targetGroupId, userId } },
      include: { group: true },
    });

    if (!membership || !membership.isActive) {
      return res.status(403).json({ error: 'Huna uanachama hai kwenye kikoba hiki.' });
    }

    const token = buildToken(userId, membership.groupId, membership.role);
    res.json({
      token,
      activeGroup: membership.group,
      activeRole: membership.role,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kubadili kikoba.' });
  }
});


router.put('/update-profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const fullName = String(req.body.fullName || '').trim();
    if (fullName.length < 2) {
      return res.status(400).json({ error: 'Weka jina kamili lenye angalau herufi 2.' });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { fullName },
    });
    res.json({ message: 'Jina lako limesasishwa kikamilifu!', user: { id: user.id, fullName: user.fullName, phone: user.phone } });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kusasisha wasifu.' });
  }
});

router.post('/change-pin', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const oldPin = String(req.body.oldPin || '').trim();
    const newPin = strictPinSchema.parse(req.body.newPin);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Mtumiaji hajapatikana.' });

    const isOldValid = await bcrypt.compare(oldPin, user.pinHash);
    if (!isOldValid) {
      return res.status(401).json({ error: 'PIN ya zamani uliyoingiza si sahihi.' });
    }

    const newPinHash = await bcrypt.hash(newPin, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { pinHash: newPinHash },
    });

    res.json({ message: 'PIN yako ya siri imebadilishwa kikamilifu!' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    res.status(500).json({ error: 'Imeshindikana kubadili PIN.' });
  }
});

export default router;
