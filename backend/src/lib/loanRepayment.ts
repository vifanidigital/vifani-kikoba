import { addMonths } from './subscription';
import { localDate, parseMeetingDate } from './meetingCalendar';

export const loanRate = 10;
const round = (amount: number) => Math.round(amount * 100) / 100;
export const calendarLoanDue = (disbursedAt: Date, months: number) => {
  const calendar = new Date(localDate(disbursedAt) + 'T00:00:00Z');
  return parseMeetingDate(addMonths(calendar, months).toISOString().slice(0, 10))!;
};

export type Repayment = {
  id: string;
  requestedAt: string;
  receivedAt?: string;
  principal: number;
  first: number;
  second: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
};

export type RepaymentPlan = {
  principalPaid: number;
  firstPaid: boolean;
  secondPaid: boolean;
  latest: Repayment | null;
  history?: Repayment[];
};

export const blankRepaymentPlan: RepaymentPlan = { principalPaid: 0, firstPaid: false, secondPaid: false, latest: null };

export function repaymentQuote(principal: number, plan: RepaymentPlan, disbursedAt: Date, now: Date) {
  const principalRemaining = Math.max(0, round(principal - plan.principalPaid));
  const firstDue = calendarLoanDue(disbursedAt, 1);
  const secondDue = calendarLoanDue(disbursedAt, 2);
  const firstInterest = plan.firstPaid ? 0 : round(principal * loanRate / 100);
  const secondInterest = plan.secondPaid ? 0 : round(principalRemaining * loanRate / 100);
  const secondRequired = now >= secondDue;
  return { principalRemaining, firstDue, secondDue, firstInterest, secondInterest, secondRequired,
    dueBalance: round(principalRemaining + firstInterest + (secondRequired ? secondInterest : 0)) };
}

export function quotePayment(quote: ReturnType<typeof repaymentQuote>, principal: number, includeSecond: boolean) {
  if (!Number.isFinite(principal) || principal < 0 || principal > quote.principalRemaining || round(principal) !== principal) return null;
  const second = includeSecond || quote.secondRequired ? quote.secondInterest : 0;
  if (principal + quote.firstInterest + second <= 0) return null;
  return { principal, first: quote.firstInterest, second };
}

export function currentLoanQuote(loan: { repaymentPlan: unknown; disbursedAt: Date | null; principalAmount: number }, now = new Date()) {
  return loan.repaymentPlan && loan.disbursedAt
    ? repaymentQuote(loan.principalAmount, loan.repaymentPlan as RepaymentPlan, loan.disbursedAt, now)
    : null;
}
