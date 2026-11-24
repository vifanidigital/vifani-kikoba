export const MONTHLY_PRICE = 10000;

export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function subscriptionAccess(group: { subscriptionStatus: string; trialEndsAt: Date; paidUntil: Date | null }, now = new Date()) {
  if (group.subscriptionStatus === 'SUSPENDED') return 'SUSPENDED';
  if (group.paidUntil && group.paidUntil > now) return 'ACTIVE';
  return group.trialEndsAt > now ? 'TRIAL' : 'EXPIRED';
}
