const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

type LoanTerms = {
  disbursedAt: Date | null;
  repaymentMonths: number;
  principalAmount: number;
  totalRepayable: number;
  amountPaid: number;
};

export function unpaidInterestInstallments(loan: LoanTerms) {
  const months = Math.max(1, loan.repaymentMonths);
  const total = Math.max(0, Math.round((loan.totalRepayable - loan.principalAmount) * 100));
  const monthly = Math.round(total / (100 * months)) * 100;
  const paid = Math.max(0, Math.round(loan.amountPaid * 100));
  const start = loan.disbursedAt?.getTime();

  return Array.from({ length: months }, (_, index) => {
    const number = index + 1;
    const before = Math.min(total, monthly * index);
    const through = number === months ? total : Math.min(total, monthly * number);
    return {
      number,
      amount: Math.max(0, through - Math.max(paid, before)) / 100,
      dueAt: start === undefined ? null : new Date(start + number * MONTH_MS),
    };
  }).filter(installment => installment.amount > 0);
}

export function interestTiming(entry: { interestDueAt: Date | null; createdAt: Date }) {
  if (!entry.interestDueAt) return 'UNKNOWN';
  return entry.createdAt <= entry.interestDueAt ? 'ON_TIME' : 'LATE';
}
