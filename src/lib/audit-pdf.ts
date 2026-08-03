import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './utils';
import type { AuditTotals } from './audit-report';

// ─── Audit Summary PDF (Admin) ────────────────────────────────────────────────
// Printable center-wise summary of a financial-year audit report. The Excel
// download stays the full-detail deliverable (row-level collections etc.);
// this PDF mirrors its Summary sheet for sharing/printing.

export function generateAuditPdf(totals: AuditTotals): void {
  const doc = new jsPDF('l', 'mm', 'a4'); // landscape — 11 numeric columns
  const W = 297;

  const BLUE       = [30,  64, 175] as [number, number, number];
  const BLUE_MID   = [37,  99, 235] as [number, number, number];
  const BLUE_SOFT  = [239, 246, 255] as [number, number, number];
  const GRAY       = [100, 116, 139] as [number, number, number];
  const DARK       = [15,  23,  42] as [number, number, number];

  const fy = totals.fy;

  // ── Header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...BLUE_MID);
  doc.rect(0, 29, W, 5, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('DIRIYALANKA', 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 210, 255);
  doc.text(`Micro Finance — Audit Report ${fy.label} (01/04/${fy.start.slice(0, 4)} – 31/03/${fy.end.slice(0, 4)})`, 14, 23);

  doc.setFontSize(8);
  doc.setTextColor(190, 210, 255);
  doc.text(`Generated: ${new Date().toLocaleString('en-LK')}`, W - 14, 15, { align: 'right' });
  doc.setTextColor(255, 255, 255);
  doc.text('For the external auditor', W - 14, 22, { align: 'right' });

  // ── Info boxes ─────────────────────────────────────────────────────────────
  const boxY = 40;
  const boxes = [
    { label: 'Financial Year', value: fy.label },
    { label: 'Loans Granted', value: totals.loansIssued.toLocaleString() },
    { label: 'Payments Collected', value: totals.collectionRows.toLocaleString() },
    { label: 'Open Loans at FY End', value: totals.openPositions.toLocaleString() },
    { label: 'Centers', value: totals.centers.length.toString() },
  ];
  const boxW = 52; const gap = 4; let bx = 14;
  boxes.forEach(({ label, value }) => {
    doc.setFillColor(...BLUE_SOFT);
    doc.roundedRect(bx, boxY, boxW, 15, 2, 2, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(label.toUpperCase(), bx + 4, boxY + 5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(value, bx + 4, boxY + 11.5);
    bx += boxW + gap;
  });

  // ── Key figures ────────────────────────────────────────────────────────────
  const secY = 62;
  doc.setFillColor(...BLUE);
  doc.rect(14, secY, 4, 6, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Key Figures', 21, secY + 4.5);

  autoTable(doc, {
    startY: secY + 9,
    head: [['', 'Capital (LKR)', 'Interest (LKR)', 'Total (LKR)']],
    body: [
      ['Loans Granted',
        formatCurrency(totals.grantedCapital), formatCurrency(totals.grantedInterest),
        formatCurrency(totals.grantedCapital + totals.grantedInterest)],
      ['Collections',
        formatCurrency(totals.collectedCapital), formatCurrency(totals.collectedInterest),
        formatCurrency(totals.collectedAmount)],
      ['Outstanding at FY End',
        formatCurrency(totals.osCapital), formatCurrency(totals.osInterest),
        formatCurrency(totals.osCapital + totals.osInterest)],
    ],
    styles: { fontSize: 9, cellPadding: 3.5 },
    // Headers right-aligned to sit directly over the right-aligned figures —
    // centered headings read as misaligned columns (QA 86eycpmf2 reopen).
    headStyles: {
      fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold',
      fontSize: 8.5, halign: 'right',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70 },
      1: { halign: 'right', cellWidth: 55 },
      2: { halign: 'right', cellWidth: 55 },
      3: { halign: 'right', cellWidth: 55 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 0) {
        data.cell.styles.halign = 'left';
      }
    },
  });

  // ── Center table ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterKey = (doc as any).lastAutoTable.finalY + 10;
  doc.setFillColor(...BLUE);
  doc.rect(14, afterKey, 4, 6, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text(`Summary by Center (${totals.centers.length})`, 21, afterKey + 4.5);

  const money = (n: number) => n === 0 ? '-' : formatCurrency(n);
  const rows = totals.centers.map((r, i) => [
    (i + 1).toString(), r.center, r.grantedCount.toString(),
    money(r.grantedCapital), money(r.grantedInterest),
    money(r.collectedAmount), money(r.collectedCapital), money(r.collectedInterest),
    money(r.osCapital), money(r.osInterest), money(r.osCapital + r.osInterest),
  ]);
  rows.push([
    '', 'TOTAL', totals.loansIssued.toString(),
    formatCurrency(totals.grantedCapital), formatCurrency(totals.grantedInterest),
    formatCurrency(totals.collectedAmount), formatCurrency(totals.collectedCapital),
    formatCurrency(totals.collectedInterest),
    formatCurrency(totals.osCapital), formatCurrency(totals.osInterest),
    formatCurrency(totals.osCapital + totals.osInterest),
  ]);

  autoTable(doc, {
    startY: afterKey + 9,
    head: [['No', 'Center', 'Loans', 'Cap. Granted', 'Int. Granted',
            'Collected', 'Cap. Collected', 'Int. Collected',
            'O/S Capital', 'O/S Interest', 'O/S Total']],
    body: rows,
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: {
      fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold',
      fontSize: 6.8, halign: 'right', valign: 'middle',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    // Fixed widths on every column so headings and figures stay aligned:
    // 10 + 41 + 12 + 8 x 25.75 = 269mm = full landscape width inside margins.
    columnStyles: {
      0: { cellWidth: 10, halign: 'left' },
      1: { cellWidth: 41, halign: 'left' },
      2: { halign: 'right', cellWidth: 12 },
      3: { halign: 'right', cellWidth: 25.75 }, 4: { halign: 'right', cellWidth: 25.75 },
      5: { halign: 'right', cellWidth: 25.75 }, 6: { halign: 'right', cellWidth: 25.75 },
      7: { halign: 'right', cellWidth: 25.75 }, 8: { halign: 'right', cellWidth: 25.75 },
      9: { halign: 'right', cellWidth: 25.75 }, 10: { halign: 'right', cellWidth: 25.75 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index <= 1) {
        data.cell.styles.halign = 'left';
      }
      if (data.row.index === rows.length - 1 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [219, 234, 254];
      }
    },
  });

  // ── Methodology + page footer ──────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(
      'Split method: interest = amount x (loan interest / loan total); capital = remainder. Full row-level detail is in the Excel export.',
      14, 202,
    );
    doc.text(`Page ${p} of ${pageCount}`, W - 14, 202, { align: 'right' });
  }

  doc.save(`DIRIYALANKA-Audit-${fy.label}-Summary.pdf`);
}
