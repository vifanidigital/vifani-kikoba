import { interestTiming } from './loanInterest';

type MemberAmount = { userId: string; amount: number };
type LoanInterest = MemberAmount & { createdAt: Date; interestDueAt: Date | null };
type Debt = { userId: string; status: string; amountPaid: number };
type ShareOutInput = {
  members: { userId: string; fullName: string; isActive?: boolean }[];
  shares: { userId: string; sharesCount: number; amountPaid: number; socialFundPaid: number }[];
  papoAccounts: { userId: string; mandatoryBalance: number }[];
  mandatoryPapoAmount?: number;
  periodicPapo: MemberAmount[];
  interest: LoanInterest[];
  loans: (Debt & { totalRepayable: number })[];
  topUps: (Debt & { totalPayable: number; principalAmount: number })[];
  unpaidFines: MemberAmount[];
  unpaidPapoInterest?: MemberAmount[];
  paidFines: number;
  expenses: number;
};

const money = (value: number) => Math.max(0, Math.round(value * 100));
const sumMoney = (values: number[]) => values.reduce((sum, value) => sum + money(value), 0);

export function calculateShareOut(input: ShareOutInput) {
  const timelyByUser = new Map<string, number>();
  const papoByUser = new Map<string, number>();
  let lateLoan = 0;
  let unknownLoan = 0;
  const add = (ledger: Map<string, number>, userId: string, amount: number) => {
    ledger.set(userId, (ledger.get(userId) ?? 0) + money(amount));
  };
  for (const payment of input.interest) {
    const timing = interestTiming(payment);
    if (timing === 'ON_TIME') add(timelyByUser, payment.userId, payment.amount);
    else if (timing === 'LATE') lateLoan += money(payment.amount);
    else unknownLoan += money(payment.amount);
  }
  for (const payment of input.periodicPapo) add(papoByUser, payment.userId, payment.amount);
  for (const topUp of input.topUps) {
    add(papoByUser, topUp.userId, Math.min(topUp.amountPaid, topUp.totalPayable - topUp.principalAmount));
  }
  let papoPool = 0;
  for (const amount of papoByUser.values()) papoPool += amount - Math.floor(amount / 2);

  const paidFines = money(input.paidFines);
  const expenses = money(input.expenses);
  const grossPool = papoPool + lateLoan + paidFines;
  const pool = Math.max(0, grossPool - expenses);
  const members = [...input.members].sort((left, right) => left.userId.localeCompare(right.userId));
  const memberCount = members.filter(member => member.isActive !== false).length;
  const baseDividend = memberCount ? Math.floor(pool / memberCount) : 0;
  const extraCents = memberCount ? pool % memberCount : 0;
  let dividendIndex = 0;
  const membersPayout = members.map(member => {
    const myShares = input.shares.filter(row => row.userId === member.userId);
    const capital = sumMoney(myShares.map(row => row.amountPaid));
    const social = sumMoney(myShares.map(row => row.socialFundPaid));
    const mandatory = sumMoney(input.papoAccounts.filter(row => row.userId === member.userId).map(row => row.mandatoryBalance));
    const mandatoryDebt = member.isActive === false ? mandatory : (mandatory || money(input.mandatoryPapoAmount ?? 0));
    const timely = timelyByUser.get(member.userId) ?? 0;
    const papoPaid = papoByUser.get(member.userId) ?? 0;
    const papoRefund = Math.floor(papoPaid / 2);
    const dividend = member.isActive === false ? 0 : baseDividend + (dividendIndex++ < extraCents ? 1 : 0);
    const papoInterestDebt = sumMoney((input.unpaidPapoInterest ?? []).filter(row => row.userId === member.userId).map(row => row.amount));
    const debt = papoInterestDebt + sumMoney([
      ...input.loans.filter(row => row.userId === member.userId && ['DISBURSED','OVERDUE','REPAYMENT_PENDING'].includes(row.status)).map(row => row.totalRepayable - row.amountPaid),
      ...input.topUps.filter(row => row.userId === member.userId && ['ACTIVE','OVERDUE','REPAYMENT_PENDING'].includes(row.status)).map(row => row.totalPayable - row.amountPaid),
      ...input.unpaidFines.filter(row => row.userId === member.userId).map(row => row.amount),
    ]);
    const gross = capital + social + mandatoryDebt + timely + papoRefund + dividend;
    const net = Math.max(0, gross - mandatoryDebt - debt);
    return {
      ...member,
      mySharesCount: myShares.reduce((sum, row) => sum + row.sharesCount, 0),
      myCapital: capital / 100,
      mySocialFund: social / 100,
      myPapoMandatory: mandatoryDebt / 100,
      myPapoMandatoryDebt: mandatoryDebt / 100,
      myPapoInterestDebt: papoInterestDebt / 100,
      otherDeductions: debt / 100,
      balanceToCollect: Math.max(0, debt - (gross - mandatoryDebt)) / 100,
      myOnTimeLoanInterest: timely / 100,
      myPapoInterestPaid: papoPaid / 100,
      myPapoInterestRefund: papoRefund / 100,
      estimatedProfitDividend: dividend / 100,
      totalDeductions: (debt + mandatoryDebt) / 100,
      grossPayout: gross / 100,
      netPayout: net / 100,
      payoutAfterPapoRepayment: (net + mandatoryDebt) / 100,
    };
  });

  return {
    totalGroupSharesValue: sumMoney(input.shares.map(row => row.amountPaid)) / 100,
    totalGroupSocialFund: sumMoney(input.shares.map(row => row.socialFundPaid)) / 100,
    distributableProfitPool: pool / 100,
    totalExpenses: expenses / 100,
    groupPool: {
      memberCount,
      papoInterestPool: papoPool / 100,
      lateLoanInterestPool: lateLoan / 100,
      unclassifiedLoanInterest: unknownLoan / 100,
      finesPool: paidFines / 100,
      expenses: expenses / 100,
      expenseShortfall: Math.max(0, expenses - grossPool) / 100,
      totalDistributableProfit: pool / 100,
    },
    membersPayout,
  };
}
