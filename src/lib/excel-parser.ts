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
          member_number: findCol(headers, ['member number', 'member no', 'member_number', 'no']),
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

        for (let i = 1; i < raw.length; i++) {
          const row = raw[i] as unknown[];
          const memberNum = String(row[colIdx.member_number] ?? '').trim();
          if (!memberNum) continue;

          const rawLoanType = row[colIdx.loan_type];
          const loanType = parseLoanType(rawLoanType);
          if (!loanType) continue;

          const rawDate = row[colIdx.issued_date];
          const issuedDate = parseDate(rawDate);
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

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

function findCol(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
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

function parseDate(raw: unknown): string {
  // JS Date object (from XLSX cellDates:true)
  // Use LOCAL date components — toISOString() converts to UTC and shifts the
  // date backwards in UTC+5:30 (Sri Lanka), causing a -1 day error.
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toYMD(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }

  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();

    // YYYY-MM-DD — already ISO, use directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // DD/MM/YYYY or D/M/YYYY  (Sri Lankan standard)
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return toYMD(+dmy[3], +dmy[2], +dmy[1]);

    // DD-MM-YYYY or D-M-YYYY
    const dmy2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dmy2) return toYMD(+dmy2[3], +dmy2[2], +dmy2[1]);

    // DD.MM.YYYY
    const dmy3 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmy3) return toYMD(+dmy3[3], +dmy3[2], +dmy3[1]);

    // Native JS parse fallback (handles "Jan 15 2026", "2026/01/15", etc.)
    // Use local components to avoid UTC shift
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return toYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  }

  // Excel serial date number — build YYYY-MM-DD directly from components
  // (never go through new Date() + toISOString() to avoid UTC shift)
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return toYMD(d.y, d.m, d.d);
  }

  // Absolute fallback: today's date (local)
  const now = new Date();
  return toYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
