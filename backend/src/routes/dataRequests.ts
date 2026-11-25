import { Router, urlencoded } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { credentialRateLimit } from '../middlewares/security';
import { normalizeTzPhone } from './auth';

const router = Router();
const page = (body: string) => '<!doctype html><html lang="sw"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vifani Jamii</title><main>' + body + '</main></html>';
const form = '<h1>Omba kufuta akaunti ya Vifani Jamii</h1><p>Thibitisha akaunti yako ili kuwasilisha ombi kwa msimamizi. Msimamizi atakagua rekodi zinazohitaji kuhifadhiwa kwa usimamizi wa fedha kabla ya kushughulikia ombi.</p><form method="post"><p><label>Namba ya simu <input name="phone" type="tel" required maxlength="20" autocomplete="username"></label></p><p><label>PIN <input name="pin" type="password" required minlength="4" maxlength="6" autocomplete="current-password"></label></p><button>Tuma ombi la kufuta akaunti</button></form>';

router.use((_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
  next();
});
router.get('/', (_req, res) => res.type('html').send(page(form)));
router.post('/', urlencoded({ extended: false, limit: '2kb' }), credentialRateLimit, async (req, res) => {
  if (req.get('sec-fetch-site') === 'cross-site') return res.sendStatus(403);
  const input = z.object({ phone: z.string().max(20), pin: z.string().regex(/^\d{4,6}$/) }).safeParse(req.body);
  const invalid = () => res.status(400).type('html').send(page('<p>Taarifa za kuingia si sahihi. Rudi nyuma ujaribu tena.</p>'));
  if (!input.success) return invalid();
  let phone: string;
  try { phone = normalizeTzPhone(input.data.phone); } catch { return invalid(); }
  const users = await prisma.user.findMany({
    where: { phone: { in: [phone, '0' + phone.slice(3), '+' + phone, phone.slice(3), '00' + phone] } },
    select: { id: true, pinHash: true }, take: 2,
  });
  if (users.length !== 1 || !(await bcrypt.compare(input.data.pin, users[0].pinHash))) return invalid();
  await prisma.accountDeletionRequest.upsert({ where: { userId: users[0].id }, create: { userId: users[0].id }, update: {} });
  res.type('html').send(page('<h1>Ombi limepokelewa</h1><p>Ombi la kufuta akaunti limehifadhiwa kwa ajili ya ukaguzi wa msimamizi.</p>'));
});
export default router;
