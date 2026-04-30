import { LoanPlan, LoanPlanConfig, LOAN_PLANS } from '@/types';

export function getLoanConfig(plan: LoanPlan): LoanPlanConfig {
  const config = LOAN_PLANS.find((p) => p.plan === plan);
  if (!config) throw new Error(`Unknown loan plan: ${plan}`);
  return config;
}

export function getLoanBalance(plan: LoanPlan, isFirstLoan: boolean): number {
  const config = getLoanConfig(plan);
  return isFirstLoan ? config.new_member_balance : config.returning_balance;
}

export function getWeeklyPayment(plan: LoanPlan): number {
  return getLoanConfig(plan).weekly_payment;
}

export function calculateShortfall(amountPaid: number, weeklyPayment: number): number {
  return amountPaid < weeklyPayment ? weeklyPayment - amountPaid : 0;
}

export function isLoanCompleted(loanBalance: number, amountPaid: number): boolean {
  return loanBalance - amountPaid <= 0;
}

export function newLoanBalance(currentBalance: number, amountPaid: number): number {
  return Math.max(0, currentBalance - amountPaid);
}
