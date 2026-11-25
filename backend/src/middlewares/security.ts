import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';

export const credentialRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  if (now >= sweepAt) {
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    sweepAt = now + 60_000;
  }
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/[^0-9]/g, '').slice(-9) : '';
  const hashed = createHash('sha256').update(phone).digest('hex');
  const keys: [string, number][] = [['ip:' + (req.ip ?? req.socket.remoteAddress), 90]];
  if (phone.length === 9) keys.push(['phone:' + hashed, 20]);
  for (const [key, limit] of keys) {
    const entry = attempts.get(key);
    if ((entry && entry.until > now && entry.count >= limit) || (!entry && attempts.size >= 10000)) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: 'Majaribio mengi. Subiri dakika moja kisha ujaribu tena.' });
    }
  }
  for (const [key] of keys) {
    const entry = attempts.get(key);
    attempts.set(key, entry && entry.until > now ? { ...entry, count: entry.count + 1 } : { count: 1, until: now + 60_000 });
  }
  next();
};

const attempts = new Map<string, { count: number; until: number }>();
let sweepAt = 0;
