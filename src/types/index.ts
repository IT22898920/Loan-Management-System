export type UserRole = 'admin' | 'staff';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday';

export type LoanPlan = 5000 | 10000 | 20000;

export type LoanStatus = 'active' | 'completed';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  created_at: string;
}

export interface Center {
  id: string;
  name: string;
  center_number: number;
  collection_day: DayOfWeek | null;
  manager_name: string | null;
  created_at: string;
}

export interface StaffCenterAssignment {
  id: string;
  staff_id: string;
  center_id: string;
  day_of_week: DayOfWeek;
  staff?: Profile;
  center?: Center;
}

export interface Member {
  id: string;
  member_number: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  center_id: string;
  created_by: string;
  created_at: string;
  center?: Center;
  loans?: Loan[];
}

export interface Loan {
  id: string;
  member_id: string;
  loan_plan: number | null;        // legacy preset (5000/10000/20000) or null for custom/imported
  principal: number | null;        // amount lent
  interest: number | null;         // interest added
  original_balance: number | null; // principal + interest at issue
  product_type: number | null;     // source "Type" tier 1..5
  cycle_no: number | null;         // 1 = first loan, ascending per member
  source: string | null;           // 'import' for migrated rows
  loan_balance: number;            // CURRENT outstanding (decrements with payments)
  weekly_payment: number;
  issued_date: string;
  status: LoanStatus;
  is_first_loan: boolean;
  created_by: string;
  created_at: string;
  member?: Member;
}

export interface Payment {
  id: string;
  loan_id: string;
  member_id: string;
  staff_id: string | null;
  amount_paid: number;
  is_not_paid: boolean;
  shortfall: number;
  payment_date: string;
  marker: string | null;        // 'N/P' | 'NEW' | 'N/A' etc. (mainly on imported rows)
  source: string | null;        // 'import' for migrated rows
  gps_lat: number | null;
  gps_lng: number | null;
  gps_address: string | null;
  created_at: string;
  loan?: Loan;
  member?: Member;
  staff?: Profile;
}

export interface DailyReport {
  id: string;
  staff_id: string;
  report_date: string;
  cash_issued: number;
  loan_issued: number;
  submitted_at: string | null;
  staff?: Profile;
}

export interface LoanPlanConfig {
  plan: LoanPlan;
  returning_balance: number;
  new_member_balance: number;
  weekly_payment: number;
}

export const LOAN_PLANS: LoanPlanConfig[] = [
  { plan: 5000, returning_balance: 6000, new_member_balance: 6000, weekly_payment: 600 },
  { plan: 10000, returning_balance: 12500, new_member_balance: 13000, weekly_payment: 1000 },
  { plan: 20000, returning_balance: 25000, new_member_balance: 26000, weekly_payment: 2000 },
];

export const DAYS_OF_WEEK: { value: DayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Monday (සඳුදා)' },
  { value: 'tuesday', label: 'Tuesday (අඟහරුවාදා)' },
  { value: 'wednesday', label: 'Wednesday (බදාදා)' },
  { value: 'thursday', label: 'Thursday (බ්‍රහස්පතින්දා)' },
];

export const TODAY_DAY_OF_WEEK = (): DayOfWeek | null => {
  // Weekday in Asia/Colombo, independent of host TZ — must match the DB RLS
  // day-gating (now() at time zone 'Asia/Colombo'). Working days: Mon–Thu.
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Colombo', weekday: 'long' })
    .format(new Date())
    .toLowerCase();
  const working: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday'];
  return (working as string[]).includes(wd) ? (wd as DayOfWeek) : null;
};
