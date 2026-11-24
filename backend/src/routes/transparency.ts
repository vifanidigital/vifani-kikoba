import { currentLoanQuote } from '../lib/loanRepayment';
import { calculateShareOut } from '../lib/shareOut';
import { createHash } from 'node:crypto';
import { Router, Response, NextFunction } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

type CycleDb = Prisma.TransactionClient;

async function loadCycle(db: CycleDb, groupId: string) {
  const where = { groupId };
  const [group, memberships, shares, papoAccounts, fines, loans, topUps, expenses, transactions, terminations, ruleLogs] = await Promise.all([
    db.group.findUnique({ where: { id: groupId }, select: {
      id: true, name: true, groupType: true, hasPapo: true, mandatoryPapoAmount: true,
      createdAt: true, cycleStartedAt: true, cycleClosedAt: true, historicalMeetingStart: true,
    } }),
    db.groupMember.findMany({ where, include: { user: { select: { fullName: true } } } }),
    db.shareRecord.findMany({ where }),
    db.papoAccount.findMany({ where }),
    db.fineRecord.findMany({ where }),
    db.loan.findMany({ where, include: { approvals: true, acks: true } }),
    db.papoTopUp.findMany({ where }),
    db.groupExpense.findMany({ where }),
    db.transaction.findMany({ where }),
    db.memberTermination.findMany({ where, include: { votes: true } }),
    db.ruleChangeLog.findMany({ where }),
  ]);
  if (!group) return null;
  const result = calculateShareOut({
    members: memberships.map(member => ({ userId: member.userId, fullName: member.user.fullName, isActive: member.isActive })),
    shares, papoAccounts, loans: loans.map(loan => loan.status === 'PENDING' && loan.fundedAmount
      ? { ...loan, status: 'DISBURSED', totalRepayable: loan.fundedAmount }
      : { ...loan, totalRepayable: loan.amountPaid + (currentLoanQuote(loan)?.dueBalance ?? (loan.totalRepayable - loan.amountPaid)) }),
    topUps: topUps.map(t => t.status === 'PENDING' && t.fundedAmount ? { ...t, status: 'ACTIVE', totalPayable: t.fundedAmount } : t),
    mandatoryPapoAmount: group.hasPapo ? group.mandatoryPapoAmount : 0,
    periodicPapo: transactions.filter(row => row.type === 'PAPO_INTEREST'),
    interest: transactions.filter(row => row.type === 'LOAN_INTEREST_REPAYMENT'),
    unpaidFines: fines.filter(row => !row.isPaid),
    paidFines: fines.filter(row => row.isPaid).reduce((sum, row) => sum + row.amount, 0),
    expenses: expenses.reduce((sum, row) => sum + row.amount, 0),
  });
  return { group, result, records: { memberships, shares, papoAccounts, fines, loans, topUps, expenses, transactions, terminations, ruleLogs } };
}

const supported = (type: string) => ['KIKOBA', 'SHARES', 'VICOBA'].includes(type.trim().toUpperCase());
const previewId = (cycle: NonNullable<Awaited<ReturnType<typeof loadCycle>>>) =>
  createHash('sha256').update(JSON.stringify([cycle.result, cycle.records.loans.map(row => row.id + row.status).sort(), cycle.records.topUps.map(row => row.id + row.status).sort()])).digest('hex');

router.get('/share-out', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    const cycle = await prisma.$transaction(tx => loadCycle(tx, groupId), { isolationLevel: 'RepeatableRead', timeout: 25000 });
    if (!cycle) return res.status(404).json({ error: 'Kikundi hakijapatikana.' });
    if (!supported(cycle.group.groupType)) return res.status(400).json({ error: 'Kanuni ya mgawo wa aina hii ya kikundi bado haijapatikana.' });
    const myEstimate = cycle.result.membersPayout.find(member => member.userId === userId) ?? null;
    const chair = role === 'CHAIRPERSON';
    res.json({
      ...cycle.result,
      membersPayout: myEstimate ? [myEstimate] : [],
      myEstimate,
      calculation: 'KIKOBA_EQUAL_V1',
      cycleClosedAt: cycle.group.cycleClosedAt,
      closePreview: chair && !cycle.group.cycleClosedAt ? { token: previewId(cycle), members: cycle.result.membersPayout } : null,
    });
  } catch (error) {
    console.error('Share-out calculation failed', error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code, column: error.meta?.column, table: error.meta?.table } : error instanceof Error ? error.name : 'Unknown');
    res.status(500).json({ error: 'Imeshindikana kukokotoa mgawo wa mwisho wa mzunguko.' });
  }
});

router.get('/cycles', authenticateToken, async (req: AuthRequest, res) => {
  if (!LEADER_ROLES.includes(req.user!.role)) return res.sendStatus(403);
  const archives = await prisma.cycleArchive.findMany({
    where: { groupId: req.user!.groupId },
    orderBy: { closedAt: 'desc' },
    select: { id: true, startedAt: true, closedAt: true },
  });
  res.json({ archives });
});

router.get('/cycles/:id', authenticateToken, async (req: AuthRequest, res) => {
  if (!LEADER_ROLES.includes(req.user!.role)) return res.sendStatus(403);
  const archive = await prisma.cycleArchive.findFirst({ where: { id: String(req.params.id), groupId: req.user!.groupId } });
  if (!archive) return res.status(404).json({ error: 'Kumbukumbu haikupatikana.' });
  const snapshot = archive.snapshot as unknown as NonNullable<Awaited<ReturnType<typeof loadCycle>>>;
  res.json({ id: archive.id, startedAt: archive.startedAt, closedAt: archive.closedAt, groupName: snapshot.group.name, result: snapshot.result });
});

router.post('/cycles/close', authenticateToken, async (req: AuthRequest, res) => {
  const { groupId, userId, role } = req.user!;
  if (role !== 'CHAIRPERSON') return res.sendStatus(403);
  if (req.body?.confirmed !== true || typeof req.body.token !== 'string') return res.status(400).json({ error: 'Thibitisha kukamilisha marejesho na kutoa mgao.' });
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
    const cycle = await loadCycle(tx, groupId);
    if (!cycle || !supported(cycle.group.groupType)) throw new CycleConflict('Kikundi hiki hakina kanuni ya mgao.');
    if (cycle.group.cycleClosedAt) throw new CycleConflict('Mzunguko huu tayari umefungwa.');
    if ([...cycle.records.loans, ...cycle.records.topUps].some(row => row.status === 'PENDING' && (row.fundedAmount ?? 0) > 0)) {
      throw new CycleConflict('Malizia maombi yaliyopokea fedha kwa sehemu kabla ya kufunga mzunguko.');
    }
    if (req.body.token !== previewId(cycle)) throw new CycleConflict('Taarifa za mgao zimebadilika. Pakia upya na uzihakiki.');
    const closedAt = new Date();
    await tx.cycleArchive.create({ data: {
      groupId, closedAt, closedBy: userId,
      startedAt: cycle.group.historicalMeetingStart ?? cycle.group.cycleStartedAt ?? cycle.group.createdAt,
      snapshot: JSON.parse(JSON.stringify(cycle)),
    } });
    await tx.group.update({ where: { id: groupId }, data: { cycleClosedAt: closedAt } });
  }, { timeout: 30000 });
  res.status(201).json({ message: 'Mzunguko umefungwa na ripoti imehifadhiwa.' });
});

router.post('/cycles/restart', authenticateToken, async (req: AuthRequest, res) => {
  const { groupId, role } = req.user!;
  if (role !== 'CHAIRPERSON') return res.sendStatus(403);
  if (req.body?.confirmed !== true) return res.status(400).json({ error: 'Thibitisha kuanzisha mzunguko mpya.' });
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
    const group = await tx.group.findUnique({ where: { id: groupId }, select: { cycleClosedAt: true, hasPapo: true, mandatoryPapoAmount: true } });
    if (!group?.cycleClosedAt) throw new CycleConflict('Funga mzunguko uliopo kwanza.');
    const where = { groupId };
    const archive = await tx.cycleArchive.findFirst({ where: { groupId, closedAt: group.cycleClosedAt }, select: { id: true } });
    if (!archive) throw new CycleConflict('Kumbukumbu ya mzunguko haijathibitishwa.');
    await tx.group.update({ where: { id: groupId }, data: {
      cycleStartedAt: new Date(), cycleClosedAt: null, historicalMeetingStart: null, historicalMeetingWeekday: null,
      loanQueue: Prisma.DbNull,
    } });
    await tx.loanApproval.deleteMany({ where: { loan: where } });
    await tx.loanAnnouncementAck.deleteMany({ where: { loan: where } });
    await tx.terminationVote.deleteMany({ where: { termination: where } });
    await tx.loan.deleteMany({ where });
    await tx.memberTermination.deleteMany({ where });
    await tx.shareRecord.deleteMany({ where });
    await tx.papoAccount.deleteMany({ where });
    if (group.hasPapo && group.mandatoryPapoAmount > 0) {
      const activeMembers = await tx.groupMember.findMany({ where: { groupId, isActive: true }, select: { userId: true } });
      await tx.papoAccount.createMany({ data: activeMembers.map(({ userId }) => ({ groupId, userId, mandatoryBalance: group.mandatoryPapoAmount })) });
    }
    await tx.papoTopUp.deleteMany({ where });
    await tx.fineRecord.deleteMany({ where });
    await tx.transaction.deleteMany({ where });
    await tx.groupExpense.deleteMany({ where });
    await tx.ruleChangeLog.deleteMany({ where });
    await tx.groupMember.updateMany({ where, data: { memberInterestProfit: 0 } });
  }, { timeout: 30000 });
  res.json({ message: 'Mzunguko mpya umeanza.' });
});

class CycleConflict extends Error {}
router.use((error: unknown, _req: AuthRequest, res: Response, next: NextFunction) => {
  if (error instanceof CycleConflict) return res.status(409).json({ error: error.message });
  next(error);
});

// 2. DAFTARI LA UWAZI WA MATUMIZI & MFUKO WA JAMII
router.get('/expenses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const expenses = await prisma.groupExpense.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ expenses });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia daftari la matumizi.' });
  }
});

router.post('/expenses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) {
      return res.status(403).json({ error: 'Viongozi pekee ndio wanaweza kurekodi matumizi.' });
    }

    const category = String(req.body.category || 'SOCIAL_FUND').toUpperCase();
    const title = String(req.body.title || '').trim();
    const beneficiary = String(req.body.beneficiary || '').trim();
    const amount = Number(req.body.amount);

    if (title.length < 2 || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Weka maelezo ya matumizi na kiasi sahihi.' });
    }

    const recorder = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });

    const expense = await prisma.groupExpense.create({
      data: {
        groupId,
        category,
        title,
        beneficiary: beneficiary || null,
        amount,
        recordedBy: recorder?.fullName || 'Kiongozi',
      },
    });

    res.status(201).json({ message: 'Matumizi yamerekodiwa kwenye daftari la uwazi!', expense });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kurekodi matumizi.' });
  }
});

// 3. KUMBUKUMBU YA MABADILIKO YA SHERIA (KATIBA AUDIT LOG)
router.get('/audit-logs', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const groupId = req.user!.groupId;
    const logs = await prisma.ruleChangeLog.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json({ logs });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia historia ya katiba.' });
  }
});

export default router;
