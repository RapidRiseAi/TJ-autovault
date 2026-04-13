import 'server-only';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type StatementPdfRow = {
  date: string;
  kind:
    | 'quote'
    | 'invoice'
    | 'credit_note'
    | 'debit_note'
    | 'invoice_credit_applied_note';
  typeCode: 'QUO' | 'INV' | 'CN' | 'DN' | 'APP';
  reference: string;
  linkedInvoiceRef?: string;
  description: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(cents / 100);
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(length - 1, 0))}…`;
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
  rows: StatementPdfRow[];
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 805;
  const left = 28;

  page.drawText('Customer Statement', { x: left, y, size: 20, font: bold });
  y -= 24;
  page.drawText(params.workshopName, { x: left, y, size: 11, font: regular });
  y -= 14;
  page.drawText(params.customerName, { x: left, y, size: 11, font: bold });
  y -= 14;
  page.drawText(`${params.from} to ${params.to}`, {
    x: left,
    y,
    size: 10,
    font: regular,
    color: rgb(0.35, 0.35, 0.35)
  });
  y -= 22;

  page.drawText('Date', { x: left, y, size: 9, font: bold });
  page.drawText('Type', { x: left + 52, y, size: 9, font: bold });
  page.drawText('Ref', { x: left + 86, y, size: 9, font: bold });
  page.drawText('Linked', { x: left + 154, y, size: 9, font: bold });
  page.drawText('Description', { x: left + 218, y, size: 9, font: bold });
  page.drawText('Debit', { x: left + 378, y, size: 9, font: bold });
  page.drawText('Credit', { x: left + 440, y, size: 9, font: bold });
  page.drawText('Balance', { x: left + 503, y, size: 9, font: bold });
  y -= 10;
  page.drawLine({
    start: { x: left, y },
    end: { x: 565, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85)
  });
  y -= 12;

  let totalDebits = 0;
  let totalCredits = 0;

  for (const row of params.rows.slice(0, 46)) {
    totalDebits += row.debitCents;
    totalCredits += row.creditCents;

    page.drawText(row.date, { x: left, y, size: 8, font: regular });
    page.drawText(row.typeCode, { x: left + 52, y, size: 8, font: regular });
    page.drawText(truncate(row.reference, 10), {
      x: left + 86,
      y,
      size: 8,
      font: regular
    });
    page.drawText(truncate(row.linkedInvoiceRef ?? '-', 10), {
      x: left + 154,
      y,
      size: 8,
      font: regular
    });
    page.drawText(truncate(row.description, 34), {
      x: left + 218,
      y,
      size: 8,
      font: regular
    });
    page.drawText(row.debitCents > 0 ? formatMoney(row.debitCents) : '-', {
      x: left + 378,
      y,
      size: 8,
      font: regular
    });
    page.drawText(
      row.creditCents > 0 ? `-${formatMoney(row.creditCents)}` : '-',
      {
        x: left + 440,
        y,
        size: 8,
        font: regular
      }
    );
    page.drawText(
      row.runningBalanceCents < 0
        ? `-${formatMoney(Math.abs(row.runningBalanceCents))}`
        : formatMoney(row.runningBalanceCents),
      { x: left + 503, y, size: 8, font: regular }
    );

    y -= 13;
    if (y < 80) break;
  }

  y -= 10;
  page.drawText(`Total debits: ${formatMoney(totalDebits)}`, {
    x: left + 300,
    y,
    size: 10,
    font: bold
  });
  y -= 14;
  page.drawText(`Total credits: -${formatMoney(totalCredits)}`, {
    x: left + 300,
    y,
    size: 10,
    font: bold
  });
  y -= 14;
  page.drawText(`Closing balance: ${formatMoney(totalDebits - totalCredits)}`, {
    x: left + 300,
    y,
    size: 10,
    font: bold
  });

  y -= 26;
  page.drawText('Business banking details', {
    x: left,
    y,
    size: 10,
    font: bold
  });
  y -= 14;
  page.drawText(`Bank: ${params.workshopBank?.bankName || '-'}`, {
    x: left,
    y,
    size: 9,
    font: regular
  });
  y -= 12;
  page.drawText(
    `Account name: ${params.workshopBank?.accountName || params.workshopName}`,
    { x: left, y, size: 9, font: regular }
  );
  y -= 12;
  page.drawText(
    `Account number: ${params.workshopBank?.accountNumber || '-'}`,
    {
      x: left,
      y,
      size: 9,
      font: regular
    }
  );
  y -= 12;
  page.drawText(`Branch code: ${params.workshopBank?.branchCode || '-'}`, {
    x: left,
    y,
    size: 9,
    font: regular
  });

  return pdf.save();
}
