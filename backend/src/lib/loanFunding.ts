import { z } from 'zod';

export const fundingOrder = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
export const fundingInput = z.object({
  amount: z.number().positive().max(1_000_000_000_000),
  expectedFunded: z.number().nonnegative(),
});

export function recordFunding(requested: number, funded: number, amount: number, expectedFunded: number) {
  const cents = (value: number) => Math.round(value * 100);
  if (cents(amount) / 100 !== amount || cents(expectedFunded) !== cents(funded) || cents(amount) <= 0 || cents(funded) + cents(amount) > cents(requested)) return null;
  const total = cents(funded) + cents(amount);
  return { fundedAmount: total / 100, remaining: (cents(requested) - total) / 100 };
}

export function fundingEntry({ id, userId, createdAt, principalAmount, fundedAmount, user }: { id: string; userId: string; createdAt: Date; principalAmount: number; fundedAmount: number | null; user: { fullName: string } }) {
  return {
    id, userId, createdAt, fullName: user.fullName, requested: principalAmount,
    funded: fundedAmount ?? 0, remaining: Math.max(0, Math.round((principalAmount - (fundedAmount ?? 0)) * 100) / 100),
  };
}
