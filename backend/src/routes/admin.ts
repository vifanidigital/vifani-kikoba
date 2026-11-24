import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { addMonths, MONTHLY_PRICE, subscriptionAccess } from '../lib/subscription';
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

router.get('/groups', async (req, res) => {
  const query = String(req.query.q ?? '').trim().slice(0, 120);
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  if (!Number.isInteger(page)) return res.sendStatus(400);
  const where = { name: { contains: query, mode: 'insensitive' as const } };
  const [groups, total] = await prisma.$transaction([
    prisma.group.findMany({
      where, skip: (page - 1) * 30, take: 30, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, name: true, createdAt: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true, _count: { select: { members: { where: { isActive: true } } } } },
    }),
    prisma.group.count({ where }),
  ]);
  res.json({ total, page, groups: groups.map(group => ({ ...group, access: subscriptionAccess(group) })) });
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

router.patch('/groups/:id/status', async (req, res) => {
  const input = z.object({ suspended: z.boolean() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Chagua hali halali.' });
  const updated = await prisma.group.updateMany({
    where: { id: String(req.params.id) }, data: { subscriptionStatus: input.data.suspended ? 'SUSPENDED' : 'ACTIVE' },
  });
  if (!updated.count) return res.status(404).json({ error: 'Kikundi hakipo.' });
  res.json({ message: 'Hali ya kikundi imesasishwa.' });
});

export default router;
