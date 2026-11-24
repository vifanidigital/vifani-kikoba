import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, subscriptionAccess, MONTHLY_PRICE } from '../src/lib/subscription';

test('a calendar month is clamped at the end of the next month', () => {
  assert.equal(addMonths(new Date('2026-01-31T12:14:00Z'), 1).toISOString(), '2026-02-28T12:14:00.000Z');
  assert.equal(MONTHLY_PRICE, 10000);
});

test('trial, paid access, expiry and suspension respect the cutoff', () => {
  const now = new Date('2026-02-28T12:14:00Z');
  const earlier = new Date(now.getTime() - 1);
  const later = new Date(now.getTime() + 1);
  const group = { trialEndsAt: later, paidUntil: null, subscriptionStatus: 'TRIAL' };
  assert.equal(subscriptionAccess(group, now), 'TRIAL');
  assert.equal(subscriptionAccess({ ...group, trialEndsAt: now }, now), 'EXPIRED');
  assert.equal(subscriptionAccess({ ...group, trialEndsAt: earlier, paidUntil: later }, now), 'ACTIVE');
  assert.equal(subscriptionAccess({ ...group, paidUntil: later, subscriptionStatus: 'SUSPENDED' }, now), 'SUSPENDED');
});
