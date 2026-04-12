import 'server-only';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);
}

export async function buildCustomerStatementPdf(params: {
  workshopName: string;
  workshopBank?: {
    bankName?: string | null;
    accountName?: string | null;
    accountNumber?: string | null;
    branchCode?: string | null;
  };
  customerName: string;
  from: string;
  to: string;
  rows: Array<{ date: string; kind: 'invoice' | 'quote'; number: string; orderNumber?: string; status: string; amountCents: number; paidCents?: number; balanceCents?: number; paymentMethod?: string; vehicle?: string }>;
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 805;
  const left = 40;

  page.drawText('Customer Statement', { x: left, y, size: 20, font: bold });
  y -= 24;
  page.drawText(params.workshopName, { x: left, y, size: 11, font: regular });
  y -= 14;
  page.drawText(params.customerName, { x: left, y, size: 11, font: bold });
  y -= 14;
  page.drawText(`${params.from} to ${params.to}`, { x: left, y, size: 10, font: regular, color: rgb(0.35, 0.35, 0.35) });
  y -= 22;

  page.drawText('Date', { x: left, y, size: 9, font: bold });
  page.drawText('Type', { x: left + 70, y, size: 9, font: bold });
  page.drawText('Number', { x: left + 110, y, size: 9, font: bold });
  page.drawText('Order #', { x: left + 180, y, size: 9, font: bold });
  page.drawText('Status', { x: left + 245, y, size: 9, font: bold });
  page.drawText('Method', { x: left + 300, y, size: 9, font: bold });
  page.drawText('Vehicle', { x: left + 350, y, size: 9, font: bold });
  page.drawText('Amount', { x: left + 430, y, size: 9, font: bold });
  page.drawText('Balance', { x: left + 500, y, size: 9, font: bold });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: 555, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 12;

  let totalAmount = 0;
  let totalBalance = 0;

  for (const row of params.rows.slice(0, 45)) {
    totalAmount += row.amountCents;
    totalBalance += row.balanceCents ?? (row.kind === 'invoice' ? row.amountCents : 0);

    page.drawText(row.date, { x: left, y, size: 8, font: regular });
    page.drawText(row.kind === 'invoice' ? 'INV' : 'QUO', { x: left + 70, y, size: 8, font: regular });
    page.drawText(row.number.slice(0, 10), { x: left + 110, y, size: 8, font: regular });
    page.drawText((row.orderNumber || '-').slice(0, 10), { x: left + 180, y, size: 8, font: regular });
    page.drawText(row.status.slice(0, 9), { x: left + 245, y, size: 8, font: regular });
    page.drawText((row.paymentMethod || '-').slice(0, 8), { x: left + 300, y, size: 8, font: regular });
    page.drawText((row.vehicle || '-').slice(0, 12), { x: left + 350, y, size: 8, font: regular });
    page.drawText(formatMoney(row.amountCents), { x: left + 430, y, size: 8, font: regular });
    page.drawText(formatMoney(row.balanceCents ?? 0), { x: left + 500, y, size: 8, font: regular });

    y -= 13;
    if (y < 80) break;
  }

  y -= 10;
  page.drawText(`Total amount: ${formatMoney(totalAmount)}`, { x: left + 320, y, size: 10, font: bold });
  y -= 14;
  page.drawText(`Outstanding balance: ${formatMoney(totalBalance)}`, { x: left + 320, y, size: 10, font: bold });

  y -= 26;
  page.drawText('Business banking details', { x: left, y, size: 10, font: bold });
  y -= 14;
  page.drawText(`Bank: ${params.workshopBank?.bankName || '-'}`, { x: left, y, size: 9, font: regular });
  y -= 12;
  page.drawText(`Account name: ${params.workshopBank?.accountName || params.workshopName}`, { x: left, y, size: 9, font: regular });
  y -= 12;
  page.drawText(`Account number: ${params.workshopBank?.accountNumber || '-'}`, { x: left, y, size: 9, font: regular });
  y -= 12;
  page.drawText(`Branch code: ${params.workshopBank?.branchCode || '-'}`, { x: left, y, size: 9, font: regular });

  return pdf.save();
}
