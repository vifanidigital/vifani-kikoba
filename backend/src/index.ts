import dataRequestRoutes from './routes/dataRequests';
import { credentialRateLimit } from './middlewares/security';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import groupRoutes from './routes/group';
import memberRoutes from './routes/members';
import shareRoutes from './routes/shares';
import papoRoutes from './routes/papo';
import loanRoutes from './routes/loans';
import transparencyRoutes from './routes/transparency';

dotenv.config();
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
const app = express();
app.disable('x-powered-by');
if (process.env.RENDER === 'true') app.set('trust proxy', 1);
const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean));
app.use(cors({ origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.has(origin))) }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/api/') && req.path !== '/api/health') res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(['/api/auth/login', '/api/auth/reset-pin', '/api/auth/register-group'], credentialRateLimit);

app.use('/api/transparency', transparencyRoutes);
app.get('/', (req, res) => {
  res.send('Vifani Kikoba SaaS API inafanya kazi kikamilifu!');
});

app.use('/admin', adminRoutes);
app.use('/account-deletion', dataRequestRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/papo', papoRoutes);
app.use('/api/loans', loanRoutes);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'OK', time: new Date().toISOString() });
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  const failure = error as { status?: number };
  if (failure.status === 400 || failure.status === 413) return res.status(failure.status).json({ error: 'Ombi lina muundo usio sahihi au ni kubwa mno.' });
  console.error('API request failed', error instanceof Error ? error.name : 'Unknown');
  res.status(500).json({ error: 'Ombi halikufanikiwa.' });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server ya Vifani Kikoba inawaka kwenye port ${PORT}`);
});