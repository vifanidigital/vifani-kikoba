import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionalPapoBalance, outstandingPapoPrincipal, papoPayment } from '../src/lib/papoPayment';

test('partial Papo payments split interest and principal and retain the remaining debt', () => {
  const account = { principalAmount: 1000, totalPayable: 1100, amountPaid: 0 };
  assert.deepEqual(papoPayment(account, 350), { totalPaid: 350, principal: 250, interest: 100, remaining: 750 });
  const partial = { ...account, amountPaid: 350 };
  assert.equal(outstandingPapoPrincipal(partial), 750);
  assert.equal(papoPayment(partial, 751), null);
  assert.deepEqual(papoPayment(partial, 750), { totalPaid: 1100, principal: 750, interest: 0, remaining: 0 });
});

test('optional Papo toggle changes the displayed total without treating money lent as cash', () => {
  assert.deepEqual(optionalPapoBalance(150000, 25000, 40000), {
    outstanding: 40000, balanceWithPapo: 150000, balanceWithoutPapo: 110000, cashAvailable: 85000,
  });
  assert.deepEqual(optionalPapoBalance(150000, 25000, 0), {
    outstanding: 0, balanceWithPapo: 150000, balanceWithoutPapo: 150000, cashAvailable: 125000,
  });
});
