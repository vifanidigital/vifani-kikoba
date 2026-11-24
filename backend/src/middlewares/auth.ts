import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { subscriptionAccess } from '../lib/subscription';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    groupId: string;
    role: string;
    pinVersion?: number;
  };
}

export const authenticateSaaS = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Huna ruhusa ya kuingia. Tafadhali ingia kwanza.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      groupId: string;
      role: string;
      pinVersion?: number;
    };
    if (typeof decoded.userId !== 'string' || typeof decoded.groupId !== 'string') {
      return res.status(401).json({ error: 'Ingiza tena akaunti yako.' });
    }
    req.user = decoded;
  } catch (error) {
    return res.status(401).json({ error: 'Token imekwisha muda au si sahihi.' });
  }

  try {
    const { userId, groupId } = req.user!;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { isActive: true, role: true, user: { select: { pinVersion: true } }, group: { select: { subscriptionStatus: true, paidUntil: true, trialEndsAt: true, cycleClosedAt: true } } },
    });
    const switching = req.baseUrl.endsWith('/auth') && req.path === '/switch-group';
    const account = membership?.user ?? (switching ? await prisma.user.findUnique({ where: { id: userId }, select: { pinVersion: true } }) : null);
    if (account && account.pinVersion !== (req.user!.pinVersion ?? 0)) {
      return res.status(401).json({ error: 'PIN imebadilishwa. Ingia tena kwa PIN mpya.', code: 'PIN_SESSION_EXPIRED' });
    }
    if (switching && account) return next();
    if (!membership?.isActive) return res.status(403).json({ error: 'Uanachama wako kwenye kikundi hiki si hai.', code: 'MEMBERSHIP_INACTIVE' });
    const access = subscriptionAccess(membership.group);
    const accountRecovery = req.method === 'POST' && req.baseUrl.endsWith('/members') && /^\/[^/]+\/pin-reset$/.test(req.path);
    const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!isRead && !accountRecovery && membership.group.cycleClosedAt && !req.baseUrl.endsWith('/auth') && !(req.baseUrl.endsWith('/transparency') && req.path === '/cycles/restart')) {
      return res.status(409).json({ error: 'Mzunguko umefungwa. Mwenyekiti anaweza kuanzisha mzunguko mpya.', code: 'CYCLE_CLOSED' });
    }
    if (!isRead && !accountRecovery && !req.baseUrl.endsWith('/auth') && (access === 'EXPIRED' || access === 'SUSPENDED')) {
      return res.status(403).json({ error: access === 'SUSPENDED' ? 'Huduma ya kikundi imesimamishwa.' : 'Muda wa huduma umeisha. Wasiliana na msimamizi kuhusu malipo ya TZS 10,000 kwa mwezi.', code: 'SUBSCRIPTION_READ_ONLY' });
    }
    req.user!.role = membership.role;
    next();
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'P2022' || code === 'P2021') {
      return res.status(503).json({ error: 'Seva inahitaji kusasisha hifadhidata ya vikundi.', code: 'GROUP_SCHEMA' });
    }
    return res.status(503).json({ error: 'Imeshindikana kuthibitisha uanachama. Jaribu tena.', code: 'MEMBERSHIP_SERVICE' });
  }
};

export const authenticateToken = authenticateSaaS;

