import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankRepaymentPlan, calendarLoanDue, quotePayment, repaymentQuote } from '../src/lib/loanRepayment';
import { ensureQueue } from '../src/routes/loanQueue';

test('first interest is mandatory and second interest uses outstanding principal on the local due day', () => {
  const start = new Date('2026-01-31T11:28:00Z');
  assert.equal(calendarLoanDue(start, 1).toISOString(), '2026-02-27T21:00:00.000Z');
  const first = repaymentQuote(100000, blankRepaymentPlan, start, new Date('2026-02-01'));
  assert.deepEqual(quotePayment(first, 40000, false), { principal: 40000, first: 10000, second: 0 });
  const plan = { ...blankRepaymentPlan, firstPaid: true, principalPaid: 40000 };
  const cutoff = calendarLoanDue(start, 2);
  const early = repaymentQuote(100000, plan, start, new Date(cutoff.getTime() - 1));
  assert.deepEqual(quotePayment(early, 60000, false), { principal: 60000, first: 0, second: 0 });
  assert.deepEqual(quotePayment(early, 60000, true), { principal: 60000, first: 0, second: 6000 });
  const onDate = repaymentQuote(100000, plan, start, cutoff);
  assert.deepEqual(quotePayment(onDate, 60000, false), { principal: 60000, first: 0, second: 6000 });
  assert.equal(quotePayment(onDate, 60001, false), null);
  assert.equal(repaymentQuote(100000, { ...plan, secondPaid: true }, start, cutoff).dueBalance, 60000);
});

test('queue skips inactive members, appends new members and wraps after the last turn', () => {
  assert.deepEqual(ensureQueue({ order: ['a','b','c'], previous: 'a', swaps: [] }, ['a','c','d']), { order: ['a','b','c','d'], next: 'c' });
  assert.equal(ensureQueue({ order: ['a','b','c'], previous: 'c', swaps: [] }, ['a','b','c']).next, 'a');
});
