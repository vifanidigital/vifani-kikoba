import { randomInt } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { addMonths } from '../lib/subscription';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();

// Kusawazisha namba zote za Tanzania ziwe muundo mmoja (255XXXXXXXXX)
export function normalizeTzPhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^[67]\d{8}$/.test(cleaned)) return '255' + cleaned;
  if (/^00255[67]\d{8}$/.test(cleaned)) return cleaned.slice(2);
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
    message: 'PIN hii ni rahisi mno kutabirika. Tumia PIN ambayo ni vigumu kubashiri.',
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
  loanLimitMultiplier: z.coerce.number().min(1).max(10).default(3),
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

class ExistingAccountPinError extends Error {}

function buildToken(userId: string, groupId: string, role: string, pinVersion: number) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing');
  return jwt.sign(
    { userId, groupId, role, pinVersion },
    secret,
    { expiresIn: '30d' }
  );
}

router.post('/register-group', async (req: Request, res: Response) => {
  try {
    const data = registerGroupSchema.parse(req.body);
    const temporaryPins: { name: string; pin: string }[] = [];
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

    const trialEnds = addMonths(new Date(), 1);

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
          const number = leader.phone;
          const accounts = await tx.user.findMany({ where: { phone: { in: [number, '0' + number.slice(3), '+' + number, number.slice(3), '00' + number] } }, take: 2 });
          if (accounts.length > 1) throw new ExistingAccountPinError('Namba hii ina akaunti zaidi ya moja. Wasiliana na msimamizi.');
          let user = accounts[0];

          if (!user) {
            const temporaryPin = isCreator ? undefined : String(randomInt(100000, 1000000));
            if (temporaryPin) temporaryPins.push({ name: leader.fullName, pin: temporaryPin });
            user = await tx.user.create({
              data: {
                fullName: leader.fullName,
                phone: leader.phone,
                pinHash: temporaryPin ? await bcrypt.hash(temporaryPin, 10) : creatorPinHash,
                deviceId: isCreator ? data.deviceId : null,
                isVerified: isCreator,
              },
            });
          } else if (isCreator && !(await bcrypt.compare(data.pin, user.pinHash))) {
            throw new ExistingAccountPinError('Tumia PIN yako ya sasa kusajili kikundi kingine.');
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
    const token = buildToken(result.creator.id, result.group.id, activeRole, result.creator.pinVersion);

    res.status(201).json({
      message:
        temporaryPins.length
          ? 'Kikoba kimesajiliwa. Wape viongozi hawa PIN zao faraghani: ' + temporaryPins.map(entry => entry.name + ' — ' + entry.pin).join(', ')
          : 'Kikoba kimesajiliwa kikamilifu!',
      token,
      activeGroup: result.group,
      activeRole,
      memberships: result.memberships,
      user: { id: result.creator.id, fullName: result.creator.fullName, phone: result.creator.phone },
    });
  } catch (error: any) {
    if (error instanceof ExistingAccountPinError) return res.status(409).json({ error: error.message });
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    res.status(500).json({ error: 'Hitilafu imetokea wakati wa kusajili kikoba.' });
  }
});

// Keep sign-in independent of optional settings and recently added billing columns.
const sessionGroupFields = {
  id: true, name: true, shareValue: true, interestRate: true,
  subscriptionStatus: true, trialEndsAt: true, contributionFreq: true,
  socialFundAmount: true, latePenalty: true, hasPapo: true, mandatoryPapoAmount: true,
} as const;

router.post('/login', async (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.body.phone || '').trim();
    const pin = String(req.body.pin || '').trim();
    if (!/^[0-9]{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN lazima iwe na tarakimu 4 hadi 6.' });

    let normalizedPhone = '';
    try {
      normalizedPhone = normalizeTzPhone(rawPhone);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }

    // Tafuta kwa muundo uliosawazishwa (2557...) au muundo wa zamani (07...) ikiwa upo
    const users = await prisma.user.findMany({
      where: { phone: { in: [normalizedPhone, '0' + normalizedPhone.slice(3), '+' + normalizedPhone, normalizedPhone.slice(3), '00' + normalizedPhone] } },
      select: { id: true, fullName: true, pinHash: true, pinVersion: true },
    });
    const candidates = await Promise.all(users.map(async candidate => await bcrypt.compare(pin, candidate.pinHash) ? candidate : null));
    const matches = candidates.filter(candidate => candidate !== null);
    if (matches.length > 1) return res.status(409).json({ error: 'Namba hii ina akaunti zaidi ya moja. Wasiliana na msimamizi.' });
    if (!matches.length) {
      return res.status(401).json({ error: 'Namba au PIN si sahihi. Wasiliana na mwenyekiti kama umetumia taarifa ulizopewa.' });
    }
    const user = matches[0];


    const memberships = await prisma.groupMember.findMany({
      where: { userId: user.id, isActive: true },
      select: { id: true, groupId: true, role: true, isActive: true, group: { select: sessionGroupFields } },
    });

    if (memberships.length === 0) {
      return res.status(403).json({
        error: 'Akaunti yako haina kikundi chochote kwa sasa. Tafadhali omba uongozi wa kikoba ukusajili kwanza.',
      });
    }

    const primary = memberships.find(entry => entry.group.subscriptionStatus === 'ACTIVE' ||
      (entry.group.subscriptionStatus === 'TRIAL' && entry.group.trialEndsAt > new Date())) ?? memberships[0];
    const token = buildToken(user.id, primary.groupId, primary.role, user.pinVersion);

    res.json({
      token,
      activeGroup: primary.group,
      activeRole: primary.role,
      memberships,
      user: { id: user.id, fullName: user.fullName, phone: normalizedPhone },
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
    const schema = code === 'P2022' || code === 'P2021';
    const diagnostic = schema ? 'LOGIN_SCHEMA' : 'LOGIN_SERVICE';
    console.error('[auth/login]', diagnostic, code ?? 'unknown');
    res.status(503).json({ error: schema
      ? 'Seva inahitaji kusasisha muundo wa hifadhidata.'
      : 'Huduma ya kuingia haipatikani kwa sasa. Jaribu tena baadaye.', code: diagnostic });
  }
});

router.post('/reset-pin', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  const input = z.object({ phone: z.string(), otp: z.string().regex(/^\d{6}$/), newPin: z.string().regex(/^\d{4,6}$/) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Weka namba ya simu, kodi ya tarakimu 6 na PIN mpya ya tarakimu 4 hadi 6.' });
  const { otp, newPin } = input.data;
  if (otp === newPin) return res.status(400).json({ error: 'Chagua PIN yako mwenyewe, tofauti na kodi ya muda.' });
  let phone: string;
  try { phone = normalizeTzPhone(input.data.phone); }
  catch { return res.status(400).json({ error: 'Weka namba halali ya simu ya Tanzania.' }); }
  const invalid = () => res.status(400).json({ error: 'Kodi si sahihi, imeisha au majaribio yamezidi. Omba kodi mpya kwa mwenyekiti.' });
  const accounts = await prisma.user.findMany({
    where: { phone: { in: [phone, '0' + phone.slice(3), '+' + phone, phone.slice(3), '00' + phone] } },
    select: { id: true, otpCode: true },
  });
  const account = accounts.length === 1 ? accounts[0] : null;
  if (!account?.otpCode) return invalid();
  const attempt = await prisma.user.updateMany({
    where: { id: account.id, otpCode: account.otpCode, otpExpiresAt: { gt: new Date() }, pinResetAttempts: { lt: 5 } },
    data: { pinResetAttempts: { increment: 1 } },
  });
  if (!attempt.count || !(await bcrypt.compare(otp, account.otpCode))) return invalid();
  const pinHash = await bcrypt.hash(newPin, 10);
  const reset = await prisma.user.updateMany({
    where: { id: account.id, otpCode: account.otpCode, otpExpiresAt: { gt: new Date() } },
    data: { pinHash, otpCode: null, otpExpiresAt: null, pinResetAttempts: 0, pinVersion: { increment: 1 } },
  });
  if (!reset.count) return invalid();
  res.json({ message: 'PIN imebadilishwa. Ingia kwa kutumia PIN mpya.' });
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

    const token = buildToken(userId, membership.groupId, membership.role, req.user!.pinVersion ?? 0);
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
      data: { pinHash: newPinHash, otpCode: null, otpExpiresAt: null, pinResetAttempts: 0 },
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
