import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { addMonths, MONTHLY_PRICE, subscriptionAccess } from '../lib/subscription';
import { localDate, parseMeetingDate } from '../lib/meetingCalendar';
import { adminPage } from './adminPage';

const router = Router();
let attempts = 0;
let resetAt = 0;

router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const username = process.env.SAAS_ADMIN_USERNAME;
  const hash = process.env.SAAS_ADMIN_PASSWORD_HASH;
  if (!username || !hash) return res.status(503).send('Akaunti ya msimamizi bado haijawekwa.');
  if (req.get('sec-fetch-site') === 'cross-site' && req.method !== 'GET') return res.sendStatus(403);
  const header = req.get('authorization') ?? '';
  const raw = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const separator = raw.indexOf(':');
  if (Date.now() >= resetAt) {
    attempts = 0;
    resetAt = Date.now() + 60000;
  }
  if (separator >= 0) {
    if (attempts >= 12) return res.status(429).send('Jaribu tena baada ya dakika moja.');
    attempts++;
    if (raw.slice(0, separator) === username && await bcrypt.compare(raw.slice(separator + 1), hash)) {
      attempts--;
      return next();
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Vifani SaaS Admin", charset="UTF-8"');
  res.status(401).send('Ingia kama msimamizi.');
});

router.get('/', (_req, res) => {
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.type('html').send(adminPage);
});

function groupFilters(now: Date) {
  const notSuspended = { subscriptionStatus: { not: 'SUSPENDED' as const } };
  const notPaid = [{ paidUntil: null }, { paidUntil: { lte: now } }];
  const soon = new Date(now.getTime() + 7 * 86400000);
  return {
    ACTIVE: { ...notSuspended, paidUntil: { gt: now } },
    TRIAL: { ...notSuspended, trialEndsAt: { gt: now }, OR: notPaid },
    EXPIRED: { ...notSuspended, trialEndsAt: { lte: now }, OR: notPaid },
    SUSPENDED: { subscriptionStatus: 'SUSPENDED' },
    EXPIRING: { ...notSuspended, OR: [
      { paidUntil: { gt: now, lte: soon } },
      { trialEndsAt: { gt: now, lte: soon }, OR: notPaid },
    ] },
  } satisfies Record<string, Prisma.GroupWhereInput>;
}

router.get('/overview', async (_req, res) => {
  const filters = groupFilters(new Date());
  const [total, active, trial, expiring, expired, suspended, payments] = await prisma.$transaction([
    prisma.group.count(),
    prisma.group.count({ where: filters.ACTIVE }),
    prisma.group.count({ where: filters.TRIAL }),
    prisma.group.count({ where: filters.EXPIRING }),
    prisma.group.count({ where: filters.EXPIRED }),
    prisma.group.count({ where: filters.SUSPENDED }),
    prisma.subscriptionPayment.aggregate({ _sum: { amount: true }, _count: true }),
  ]);
  res.json({ total, active, trial, expiring, expired, suspended, amount: payments._sum.amount ?? 0, paymentCount: payments._count, monthlyPrice: MONTHLY_PRICE });
});

router.get('/groups', async (req, res) => {
  const query = String(req.query.q ?? '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  if (!Number.isInteger(page)) return res.sendStatus(400);
  const now = new Date();
  const filters = groupFilters(now);
  const status = z.enum(['ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED', 'EXPIRING']).optional().safeParse(req.query.status);
  if (!status.success) return res.status(400).json({ error: 'Chagua hali halali ya kikundi.' });
  const where: Prisma.GroupWhereInput = { AND: [
    ...(query ? [{ OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { id: query }] }] : []),
    ...(status.data ? [filters[status.data]] : []),
  ] };
  const [groups, total] = await prisma.$transaction([
    prisma.group.findMany({
      where, skip: (page - 1) * 30, take: 30, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, name: true, createdAt: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true, _count: { select: { members: { where: { isActive: true } } } } },
    }),
    prisma.group.count({ where }),
  ]);
  res.json({ total, page, groups: groups.map(group => ({ ...group, access: subscriptionAccess(group, now) })) });
});

router.get('/groups/:id/payments', async (req, res) => {
  const payments = await prisma.subscriptionPayment.findMany({
    where: { groupId: String(req.params.id) }, orderBy: { recordedAt: 'desc' }, take: 100,
  });
  res.json({ payments });
});

router.post('/groups/:id/payments', async (req, res) => {
  const input = z.object({ months: z.number().int().min(1).max(24), reference: z.string().trim().min(3).max(100).transform(value => value.toUpperCase()) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Weka rejea ya malipo na miezi 1 hadi 24.' });
  const groupId = String(req.params.id);
  try {
    const payment = await prisma.$transaction(async tx => {
      const group = await tx.group.findUnique({ where: { id: groupId } });
      if (!group) return null;
      const { months, reference } = input.data;
      const startsAt = new Date(Math.max(Date.now(), group.trialEndsAt.getTime(), group.paidUntil?.getTime() ?? 0));
      const paidUntil = addMonths(startsAt, months);
      const entry = await tx.subscriptionPayment.create({ data: { groupId, reference, amount: months * MONTHLY_PRICE, months, paidUntil } });
      await tx.group.update({
        where: { id: groupId },
        data: { paidUntil, subscriptionStatus: group.subscriptionStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE' },
      });
      return entry;
    }, { isolationLevel: 'Serializable' });
    if (!payment) return res.status(404).json({ error: 'Kikundi hakipo.' });
    res.status(201).json({ payment });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      return res.status(409).json({ error: 'Rejea imetumika au taarifa zimebadilika. Kagua historia ya malipo.' });
    }
    res.status(500).json({ error: 'Imeshindikana kurekodi malipo.' });
  }
});

router.put('/groups/:id/service-period', async (req, res) => {
  const input = z.union([
    z.object({ months: z.number().int().min(1).max(24) }).strict(),
    z.object({ endsOn: z.string() }).strict(),
  ]).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Chagua miezi 1 hadi 24 au tarehe ya mwisho kwenye kalenda.' });

  const startsAt = new Date();
  const today = parseMeetingDate(localDate(startsAt))!;
  const calendarToday = new Date(localDate(startsAt) + 'T00:00:00Z');
  const maxDate = addMonths(calendarToday, 24).toISOString().slice(0, 10);
  const endsOn = 'months' in input.data
    ? addMonths(calendarToday, input.data.months).toISOString().slice(0, 10)
    : input.data.endsOn;
  const expiresAt = parseMeetingDate(endsOn);
  if (!expiresAt || expiresAt <= today || endsOn > maxDate) {
    return res.status(400).json({ error: 'Tarehe ya kuisha iwe baada ya leo na ndani ya miezi 24.' });
  }

  const id = String(req.params.id);
  const updated = await prisma.group.updateMany({
    where: { id, trialEndsAt: { lte: expiresAt }, OR: [{ paidUntil: null }, { paidUntil: { lte: expiresAt } }] },
    data: { paidUntil: expiresAt, subscriptionStatus: 'ACTIVE' },
  });
  if (!updated.count) {
    const group = await prisma.group.findUnique({ where: { id }, select: { id: true } });
    if (!group) return res.status(404).json({ error: 'Kikundi hakipo.' });
    return res.status(409).json({ error: 'Chagua tarehe inayofika au inayozidi muda wa huduma uliopo.' });
  }
  res.json({ startsAt, expiresAt });
});

router.patch('/groups/:id/status', async (req, res) => {
  const input = z.object({ suspended: z.boolean() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Chagua hali halali.' });
  const updated = await prisma.group.updateMany({
    where: { id: String(req.params.id) }, data: { subscriptionStatus: input.data.suspended ? 'SUSPENDED' : 'ACTIVE' },
  });
  if (!updated.count) return res.status(404).json({ error: 'Kikundi hakipo.' });
  res.json({ message: 'Hali ya kikundi imesasishwa.' });
});

router.use((error: unknown, _req: unknown, res: import('express').Response, _next: import('express').NextFunction) => {
  console.error('Admin request failed', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Error ? error.name : 'Unknown');
  res.status(500).json({ error: 'Seva imeshindwa kupakia taarifa. Jaribu tena.' });
});

router.get('/account-deletion-requests', async (_req, res) => {
  const requests = await prisma.accountDeletionRequest.findMany({
    orderBy: { createdAt: 'asc' }, take: 100,
    select: { userId: true, createdAt: true, user: { select: { fullName: true, phone: true } } },
  });
  res.json({ requests });
});

export default router;
