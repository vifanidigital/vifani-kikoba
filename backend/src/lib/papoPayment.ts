const cents = (value: number) => Math.round(value * 100);

export function papoPayment(entry: { principalAmount: number; totalPayable: number; amountPaid: number }, amount: number) {
  const value = cents(amount);
  const paid = cents(entry.amountPaid);
  const payable = cents(entry.totalPayable);
  if (!Number.isFinite(amount) || value / 100 !== amount || value <= 0 || paid + value > payable) return null;
  const interest = Math.min(value, Math.max(0, payable - cents(entry.principalAmount) - paid));
  return { totalPaid: (paid + value) / 100, principal: (value - interest) / 100, interest: interest / 100, remaining: (payable - paid - value) / 100 };
}

export function outstandingPapoPrincipal(entry: { principalAmount: number; totalPayable: number; amountPaid: number }) {
  return Math.max(0, cents(entry.principalAmount) - Math.max(0, cents(entry.amountPaid) - (cents(entry.totalPayable) - cents(entry.principalAmount)))) / 100;
}

export function optionalPapoBalance(total: number, largeLoansOut: number, optionalPapoOut: number) {
  return {
    outstanding: optionalPapoOut,
    balanceWithPapo: Math.max(0, total),
    balanceWithoutPapo: Math.max(0, total - optionalPapoOut),
    cashAvailable: Math.max(0, total - largeLoansOut - optionalPapoOut),
  };
}
