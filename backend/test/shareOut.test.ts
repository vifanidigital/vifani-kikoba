import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateShareOut } from '../src/lib/shareOut';
import { interestTiming, unpaidInterestInstallments } from '../src/lib/loanInterest';

test('interest is split into dated installments whose amounts add up to the loan interest', () => {
  const disbursedAt = new Date('2026-01-01T08:00:00Z');
  const loan = { disbursedAt, repaymentMonths: 3, principalAmount: 100, totalRepayable: 110, amountPaid: 0 };
  const rows = unpaidInterestInstallments(loan);
  assert.deepEqual(rows.map(row => row.amount), [3, 3, 4]);
  assert.equal(rows[0].dueAt?.toISOString(), '2026-01-31T08:00:00.000Z');
  assert.equal(interestTiming({ interestDueAt: rows[0].dueAt, createdAt: rows[0].dueAt! }), 'ON_TIME');
  assert.equal(interestTiming({ interestDueAt: rows[0].dueAt, createdAt: new Date('2026-02-01T08:00:00Z') }), 'LATE');
  assert.equal(interestTiming({ interestDueAt: null, createdAt: disbursedAt }), 'UNKNOWN');
  assert.equal(unpaidInterestInstallments({ ...loan, amountPaid: 3 })[0].number, 2);
});

test('personal contributions and timely interest return to their owner while group profit is shared equally', () => {
  const result = calculateShareOut({
    members: [{ userId: 'b', fullName: 'B' }, { userId: 'a', fullName: 'A' }],
    shares: [
      { userId: 'a', sharesCount: 9, amountPaid: 90, socialFundPaid: 20 },
      { userId: 'b', sharesCount: 1, amountPaid: 10, socialFundPaid: 5 },
    ],
    papoAccounts: [{ userId: 'a', mandatoryBalance: 5 }],
    periodicPapo: [{ userId: 'a', amount: 10 }],
    interest: [
      { userId: 'a', amount: 8, interestDueAt: new Date('2026-02-01'), createdAt: new Date('2026-01-31') },
      { userId: 'b', amount: 3, interestDueAt: new Date('2026-02-01'), createdAt: new Date('2026-02-02') },
      { userId: 'b', amount: 80, interestDueAt: null, createdAt: new Date('2026-02-02') },
    ],
    loans: [],
    topUps: [{ userId: 'b', status: 'PAID', principalAmount: 10, totalPayable: 14, amountPaid: 14 }],
    unpaidFines: [{ userId: 'a', amount: 2 }],
    paidFines: 4.01,
    expenses: 2,
  });
  const [a, b] = result.membersPayout;
  assert.equal(result.groupPool.papoInterestPool, 7);
  assert.equal(result.groupPool.unclassifiedLoanInterest, 80);
  assert.equal(result.distributableProfitPool, 12.01);
  assert.equal(a.estimatedProfitDividend, 6.01);
  assert.equal(b.estimatedProfitDividend, 6);
  assert.equal(a.myOnTimeLoanInterest, 8);
  assert.equal(a.mySocialFund, 20);
  assert.equal(a.myPapoInterestRefund, 5);
  assert.equal(b.myPapoInterestRefund, 2);
  assert.equal(a.myPapoMandatoryDebt, 5);
  assert.equal(a.netPayout, 127.01);
  assert.equal(b.netPayout, 23);
});

test('mandatory Papo remains personal and must be returned at closure without increasing net cash', () => {
  const result = calculateShareOut({
    members: [{ userId: 'a', fullName: 'A' }, { userId: 'b', fullName: 'B', isActive: false }],
    shares: [], papoAccounts: [{ userId: 'b', mandatoryBalance: 70 }],
    mandatoryPapoAmount: 50, periodicPapo: [], interest: [], loans: [], topUps: [],
    unpaidFines: [], paidFines: 10, expenses: 0,
  });
  const [active, suspended] = result.membersPayout;
  assert.equal(active.myPapoMandatoryDebt, 50);
  assert.equal(active.myPapoMandatory, 50);
  assert.equal(active.netPayout, 10);
  assert.equal(active.payoutAfterPapoRepayment, 60);
  assert.equal(suspended.myPapoMandatoryDebt, 70);
  assert.equal(suspended.estimatedProfitDividend, 0);
  assert.equal(result.distributableProfitPool, 10);
});
