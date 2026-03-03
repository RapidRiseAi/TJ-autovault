import 'server-only';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);
}

type StatementLineItem = {
  occurred_on?: string;
  entry_kind?: 'income' | 'expense' | string;
  description?: string | null;
  category?: string | null;
  amount_cents?: number | string | null;
};

export async function buildMonthlyStatementPdf(params: {
  workshopName: string;
  monthStart: string;
  monthEnd: string;
  totals: { income_cents?: number; expense_cents?: number; profit_cents?: number };
  lineItems: StatementLineItem[];
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const width = page.getWidth();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 40;

  page.drawText('Monthly Statement', { x: left, y, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 24;
  page.drawText(params.workshopName, { x: left, y, size: 12, font });
  y -= 16;
  page.drawText(`${params.monthStart} to ${params.monthEnd}`, { x: left, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  y -= 24;

  const income = Number(params.totals.income_cents ?? 0);
  const expense = Number(params.totals.expense_cents ?? 0);
  const profit = Number(params.totals.profit_cents ?? income - expense);

  page.drawText(`Income: ${formatMoney(income)}`, { x: left, y, size: 11, font: bold, color: rgb(0.05, 0.45, 0.1) });
  y -= 14;
  page.drawText(`Expenses: ${formatMoney(expense)}`, { x: left, y, size: 11, font: bold, color: rgb(0.6, 0.1, 0.1) });
  y -= 14;
  page.drawText(`Profit: ${formatMoney(profit)}`, { x: left, y, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 24;

  page.drawText('Date', { x: left, y, size: 9, font: bold });
  page.drawText('Description', { x: left + 90, y, size: 9, font: bold });
  page.drawText('Type', { x: left + 360, y, size: 9, font: bold });
  page.drawText('Amount', { x: width - 120, y, size: 9, font: bold });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 12;

  for (const item of params.lineItems.slice(0, 40)) {
    const amount = Number(item.amount_cents ?? 0);
    const type = item.entry_kind === 'income' ? 'Credit' : 'Debit';
    const description = `${item.description ?? item.category ?? 'Finance entry'}`.slice(0, 48);

    page.drawText(String(item.occurred_on ?? '-'), { x: left, y, size: 9, font });
    page.drawText(description, { x: left + 90, y, size: 9, font });
    page.drawText(type, {
      x: left + 360,
      y,
      size: 9,
      font,
      color: item.entry_kind === 'income' ? rgb(0.05, 0.45, 0.1) : rgb(0.6, 0.1, 0.1)
    });
    page.drawText(formatMoney(amount), { x: width - 120, y, size: 9, font });

    y -= 14;
    if (y < 60) {
      break;
    }
  }

  return pdfDoc.save();
}
