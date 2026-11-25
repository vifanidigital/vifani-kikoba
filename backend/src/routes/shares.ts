import { mandatoryPapoBalance, outstandingPapoPrincipal } from '../lib/papoPayment';
import { currentLoanQuote, RepaymentPlan } from '../lib/loanRepayment';
import historicalMeetings from './historicalMeetings';
import { localDate, meetingDateForWeek, meetingDayEnd, parseMeetingDate } from '../lib/meetingCalendar';
import { interestTiming } from '../lib/loanInterest';
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middlewares/auth';

const router = Router();
router.use('/historical-meetings', historicalMeetings);
const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

// 1. MUHTASARI WA MFUKO MKUU + MUHTASARI WA KIKAO CHA LEO (DASHBOARD)
router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId } = req.user!;
    const startOfToday = parseMeetingDate(localDate(new Date()))!;

    const [
      groupShares,
      myShares,
      papoAccounts,
      paidFines,
      unpaidFines,
      allLoans,
      allTopUps,
      interestLedger,
      periodicPapo,
      allExpenses,
      todayShares,
      todayTransactions,
      todayPaidFines,
      todayUnpaidFines,
      todayLoansDisbursed,
      todayTopUpsDisbursed,
      todayExpensesAgg,
      myPapoInterestAgg,
      myUnpaidFinesAgg,
    ] = await Promise.all([
      prisma.shareRecord.aggregate({ where: { groupId }, _sum: { amountPaid: true, socialFundPaid: true } }),
      prisma.shareRecord.aggregate({ where: { groupId, userId }, _sum: { amountPaid: true, sharesCount: true, socialFundPaid: true } }),
      prisma.papoAccount.aggregate({ where: { groupId }, _sum: { mandatoryBalance: true } }),
      prisma.fineRecord.aggregate({ where: { groupId, isPaid: true }, _sum: { amount: true } }),
      prisma.fineRecord.aggregate({ where: { groupId, isPaid: false }, _sum: { amount: true } }),
      prisma.loan.findMany({ where: { groupId } }),
      prisma.papoTopUp.findMany({ where: { groupId } }),
      prisma.transaction.findMany({ where: { groupId, type: 'LOAN_INTEREST_REPAYMENT' } }),
      prisma.transaction.aggregate({ where: { groupId, type: 'PAPO_INTEREST' }, _sum: { amount: true } }),
      prisma.groupExpense.aggregate({ where: { groupId }, _sum: { amount: true } }),
      prisma.shareRecord.aggregate({ where: { groupId, meetingDate: { gte: startOfToday } }, _sum: { amountPaid: true, socialFundPaid: true } }),
      prisma.transaction.findMany({ where: { groupId, createdAt: { gte: startOfToday } } }),
      prisma.fineRecord.aggregate({ where: { groupId, isPaid: true, paidAt: { gte: startOfToday } }, _sum: { amount: true } }),
      prisma.fineRecord.aggregate({ where: { groupId, isPaid: false, createdAt: { gte: startOfToday } }, _sum: { amount: true } }),
      prisma.loan.aggregate({ where: { groupId, fundedAmount: null, disbursedAt: { gte: startOfToday } }, _sum: { principalAmount: true } }),
      prisma.papoTopUp.aggregate({ where: { groupId, fundedAmount: null, status: 'ACTIVE', createdAt: { gte: startOfToday } }, _sum: { principalAmount: true } }),
      prisma.groupExpense.aggregate({ where: { groupId, createdAt: { gte: startOfToday } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { groupId, userId, type: 'PAPO_INTEREST' }, _sum: { amount: true } }),
      prisma.fineRecord.aggregate({ where: { groupId, userId, isPaid: false }, _sum: { amount: true } }),
    ]);

    const totalSharesValue = groupShares._sum.amountPaid || 0;
    const totalSocialFund = groupShares._sum.socialFundPaid || 0;
    const totalPapoMandatory = papoAccounts._sum.mandatoryBalance || 0;
    const totalPaidFines = paidFines._sum.amount || 0;
    const totalUnpaidFines = unpaidFines._sum.amount || 0;
    const totalGroupExpenses = allExpenses._sum.amount || 0;

    const memberShareableLoanProfit = interestLedger.filter(row => interestTiming(row) === 'ON_TIME').reduce((sum, row) => sum + row.amount, 0);
    let totalLoanInterestCollected = 0;
    let loansPrincipalOut = 0;

    for (const l of allLoans) {
      if (l.status === 'PENDING') { loansPrincipalOut += l.fundedAmount ?? 0; continue; }
      const modern = currentLoanQuote(l);
      if (modern) {
        const plan = l.repaymentPlan as RepaymentPlan;
        totalLoanInterestCollected += Math.max(0, l.amountPaid - plan.principalPaid);
        if (['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'].includes(l.status)) loansPrincipalOut += modern.principalRemaining;
        continue;
      }
      const interestPortion = Math.max(0, (l.totalRepayable || 0) - (l.principalAmount || 0));
      totalLoanInterestCollected += Math.min(interestPortion, l.amountPaid || 0);
      if (['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'].includes(l.status)) {
        loansPrincipalOut += Math.max(0, (l.principalAmount || 0) - Math.max(0, (l.amountPaid || 0) - interestPortion));
      }
    }

    const groupRetainedLoanProfit = interestLedger.filter(row => interestTiming(row) === 'LATE').reduce((sum, row) => sum + row.amount, 0);

    let papoInterestCollected = periodicPapo._sum.amount ?? 0;
    let papoTopUpOut = 0;
    for (const t of allTopUps) {
      if (t.status === 'PENDING') { papoTopUpOut += t.fundedAmount ?? 0; continue; }
      const interestPart = Math.max(0, (t.totalPayable || 0) - (t.principalAmount || 0));
      papoInterestCollected += Math.min(interestPart, t.amountPaid || 0);
      if (['ACTIVE', 'OVERDUE', 'REPAYMENT_PENDING'].includes(t.status)) {
        papoTopUpOut += Math.max(0, (t.principalAmount || 0) - Math.max(0, (t.amountPaid || 0) - interestPart));
      }
    }

    const myLoansDebt = allLoans.filter(l => l.userId === userId && l.status === 'PENDING').reduce((sum, l) => sum + (l.fundedAmount ?? 0), 0) + allLoans
      .filter((l) => l.userId === userId && (['DISBURSED', 'OVERDUE', 'REPAYMENT_PENDING'].includes(l.status)))
      .reduce((s, l) => s + (currentLoanQuote(l)?.dueBalance ?? Math.max(0, (l.totalRepayable || 0) - (l.amountPaid || 0))), 0);

    const myPapoTopUpDebt = allTopUps.filter(t => t.userId === userId && t.status === 'PENDING').reduce((sum, t) => sum + (t.fundedAmount ?? 0), 0) + allTopUps
      .filter((t) => t.userId === userId && (['ACTIVE', 'OVERDUE', 'REPAYMENT_PENDING'].includes(t.status)))
      .reduce((s, t) => s + Math.max(0, (t.totalPayable || 0) - (t.amountPaid || 0)), 0);

    const tShares = todayShares._sum.amountPaid || 0;
    const tSocial = todayShares._sum.socialFundPaid || 0;
    const tPapoInterest = todayTransactions.filter((tx) => tx.type === 'PAPO_INTEREST').reduce((s, tx) => s + tx.amount, 0);
    const tTopUpRepaid = todayTransactions.filter((tx) => tx.type === 'PAPO_TOPUP_REPAYMENT').reduce((s, tx) => s + tx.amount, 0);
    const tPapoTopUpInterestRepaid = todayTransactions.filter(row => row.type === 'PAPO_TOPUP_INTEREST_REPAYMENT').reduce((sum, row) => sum + row.amount, 0);
    const tLoanInterestRepaid = todayTransactions.filter((tx) => tx.type === 'LOAN_INTEREST_REPAYMENT').reduce((s, tx) => s + tx.amount, 0);
    const tLoanPrincipalRepaid = todayTransactions.filter((tx) => tx.type === 'LOAN_REPAYMENT').reduce((s, tx) => s + tx.amount, 0);
    const tPaidFines = todayPaidFines._sum.amount || 0;
    const tUnpaidFines = todayUnpaidFines._sum.amount || 0;

    const tLoansLentToday = (todayLoansDisbursed._sum.principalAmount ?? 0) + todayTransactions.filter(row => row.type === 'LOAN_DISBURSEMENT').reduce((sum, row) => sum + row.amount, 0);
    const tPapoLentToday = (todayTopUpsDisbursed._sum.principalAmount ?? 0) + todayTransactions.filter(row => row.type === 'PAPO_TOPUP_DISBURSEMENT').reduce((sum, row) => sum + row.amount, 0);
    const tExpensesToday = todayExpensesAgg._sum.amount || 0;

    const tTotalIn = tShares + tSocial + tPapoInterest + tTopUpRepaid + tPapoTopUpInterestRepaid + tLoanInterestRepaid + tLoanPrincipalRepaid + tPaidFines;
    const tTotalOut = tLoansLentToday + tPapoLentToday + tExpensesToday;

    const totalGroupBalance = Math.max(
      0,
      totalSharesValue +
        totalSocialFund +
        totalPapoMandatory +
        totalPaidFines +
        totalLoanInterestCollected +
        papoInterestCollected -
        totalGroupExpenses
    );
    const totalLoansOut = loansPrincipalOut + papoTopUpOut;
    const mandatoryPapo = mandatoryPapoBalance(totalGroupBalance, loansPrincipalOut, papoTopUpOut, totalPapoMandatory);

    res.json({
      totalGroupBalance,
      cashInHand: mandatoryPapo.cashAvailable,
      mandatoryPapo,
      totalLoansOut,
      mySharesValue: myShares._sum.amountPaid || 0,
      mySharesCount: myShares._sum.sharesCount || 0,
      mySocialFundValue: myShares._sum.socialFundPaid || 0,
      myPapoInterestPaid: myPapoInterestAgg._sum.amount || 0,
      myLoansDebt,
      myPapoTopUpDebt,
      myUnpaidFinesDebt: myUnpaidFinesAgg._sum.amount || 0,
      breakdown: {
        totalSharesValue,
        totalPapoMandatory,
        totalSocialFund,
        memberShareableLoanProfit,
        groupRetainedLoanProfit,
        unclassifiedLoanInterest: Math.max(0, totalLoanInterestCollected - memberShareableLoanProfit - groupRetainedLoanProfit),
        papoInterestCollected,
        totalPaidFines,
        totalUnpaidFines,
        totalGroupExpenses,
      },
      optionalPapoOutstanding: papoTopUpOut,
      todaySummary: {
        date: localDate(startOfToday),
        sharesCollected: tShares,
        papoCollected: tPapoInterest + tPapoTopUpInterestRepaid,
        socialCollected: tSocial,
        topUpRepaid: tTopUpRepaid,
        loanInterestRepaid: tLoanInterestRepaid,
        loanPrincipalRepaid: tLoanPrincipalRepaid,
        paidFines: tPaidFines,
        unpaidFines: tUnpaidFines,
        loansLentToday: tLoansLentToday,
        papoLentToday: tPapoLentToday,
        expensesToday: tExpensesToday,
        cashInHandToday: Math.max(0, tTotalIn - tTotalOut),
      },
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia muhtasari.' });
  }
});
router.get('/meeting-lookup', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { groupId, userId, role } = req.user!;
  try {
    const dateText = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const weekText = typeof req.query.week === 'string' ? req.query.week.trim() : '';
    if (Boolean(dateText) === Boolean(weekText) || (weekText && !/^[1-9][0-9]{0,2}$/.test(weekText))) {
      return res.status(400).json({ error: 'Weka tarehe au namba ya juma.' });
    }
    const group = await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { historicalMeetingStart: true, historicalMeetingWeekday: true, cycleStartedAt: true, createdAt: true, meetingDayOfWeek: true, cycleClosedAt: true },
    });
    const start = parseMeetingDate(localDate(group.historicalMeetingStart ?? group.cycleStartedAt ?? group.createdAt))!;
    const weekday = group.historicalMeetingWeekday ?? group.meetingDayOfWeek;
    const today = parseMeetingDate(localDate(new Date()))!;
    const date = dateText ? parseMeetingDate(dateText) : meetingDateForWeek(start, weekday, Number(weekText));
    if (!date || date < start || date > today) return res.status(404).json({ error: 'Tarehe au juma hilo halipo ndani ya mzunguko ulio wazi.' });
    const first = meetingDateForWeek(start, weekday, 1);
    const daysFromFirst = first ? (date.getTime() - first.getTime()) / 86400000 : -1;
    const week = daysFromFirst >= 0 && daysFromFirst % 7 === 0 ? daysFromFirst / 7 + 1 : null;
    const window = { gte: date, lt: meetingDayEnd(date) };
    const [shares, fines, ledger, expenses, oldLoans, oldPapo] = await prisma.$transaction([
      prisma.shareRecord.findMany({ where: { groupId, meetingDate: window }, select: { userId: true, sharesCount: true, amountPaid: true, socialFundPaid: true, user: { select: { fullName: true } } } }),
      prisma.fineRecord.findMany({ where: { groupId, OR: [{ paidAt: window }, { createdAt: window }] }, select: { amount: true, isPaid: true, paidAt: true, createdAt: true } }),
      prisma.transaction.findMany({ where: { groupId, createdAt: window }, select: { type: true, amount: true } }),
      prisma.groupExpense.aggregate({ where: { groupId, createdAt: window }, _sum: { amount: true }, _count: true }),
      prisma.loan.aggregate({ where: { groupId, fundedAmount: null, disbursedAt: window }, _sum: { principalAmount: true }, _count: true }),
      prisma.papoTopUp.aggregate({ where: { groupId, fundedAmount: null, status: { in: ['ACTIVE','OVERDUE','REPAYMENT_PENDING','PAID'] }, createdAt: window }, _sum: { principalAmount: true }, _count: true }),
    ]);
    const sum = (types: string[]) => ledger.filter(row => types.includes(row.type)).reduce((total, row) => total + row.amount, 0);
    res.json({
      date: localDate(date), week,
      canEdit: role === 'CHAIRPERSON' && !group.cycleClosedAt && date < today &&
        Boolean(shares.length || fines.some(row => row.createdAt >= date && row.createdAt < window.lt) || (group.historicalMeetingStart && week !== null)),
      hasRecords: Boolean(shares.length || fines.length || ledger.length || expenses._count || oldLoans._count || oldPapo._count),
      membersRecorded: new Set(shares.map(row => row.userId)).size,
      shares: shares.reduce((total, row) => total + row.amountPaid, 0),
      social: shares.reduce((total, row) => total + row.socialFundPaid, 0),
      papoInterest: sum(['PAPO_INTEREST','PAPO_TOPUP_INTEREST_REPAYMENT']),
      papoRepaid: sum(['PAPO_TOPUP_REPAYMENT']),
      papoIssued: sum(['PAPO_TOPUP_DISBURSEMENT']) + (oldPapo._sum.principalAmount ?? 0),
      loanIssued: sum(['LOAN_DISBURSEMENT']) + (oldLoans._sum.principalAmount ?? 0),
      loanPrincipalRepaid: sum(['LOAN_REPAYMENT']), loanInterestRepaid: sum(['LOAN_INTEREST_REPAYMENT']),
      paidFines: fines.filter(row => row.isPaid && row.paidAt && row.paidAt >= date && row.paidAt < window.lt).reduce((total, row) => total + row.amount, 0),
      unpaidFines: fines.filter(row => !row.isPaid).reduce((total, row) => total + row.amount, 0),
      expenses: expenses._sum.amount ?? 0,
      memberEntries: shares.filter(row => LEADER_ROLES.includes(role) || row.userId === userId).map(({ user: { fullName }, userId: id, ...entry }) => ({ id, fullName, ...entry })),
    });
  } catch (error) {
    console.error('Meeting lookup failed', error instanceof Error ? error.name : 'Unknown');
    res.status(500).json({ error: 'Imeshindikana kupakia kikao. Jaribu tena.' });
  }
});

// 2. DATA YA KIKAO & HISTORIA KAMILI YA KILA MKUTANO WA MWANACHAMA
router.get('/session-data', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, groupId, role } = req.user!;
    const isLeader = LEADER_ROLES.includes(role);
    const startOfToday = parseMeetingDate(localDate(new Date()))!;

    const [
      group,
      myShares,
      myFines,
      myPapo,
      myPapoTxs,
      membersList,
      allPapoAccs,
      activeTopUps,
      todayShares,
      todayFines,
      todayTxs,
    ] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.shareRecord.findMany({ where: { groupId, userId }, orderBy: { meetingDate: 'desc' } }),
      prisma.fineRecord.findMany({ where: { groupId, userId }, orderBy: { createdAt: 'desc' } }),
      prisma.papoAccount.findUnique({ where: { userId_groupId: { userId, groupId } } }),
      prisma.transaction.findMany({ where: { groupId, userId, type: 'PAPO_INTEREST' }, orderBy: { createdAt: 'desc' } }),
      isLeader
        ? prisma.groupMember.findMany({
            where: { groupId, isActive: true },
            include: { user: { select: { id: true, fullName: true, phone: true } } },
            orderBy: { joinedAt: 'asc' },
          })
        : Promise.resolve([]),
      isLeader ? prisma.papoAccount.findMany({ where: { groupId } }) : Promise.resolve([]),
      isLeader ? prisma.papoTopUp.findMany({ where: { groupId, status: { in: ['ACTIVE', 'OVERDUE'] } } }) : Promise.resolve([]),
      isLeader ? prisma.shareRecord.findMany({ where: { groupId, meetingDate: { gte: startOfToday } } }) : Promise.resolve([]),
      isLeader ? prisma.fineRecord.findMany({ where: { groupId, createdAt: { gte: startOfToday } } }) : Promise.resolve([]),
      isLeader ? prisma.transaction.findMany({ where: { groupId, type: 'PAPO_INTEREST', createdAt: { gte: startOfToday } } }) : Promise.resolve([]),
    ]);

    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const now = new Date();
    const start = group.historicalMeetingStart ?? group.cycleStartedAt ?? group.createdAt;
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const currentWeek = Math.max(1, Math.floor((now.getTime() - start.getTime()) / msPerWeek) + 1);
    const totalWeeks = Math.max(currentWeek, Math.round((group.cycleMonths || 12) * 4.33));
    const remainingWeeks = Math.max(0, totalWeeks - currentWeek);

    const fineCatalog = [
      { key: 'LATE', label: 'Kuchelewa Kikaoni', amount: group.latePenalty },
      { key: 'ABSENT', label: 'Kutofika Kikaoni', amount: group.absentPenalty },
      { key: 'NO_SHARE', label: 'Kutonunua Hisa', amount: group.noSharePenalty },
      { key: 'NO_SOCIAL', label: 'Kutotoa Mfuko wa Jamii', amount: group.noSocialFundPenalty },
      { key: 'NO_PAPO_INT', label: 'Kutotoa Riba ya Papo', amount: group.noPapoInterestPenalty },
      { key: 'LATE_TOPUP', label: 'Kuchelewesha Papo ya Hiari', amount: group.lateTopUpPenalty },
      { key: 'LATE_LOAN_INT', label: 'Kuchelewesha Riba ya Mkopo', amount: group.lateLoanInterestPenalty },
      { key: 'DISCIPLINE', label: 'Utovu wa Nidhamu', amount: group.disciplinePenalty },
      { key: 'OTHER', label: 'Faini Nyinginezo', amount: group.otherPenalty },
    ];

    const formattedMembers = membersList.map((m) => {
      const mId = m.user.id;
      const papoAcc = allPapoAccs.find((p) => p.userId === mId);
      const mandatoryBal = group.hasPapo ? (papoAcc?.mandatoryBalance || group.mandatoryPapoAmount) : 0;
      const activeTopUpBal = activeTopUps.filter((t) => t.userId === mId).reduce((s, t) => s + outstandingPapoPrincipal(t), 0);
      const totalPapoInterestDue = group.hasPapo ? Math.round(((mandatoryBal + activeTopUpBal) * (group.papoMeetingInterest || 0)) / 100) : 0;

      const userTodayShare = todayShares.find((s) => s.userId === mId);
      const userTodayFines = todayFines.filter((f) => f.userId === mId);
      const userTodayPapoTx = todayTxs.find((tx) => tx.userId === mId);
      const recordedToday = Boolean(userTodayShare || userTodayFines.length > 0 || userTodayPapoTx);

      return {
        userId: mId,
        fullName: m.user.fullName,
        phone: m.user.phone,
        role: m.role,
        totalPapoInterestDue,
        recordedToday,
        todayRecord: recordedToday
          ? {
              sharesCount: userTodayShare?.sharesCount ?? 0,
              amountPaid: userTodayShare?.amountPaid ?? 0,
              socialFundPaid: userTodayShare?.socialFundPaid ?? 0,
              papoInterestPaid: userTodayPapoTx?.amount ?? 0,
              fineKeys: userTodayFines.map((f) => f.category),
              finesPaidAmount: userTodayFines.filter((f) => f.isPaid).reduce((s, f) => s + f.amount, 0),
              markFinesPaid: userTodayFines.length > 0 ? userTodayFines.every((f) => f.isPaid) : true,
            }
          : null,
      };
    });

    res.json({
      cycleInfo: { todayDate: now.toISOString(), currentWeek, totalWeeks, remainingWeeks },
      rules: {
        shareValue: group.shareValue,
        minSharesPerMeeting: group.minSharesPerMeeting,
        maxSharesPerMeeting: group.maxSharesPerMeeting,
        socialFundMin: group.socialFundMin,
        socialFundMax: group.socialFundMax,
        hasPapo: group.hasPapo,
        papoMeetingInterest: group.papoMeetingInterest,
        fineCatalog,
      },
      myHistory: {
        shares: myShares,
        fines: myFines,
        papoInterestTxs: myPapoTxs,
        papoMandatoryBalance: group.hasPapo ? (myPapo?.mandatoryBalance || group.mandatoryPapoAmount) : 0,
      },
      members: formattedMembers,
    });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kupakia taarifa za kikao.' });
  }
});

// 3. KUREKODI AU KU-EDIT MUAMALA WA KIKAO CHA LEO
router.post('/record-meeting', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, role } = req.user!;
    if (!LEADER_ROLES.includes(role)) return res.status(403).json({ error: 'Viongozi pekee.' });

    const targetUserId = String(req.body.targetUserId || '');
    const selectedFineKeys: string[] = Array.isArray(req.body.selectedFineKeys) ? [...new Set<string>(req.body.selectedFineKeys)] : [];
    const sharesCount = selectedFineKeys.includes('NO_SHARE') ? 0 : Number(req.body.sharesCount || 0);
    const socialFundPaid = selectedFineKeys.includes('NO_SOCIAL') ? 0 : Number(req.body.socialFundPaid || 0);
    const papoInterestPaid = selectedFineKeys.includes('NO_PAPO_INT') ? 0 : Number(req.body.papoInterestPaid || 0);
    const markFinesPaid = Boolean(req.body.markFinesPaid);

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Kikoba hakijapatikana.' });

    const fineMap: Record<string, { label: string; amount: number }> = {
      LATE: { label: 'Kuchelewa Kikaoni', amount: group.latePenalty },
      ABSENT: { label: 'Kutofika Kikaoni', amount: group.absentPenalty },
      NO_SHARE: { label: 'Kutonunua Hisa', amount: group.noSharePenalty },
      NO_SOCIAL: { label: 'Kutotoa Mfuko wa Jamii', amount: group.noSocialFundPenalty },
      NO_PAPO_INT: { label: 'Kutotoa Riba ya Papo', amount: group.noPapoInterestPenalty },
      LATE_TOPUP: { label: 'Kuchelewesha Papo ya Hiari', amount: group.lateTopUpPenalty },
      LATE_LOAN_INT: { label: 'Kuchelewesha Riba ya Mkopo', amount: group.lateLoanInterestPenalty },
      DISCIPLINE: { label: 'Utovu wa Nidhamu', amount: group.disciplinePenalty },
      OTHER: { label: 'Faini Nyinginezo', amount: group.otherPenalty },
    };

    if (!Number.isInteger(sharesCount) || sharesCount < 0 || ![socialFundPaid, papoInterestPaid].every(amount => Number.isFinite(amount) && amount >= 0)) {
      return res.status(400).json({ error: 'Weka idadi halali ya hisa na michango isiyo hasi.' });
    }
    const amountPaid = sharesCount * group.shareValue;
    const meetingDate = new Date();
    const startOfToday = parseMeetingDate(localDate(new Date()))!;

    const recorded = await prisma.$transaction(async (tx) => {
      const membership = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: targetUserId } }, select: { isActive: true },
      });
      if (!membership?.isActive) return false;
      await tx.shareRecord.deleteMany({ where: { groupId, userId: targetUserId, meetingDate: { gte: startOfToday } } });
      await tx.transaction.deleteMany({ where: { groupId, userId: targetUserId, type: 'PAPO_INTEREST', createdAt: { gte: startOfToday } } });
      await tx.fineRecord.deleteMany({ where: { groupId, userId: targetUserId, createdAt: { gte: startOfToday } } });

      await tx.shareRecord.create({
        data: { groupId, userId: targetUserId, sharesCount, amountPaid, socialFundPaid, meetingDate },
      });

      if (papoInterestPaid > 0) {
        await tx.transaction.create({
          data: { groupId, userId: targetUserId, type: 'PAPO_INTEREST', amount: papoInterestPaid, notes: 'Riba ya Papo kikaoni' },
        });
      }

      for (const fKey of selectedFineKeys) {
        const fineInfo = fineMap[fKey];
        if (fineInfo && fineInfo.amount > 0) {
          await tx.fineRecord.create({
            data: {
              groupId,
              userId: targetUserId,
              category: fKey,
              reason: fineInfo.label,
              amount: fineInfo.amount,
              isPaid: markFinesPaid,
              paidAt: markFinesPaid ? meetingDate : null,
            },
          });
        }
      }
      return true;
    }, { isolationLevel: 'Serializable' });
    if (!recorded) return res.status(409).json({ error: 'Mwanachama huyu si hai kwenye kikundi hiki.' });

    res.status(201).json({ message: 'Taarifa za kikao zimehifadhiwa!' });
  } catch {
    res.status(500).json({ error: 'Imeshindikana kurekodi muamala.' });
  }
});

export default router;
