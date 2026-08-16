/**
 * Loan reference formatting — client requirement (Aug 2026):
 * each loan cycle is lettered onto the member number so the field books
 * read naturally: DLG0005A (1st loan), DLG0005B (2nd), DLG0005C (3rd)…
 *
 * cycle_no is the source of truth (unique per member via
 * uniq_loan_member_cycle); letters follow Excel column style so cycles
 * beyond 26 keep working (27 → AA).
 */
export function cycleLetter(cycleNo: number): string {
  let n = Math.max(1, Math.floor(cycleNo));
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export function loanRef(memberNumber: string, cycleNo: number | null | undefined): string {
  // Legacy imports may carry a NULL cycle — never fabricate an 'A' for those;
  // an unlettered ref is honest, a wrong letter in a field book is not.
  if (cycleNo == null) return memberNumber;
  return `${memberNumber}${cycleLetter(cycleNo)}`;
}
