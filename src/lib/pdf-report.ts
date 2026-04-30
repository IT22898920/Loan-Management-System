import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './utils';

// ─── Daily Report (Staff) ─────────────────────────────────────────────────────

export interface ReportCenter {
  center_name: string;
  center_number: number;
  expected_collection: number;
  collection_amount: number;
  loan_issued: number;
}

export interface DailyReportData {
  staff_name: string;
  report_date: string;
  centers: ReportCenter[];
  cash_issued: number;
  loan_issued: number;
}

export function generateDailyReportPDF(data: DailyReportData): void {
  const doc = new jsPDF();
  const W = 210;

  // ── Colours ──────────────────────────────────────────────────────────────────
  const BLUE       = [30,  64, 175] as [number,number,number];
  const BLUE_MID   = [37,  99, 235] as [number,number,number];
  const BLUE_LIGHT = [219,234, 254] as [number,number,number];
  const BLUE_SOFT  = [239,246, 255] as [number,number,number];
  const GREEN      = [22, 163,  74] as [number,number,number];
  const GREEN_SOFT = [220,252, 231] as [number,number,number];
  const GRAY       = [100,116, 139] as [number,number,number];
  const DARK       = [15,  23,  42] as [number,number,number];

  // ── Header band ──────────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 42, 'F');

  // Accent stripe
  doc.setFillColor(...BLUE_MID);
  doc.rect(0, 36, W, 6, 'F');

  // Company name
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('DIRIYALANKA', 14, 18);

  // Sub-title
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 210, 255);
  doc.text('Micro Finance — Daily Collection Report', 14, 27);

  // Date top-right
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(formatDate(data.report_date), W - 14, 18, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(190, 210, 255);
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, W - 14, 26, { align: 'right' });

  // ── Info row (3 boxes) ───────────────────────────────────────────────────────
  const boxY = 48;
  const boxes = [
    { label: 'Staff Officer', value: data.staff_name },
    { label: 'Report Date',   value: formatDate(data.report_date) },
    { label: 'Centers',       value: data.centers.length.toString() },
  ];
  const boxW = 58; const gap = 5; let bx = 14;
  boxes.forEach(({ label, value }) => {
    doc.setFillColor(...BLUE_SOFT);
    doc.roundedRect(bx, boxY, boxW, 16, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(label.toUpperCase(), bx + 4, boxY + 5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(value, bx + 4, boxY + 12);
    bx += boxW + gap;
  });

  // ── Section label ─────────────────────────────────────────────────────────
  const secY = 72;
  doc.setFillColor(...BLUE);
  doc.rect(14, secY, 4, 7, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Collection Summary', 21, secY + 5.5);

  // ── Collection table ─────────────────────────────────────────────────────────
  const totalExpected  = data.centers.reduce((s, c) => s + c.expected_collection, 0);
  const totalCollected = data.centers.reduce((s, c) => s + c.collection_amount, 0);
  const totalLoan      = data.centers.reduce((s, c) => s + c.loan_issued, 0);

  const tableRows = data.centers.map((c) => [
    c.center_name,
    c.center_number.toString(),
    formatCurrency(c.expected_collection),
    formatCurrency(c.collection_amount),
    c.loan_issued > 0 ? formatCurrency(c.loan_issued) : '—',
  ]);
  tableRows.push(['TOTAL', '', formatCurrency(totalExpected), formatCurrency(totalCollected), formatCurrency(totalLoan)]);

  autoTable(doc, {
    startY: secY + 10,
    head: [['Center Name', 'No.', 'Expected', 'Collected', 'Loan Issued']],
    body: tableRows,
    styles: { fontSize: 9.5, cellPadding: { top: 5, bottom: 5, left: 5, right: 5 } },
    headStyles: { fillColor: BLUE, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 33, halign: 'right', textColor: BLUE },
    },
    didParseCell: (h) => {
      if (h.row.index === tableRows.length - 1) {
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.fillColor = BLUE_LIGHT;
        h.cell.styles.textColor = BLUE;
      }
    },
  });

  const afterTable = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Cash Flow section ─────────────────────────────────────────────────────────
  const cfY = afterTable + 10;
  doc.setFillColor(...BLUE);
  doc.rect(14, cfY, 4, 7, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Cash Flow Summary', 21, cfY + 5.5);

  const totalCashBalance = data.cash_issued + totalCollected - data.loan_issued;

  // Two-column layout
  const leftX = 14; const rightX = 111;
  const colW = 91; const rowH = 9; let rowY = cfY + 13;

  const drawRow = (x: number, label: string, value: string, bold = false, bg?: [number,number,number]) => {
    if (bg) { doc.setFillColor(...bg); doc.rect(x, rowY - 5.5, colW, rowH, 'F'); }
    doc.setFontSize(9.5);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...(bold ? DARK : GRAY));
    doc.text(label, x + 4, rowY);
    doc.setTextColor(...DARK);
    doc.text(value, x + colW - 4, rowY, { align: 'right' });
  };

  // Cash In box
  doc.setFillColor(...BLUE_SOFT);
  doc.roundedRect(leftX, rowY - 6, colW, 7, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLUE);
  doc.text('CASH IN', leftX + 4, rowY - 1);
  rowY += 9;

  drawRow(leftX, 'Cash Issued (Starting)', formatCurrency(data.cash_issued));
  rowY += rowH;
  drawRow(leftX, 'Loan Repayments Collected', formatCurrency(totalCollected));
  rowY += rowH + 2;

  // Cash Out box
  doc.setFillColor(255, 241, 242);
  doc.roundedRect(leftX, rowY - 6, colW, 7, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38);
  doc.text('CASH OUT', leftX + 4, rowY - 1);
  rowY += 9;

  drawRow(leftX, 'Loan Issued (New Loans)', formatCurrency(data.loan_issued));
  rowY += rowH + 3;

  // Balance row
  doc.setFillColor(...GREEN_SOFT);
  doc.roundedRect(leftX, rowY - 6, colW, 10, 2, 2, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GREEN);
  doc.text('Total Cash Balance', leftX + 4, rowY + 1);
  doc.text(formatCurrency(totalCashBalance), leftX + colW - 4, rowY + 1, { align: 'right' });

  // Right column — rate card
  const rY = cfY + 13;
  const rate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;

  doc.setFillColor(...BLUE_SOFT);
  doc.roundedRect(rightX, rY - 6, colW, 52, 3, 3, 'F');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLUE);
  doc.text('COLLECTION RATE', rightX + colW / 2, rY + 1, { align: 'center' });

  doc.setFontSize(28); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...(rate >= 100 ? GREEN : BLUE));
  doc.text(`${rate}%`, rightX + colW / 2, rY + 22, { align: 'center' });

  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
  doc.text(`${formatCurrency(totalCollected)} of ${formatCurrency(totalExpected)}`, rightX + colW / 2, rY + 32, { align: 'center' });

  // Progress bar
  const pbX = rightX + 6; const pbW = colW - 12;
  doc.setFillColor(200, 220, 255); doc.roundedRect(pbX, rY + 36, pbW, 4, 2, 2, 'F');
  doc.setFillColor(...GREEN); doc.roundedRect(pbX, rY + 36, pbW * Math.min(1, rate / 100), 4, 2, 2, 'F');

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(0, 285, W, 12, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 210, 255);
  doc.text('DIRIYALANKA Micro Finance — Confidential', 14, 292);
  doc.text(`Page 1 of 1`, W - 14, 292, { align: 'right' });

  doc.save(`daily-report-${data.report_date}.pdf`);
}

// ─── Members List PDF ─────────────────────────────────────────────────────────

export interface MemberPDFRow {
  member_number: string;
  full_name: string;
  center_name: string;
  active_plans: string;
  loan_balance: number;
  joined: string;
}

export function generateMembersPDF(data: MemberPDFRow[], filterLabel?: string): void {
  const doc = new jsPDF();

  // Title block
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Members Report', 105, 12, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Loan Management System`, 105, 20, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Members: ${data.length}${filterLabel ? `  |  Filter: ${filterLabel}` : ''}`, 14, 36);
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, 14, 43);

  const activeCount = data.filter(m => m.active_plans && m.active_plans !== 'None').length;
  doc.text(`Active Loans: ${activeCount}  |  No Active Loan: ${data.length - activeCount}`, 14, 50);

  const rows = data.map((m) => [
    m.member_number,
    m.full_name,
    m.center_name,
    m.active_plans || 'None',
    m.loan_balance > 0 ? formatCurrency(m.loan_balance) : '—',
    m.joined,
  ]);

  autoTable(doc, {
    startY: 57,
    head: [['Member #', 'Full Name', 'Center', 'Active Plans', 'L/B', 'Joined']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 50 },
      2: { cellWidth: 40 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28 },
      5: { cellWidth: 26 },
    },
  });

  // Footer
  const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
  }

  doc.save(`members-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─── Payments PDF ─────────────────────────────────────────────────────────────

export interface PaymentPDFRow {
  payment_date: string;
  member_name: string;
  member_number: string;
  loan_plan: string;
  amount_paid: number;
  is_not_paid: boolean;
  shortfall: number;
  staff_name: string;
}

export function generatePaymentsPDF(data: PaymentPDFRow[], title?: string): void {
  const doc = new jsPDF('landscape');

  // Title block
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, 297, 26, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title ?? 'Payments Report', 148, 11, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Loan Management System', 148, 19, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  const totalCollected = data.reduce((s, p) => s + (p.is_not_paid ? 0 : p.amount_paid), 0);
  const paidCount = data.filter(p => !p.is_not_paid).length;
  const npCount = data.filter(p => p.is_not_paid).length;
  const shortfallCount = data.filter(p => !p.is_not_paid && p.shortfall > 0).length;

  doc.setFontSize(10);
  doc.text(`Records: ${data.length}   |   Paid: ${paidCount}   |   N/P: ${npCount}   |   Shortfalls: ${shortfallCount}   |   Total Collected: ${formatCurrency(totalCollected)}`, 14, 34);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, 14, 41);

  const rows = data.map((p) => [
    p.payment_date,
    p.member_name,
    p.member_number,
    p.loan_plan,
    p.is_not_paid ? 'N/P' : formatCurrency(p.amount_paid),
    p.shortfall > 0 ? formatCurrency(p.shortfall) : '—',
    p.staff_name,
  ]);

  autoTable(doc, {
    startY: 47,
    head: [['Date', 'Member Name', 'Member #', 'Plan', 'Amount', 'Shortfall', 'Staff']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const row = data[hookData.row.index];
        if (row?.is_not_paid) {
          hookData.cell.styles.textColor = [220, 38, 38];
        } else if (row?.shortfall > 0) {
          hookData.cell.styles.textColor = [161, 98, 7];
        }
      }
    },
  });

  // Footer pages
  const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${pageCount}`, 148, 205, { align: 'center' });
  }

  doc.save(`payments-${new Date().toISOString().split('T')[0]}.pdf`);
}
