import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fundingEntry, recordFunding } from '../src/lib/loanFunding';

test('partial funding keeps a balance, rejects stale retries and cannot overpay', () => {
  assert.deepEqual(recordFunding(1000, 0, 300, 0), { fundedAmount: 300, remaining: 700 });
  assert.equal(recordFunding(1000, 300, 200, 0), null);
  assert.equal(recordFunding(1000, 300, 701, 300), null);
  assert.equal(recordFunding(1000, 300, 2.123, 300), null);
  assert.deepEqual(recordFunding(1000, 300, 700, 300), { fundedAmount: 1000, remaining: 0 });
});

test('the public funding row exposes only the amounts and applicant identity needed for the queue', () => {
  const createdAt = new Date();
  assert.deepEqual(fundingEntry({ id: 'loan', userId: 'member', createdAt, principalAmount: 900, fundedAmount: 300, user: { fullName: 'A' } }),
    { id: 'loan', userId: 'member', createdAt, fullName: 'A', requested: 900, funded: 300, remaining: 600 });
});
