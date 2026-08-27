import * as XLSX from 'xlsx';

export interface ExcelRow {
  center_name: string;
  loan_type: number;
  member_number: string;
  member_name: string;
  issued_date: string;
  loan_balance: number;
}

export function parseExcelFile(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const raw = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
        }) as unknown[][];

        if (raw.length < 2) {
          reject(new Error('Excel file is empty or has no data rows.'));
          return;
        }

        // Find header row (first row with recognizable column headers)
        const headers = (raw[0] as string[]).map((h) => String(h).trim().toLowerCase());

        const colIdx = {
          center_name:   findCol(headers, ['center name', 'centre name', 'center']),
          loan_type:     findCol(headers, ['loan type', 'loan plan', 'plan']),
          member_number: findCol(headers, ['member number', 'member no', 'member_number']),
          member_name:   findCol(headers, ['member name', 'name']),
          issued_date:   findCol(headers, ['l issued date', 'l.issued date', 'lissueddate', 'issued date', 'issue date', 'loan date', 'date']),
          loan_balance:  findCol(headers, ['l/b', 'lb', 'loan balance', 'balance']),
        };

        const missing = Object.entries(colIdx)
          .filter(([, v]) => v === -1)
          .map(([k]) => k);

        if (missing.length > 0) {
          reject(new Error(`Missing columns: ${missing.join(', ')}`));
          return;
        }

        const rows: ExcelRow[] = [];
        const dateErrors: string[] = [];

        for (let i = 1; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          const memberNum = String(row[colIdx.member_number] ?? '').trim();
          if (!memberNum) continue;

          const rawLoanType = row[colIdx.loan_type];
          const loanType = parseLoanType(rawLoanType);
          if (!loanType) continue;

          const rawDate = row[colIdx.issued_date];
          let issuedDate: string;
          try {
            issuedDate = parseDate(rawDate);
          } catch (e) {
            // Surface the row-specific error and skip — never silently stamp
            // today's date as issued_date.
            dateErrors.push(
              `Row ${i + 1} (${memberNum}): ${e instanceof Error ? e.message : 'invalid date'}`,
            );
            continue;
          }
          const loanBalance = parseFloat(String(row[colIdx.loan_balance] ?? '0').replace(/,/g, '')) || 0;

          rows.push({
            center_name: String(row[colIdx.center_name] ?? '').trim(),
            loan_type: loanType,
            member_number: memberNum,
            member_name: String(row[colIdx.member_name] ?? '').trim(),
            issued_date: issuedDate,
            loan_balance: loanBalance,
          });
        }

        if (dateErrors.length > 0) {
          // Show up to 10 errors so the user can fix the source file
          const sample = dateErrors.slice(0, 10).join('\n');
          const more = dateErrors.length > 10 ? `\n…and ${dateErrors.length - 10} more.` : '';
          reject(new Error(`Date parse errors:\n${sample}${more}`));
          return;
        }

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function findCol(headers: string[], candidates: string[]): number {
  // Candidates are tried IN ORDER (most specific first) across all headers —
  // previously a single headers.findIndex over ANY candidate let the bare
  // 'name' fallback bind member_name to the earlier 'Center Name' column,
  // importing center letters as member names (QA 86eyr0fba).
  // Multi-token candidates match as a token subset; single generic tokens
  // ('name', 'date'...) require an EXACT header match so they can never
  // steal a more specific column.
  const headerTokens = headers.map(tokenize);
  for (const c of candidates) {
    const cTokens = tokenize(c);
    const idx = headerTokens.findIndex((tokens) =>
      cTokens.length === 1
        ? tokens.length === 1 && tokens[0] === cTokens[0]
        : cTokens.every((t) => tokens.includes(t))
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseLoanType(raw: unknown): 5000 | 10000 | 20000 | null {
  const str = String(raw ?? '').replace(/[,\s]/g, '').toLowerCase();
  if (str.includes('5000') || str === '5k' || str === '5,000') return 5000;
  if (str.includes('10000') || str === '10k' || str === '10,000') return 10000;
  if (str.includes('20000') || str === '20k' || str === '20,000') return 20000;
  return null;
}

function toYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isValidDMY(d: number, m: number, y: number): boolean {
  return (
    Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y) &&
    d >= 1 && d <= 31 &&
    m >= 1 && m <= 12 &&
    y >= 1900 && y <= 2999
  );
}

function parseDate(raw: unknown): string {
  // JS Date object (from XLSX cellDates:true) — use LOCAL date components
  // (toISOString() shifts date back in UTC+5:30 Sri Lanka).
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toYMD(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }

  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();

    // YYYY-MM-DD — already ISO
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const y = +iso[1], m = +iso[2], d = +iso[3];
      if (isValidDMY(d, m, y)) return s;
    }

    // DD/MM/YYYY or D/M/YYYY  (Sri Lankan standard)
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const d = +dmy[1], m = +dmy[2], y = +dmy[3];
      if (isValidDMY(d, m, y)) return toYMD(y, m, d);
    }

    // DD-MM-YYYY or D-M-YYYY
    const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dmy2) {
      const d = +dmy2[1], m = +dmy2[2], y = +dmy2[3];
      if (isValidDMY(d, m, y)) return toYMD(y, m, d);
    }

    // DD.MM.YYYY
    const dmy3 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmy3) {
      const d = +dmy3[1], m = +dmy3[2], y = +dmy3[3];
      if (isValidDMY(d, m, y)) return toYMD(y, m, d);
    }
  }

  // Excel serial date number — build YYYY-MM-DD directly from components
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d && isValidDMY(d.d, d.m, d.y)) return toYMD(d.y, d.m, d.d);
  }

  // No silent fallback to today — caller must skip the row and surface the
  // bad cell, otherwise weekly schedules + loan eligibility get corrupted.
  throw new Error(`Cannot parse date: ${JSON.stringify(raw)}`);
}
