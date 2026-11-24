import { randomInt, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

type Swap = { id: string; from: string; to: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; at: string };
export type LoanQueue = { order: string[]; previous: string | null; swaps: Swap[] };
export const ensureQueue = (state: LoanQueue, active: string[]) => {
  const order = [...state.order, ...active.filter(id => !state.order.includes(id))];
  const position = order.indexOf(state.previous ?? '');
  const next = [...order.slice(position + 1), ...order.slice(0, position + 1)].find(id => active.includes(id)) ?? null;
  return { order, next };
};
export class LoanConflict extends Error {}

const router = Router();
const idInput = z.string().min(1).max(128);
async function queueData(tx: Prisma.TransactionClient, groupId: string) {
  const group = await tx.group.findUniqueOrThrow({ where: { id: groupId }, select: { loanQueue: true, cycleClosedAt: true } });
  const members = await tx.groupMember.findMany({
    where: { groupId, isActive: true }, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { userId: true, user: { select: { fullName: true } } },
  });
  return { state: group.loanQueue as LoanQueue | null, active: members.map(row => row.userId), members, closed: group.cycleClosedAt };
}
export const lockLoanGroup = async (tx: Prisma.TransactionClient, groupId: string) => {
  await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
};
export async function takeLoanTurn(tx: Prisma.TransactionClient, groupId: string, userId: string) {
  await lockLoanGroup(tx, groupId);
  const { state, active, closed } = await queueData(tx, groupId);
  if (closed) throw new LoanConflict('Mzunguko umefungwa.');
  if (!state) throw new LoanConflict('Mwenyekiti aanzishe foleni kwa kubonyeza Spin.');
  const { order, next } = ensureQueue(state, active);
  if (next !== userId) throw new LoanConflict('Subiri zamu yako kwenye foleni ya mkopo mkubwa.');
  await tx.group.update({ where: { id: groupId }, data: { loanQueue: { ...state, order, previous: userId } } });
}

router.use(authenticateToken);
router.get('/', async (req: AuthRequest, res) => {
  const { groupId, userId } = req.user!;
  const { state, active, members } = await queueData(prisma, groupId);
  if (!state) return res.json({ spun: false, positions: [], next: null, swaps: [] });
  const { order, next } = ensureQueue(state, active);
  const names = new Map(members.map(row => [row.userId, row.user.fullName]));
  res.json({
    spun: true, next,
    positions: order.filter(id => names.has(id)).map((id, index) => ({ id, name: names.get(id), number: index + 1 })),
    swaps: state.swaps.filter(row => row.from === userId || row.to === userId).slice(0, 20)
      .map(row => ({ ...row, status: row.status === 'PENDING' && (!names.has(row.from) || !names.has(row.to)) ? 'CANCELLED' : row.status, fromName: names.get(row.from), toName: names.get(row.to) })),
  });
});

router.post('/spin', async (req: AuthRequest, res) => {
  const { groupId, role } = req.user!;
  if (role !== 'CHAIRPERSON') return res.status(403).json({ error: 'Mwenyekiti pekee anaweza kuanzisha foleni.' });
  await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const { state, active, closed } = await queueData(tx, groupId);
    if (state || closed || !active.length) throw new LoanConflict('Spin inaruhusiwa mara moja kwa kikundi kilicho hai.');
    for (let i = active.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [active[i], active[j]] = [active[j], active[i]];
    }
    await tx.group.update({ where: { id: groupId }, data: { loanQueue: { order: active, previous: null, swaps: [] } } });
  });
  res.json({ message: 'Foleni imepangwa.' });
});

router.post('/swaps', async (req: AuthRequest, res) => {
  const { groupId, userId } = req.user!;
  const parsed = idInput.safeParse(req.body?.targetId);
  if (!parsed.success || parsed.data === userId) return res.status(400).json({ error: 'Chagua mwanachama mwingine.' });
  await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const { state, active, closed } = await queueData(tx, groupId);
    if (!state || closed || !active.includes(userId) || !active.includes(parsed.data)) throw new LoanConflict('Mwanachama au foleni haipatikani.');
    const pair = [userId, parsed.data];
    if (state.swaps.some(row => row.status === 'PENDING' && active.includes(row.from) && active.includes(row.to) && (pair.includes(row.from) || pair.includes(row.to)))) {
      throw new LoanConflict('Mmoja wenu tayari anasubiri jibu la kubadilishana namba.');
    }
    const swap: Swap = { id: randomUUID(), from: userId, to: parsed.data, status: 'PENDING', at: new Date().toISOString() };
    const swaps = [swap, ...state.swaps.filter(row => row.status === 'PENDING' && active.includes(row.from) && active.includes(row.to)),
      ...state.swaps.filter(row => row.status !== 'PENDING').slice(0, 100)];
    await tx.group.update({ where: { id: groupId }, data: { loanQueue: { ...state, swaps } } });
  });
  res.status(201).json({ message: 'Ombi limetumwa. Subiri jibu la mwanachama.' });
});

router.patch('/swaps/:id', async (req: AuthRequest, res) => {
  const { groupId, userId } = req.user!;
  const accept = z.boolean().safeParse(req.body?.accept);
  if (!accept.success) return res.status(400).json({ error: 'Chagua kukubali au kukataa.' });
  await prisma.$transaction(async tx => {
    await lockLoanGroup(tx, groupId);
    const { state, active, closed } = await queueData(tx, groupId);
    const swap = state?.swaps.find(row => row.id === req.params.id && row.to === userId && row.status === 'PENDING');
    if (!state || closed || !swap || !active.includes(swap.from) || !active.includes(swap.to)) throw new LoanConflict('Ombi hili halisubiri jibu lako.');
    const { order } = ensureQueue(state, active);
    let previous = state.previous;
    if (accept.data) {
      const a = order.indexOf(swap.from);
      const b = order.indexOf(swap.to);
      [order[a], order[b]] = [order[b], order[a]];
      if (previous === swap.from) previous = swap.to;
      else if (previous === swap.to) previous = swap.from;
    }
    swap.status = accept.data ? 'ACCEPTED' : 'REJECTED';
    await tx.group.update({ where: { id: groupId }, data: { loanQueue: { order, previous, swaps: state.swaps } } });
  });
  res.json({ message: accept.data ? 'Namba zimebadilishwa.' : 'Ombi limekataliwa.' });
});

export default router;
