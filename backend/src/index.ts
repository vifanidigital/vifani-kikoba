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
app.use(cors());
app.use(express.json());

app.use('/api/transparency', transparencyRoutes);
app.get('/', (req, res) => {
  res.send('Vifani Kikoba SaaS API inafanya kazi kikamilifu!');
});

app.use('/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/papo', papoRoutes);
app.use('/api/loans', loanRoutes);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'OK', time: new Date().toISOString() });
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server ya Vifani Kikoba inawaka kwenye port ${PORT}`);
});