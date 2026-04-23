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
  orderNumber?: string;
  linkedInvoiceRef?: string;
  description: string;
  status?: string;
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

function wrapText(
  value: string,
  maxWidth: number,
  font: { widthOfTextAtSize(text: string, size: number): number },
  fontSize: number
) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['-'];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
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
  page.drawText('Order #', { x: left + 152, y, size: 9, font: bold });
  page.drawText('Linked', { x: left + 206, y, size: 9, font: bold });
  page.drawText('Status', { x: left + 258, y, size: 9, font: bold });
  page.drawText('Description', { x: left + 302, y, size: 9, font: bold });
  page.drawText('Debit', { x: left + 394, y, size: 9, font: bold });
  page.drawText('Credit', { x: left + 452, y, size: 9, font: bold });
  page.drawText('Balance', { x: left + 510, y, size: 9, font: bold });
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

  for (const row of params.rows.slice(0, 38)) {
    totalDebits += row.debitCents;
    totalCredits += row.creditCents;

    const rowFontSize = 7;
    const refLines = wrapText(row.reference, 62, regular, rowFontSize).slice(
      0,
      2
    );
    const linkedLines = wrapText(
      row.linkedInvoiceRef ?? '-',
      48,
      regular,
      rowFontSize
    ).slice(0, 2);
    const orderLines = wrapText(
      row.orderNumber?.trim() ? row.orderNumber : '-',
      50,
      regular,
      rowFontSize
    ).slice(0, 2);
    const descriptionLines = wrapText(
      row.description,
      86,
      regular,
      rowFontSize
    ).slice(0, 3);
    const statusLabel = truncate((row.status ?? '-').replaceAll('_', ' '), 10);
    const lineCount = Math.max(
      refLines.length,
      orderLines.length,
      linkedLines.length,
      descriptionLines.length,
      1
    );
    const rowHeight = 10 + (lineCount - 1) * 8;

    page.drawText(row.date, { x: left, y, size: rowFontSize, font: regular });
    page.drawText(row.typeCode, {
      x: left + 52,
      y,
      size: rowFontSize,
      font: regular
    });
    refLines.forEach((line, index) => {
      page.drawText(index === refLines.length - 1 ? truncate(line, 28) : line, {
        x: left + 86,
        y: y - index * 8,
        size: rowFontSize,
        font: regular
      });
    });
    orderLines.forEach((line, index) => {
      page.drawText(
        index === orderLines.length - 1 ? truncate(line, 18) : line,
        {
          x: left + 152,
          y: y - index * 8,
          size: rowFontSize,
          font: regular
        }
      );
    });
    linkedLines.forEach((line, index) => {
      page.drawText(
        index === linkedLines.length - 1 ? truncate(line, 18) : line,
        {
          x: left + 206,
          y: y - index * 8,
          size: rowFontSize,
          font: regular
        }
      );
    });
    page.drawText(statusLabel, {
      x: left + 258,
      y,
      size: rowFontSize,
      font: regular
    });
    descriptionLines.forEach((line, index) => {
      page.drawText(
        index === descriptionLines.length - 1 ? truncate(line, 70) : line,
        {
          x: left + 302,
          y: y - index * 8,
          size: rowFontSize,
          font: regular
        }
      );
    });
    page.drawText(row.debitCents > 0 ? formatMoney(row.debitCents) : '-', {
      x: left + 394,
      y,
      size: rowFontSize,
      font: regular
    });
    page.drawText(
      row.creditCents > 0 ? `-${formatMoney(row.creditCents)}` : '-',
      {
        x: left + 452,
        y,
        size: rowFontSize,
        font: regular
      }
    );
    page.drawText(
      row.runningBalanceCents < 0
        ? `-${formatMoney(Math.abs(row.runningBalanceCents))}`
        : formatMoney(row.runningBalanceCents),
      { x: left + 510, y, size: rowFontSize, font: regular }
    );

    y -= rowHeight;
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
