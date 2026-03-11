import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';

export const financialLineItemSchema = z.object({
  description: z.string().trim().min(1),
  qty: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  discountType: z.enum(['none', 'percent', 'fixed']).default('none'),
  discountValue: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).default(0),
  category: z.string().trim().max(40).optional()
});

export const financialDocumentPayloadSchema = z.object({
  vehicleId: z.string().uuid(),
  kind: z.enum(['quote', 'invoice']),
  customerAccountId: z.string().uuid().optional(),
  issueDate: z.string(),
  dueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  referenceNumber: z.string().trim().min(1).max(60).optional(),
  subject: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(3000).optional(),
  currencyCode: z.string().trim().default('ZAR'),
  lineItems: z.array(financialLineItemSchema).min(1)
});

export type FinancialLineItemInput = z.infer<typeof financialLineItemSchema>;

export type FinancialLineComputed = FinancialLineItemInput & {
  lineSubtotalCents: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  lineTotalCents: number;
};

export function formatMoney(cents: number, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency
  }).format(cents / 100);
}

function toCentsFromCurrency(value: number) {
  return Math.max(0, Math.round(value * 100));
}

export function computeFinancialLineItems(items: FinancialLineItemInput[]) {
  const computed: FinancialLineComputed[] = items.map((item) => {
    const lineSubtotalCents = Math.round(item.qty * item.unitPriceCents);
    const discountCents =
      item.discountType === 'percent'
        ? Math.round(lineSubtotalCents * (item.discountValue / 100))
        : item.discountType === 'fixed'
          ? toCentsFromCurrency(item.discountValue)
          : 0;
    const boundedDiscountCents = Math.min(Math.max(discountCents, 0), lineSubtotalCents);
    const taxableCents = Math.max(lineSubtotalCents - boundedDiscountCents, 0);
    const taxCents = Math.round(taxableCents * (item.taxRate / 100));
    const lineTotalCents = taxableCents + taxCents;

    return {
      ...item,
      lineSubtotalCents,
      discountCents: boundedDiscountCents,
      taxableCents,
      taxCents,
      lineTotalCents
    };
  });

  const subtotalCents = computed.reduce((sum, row) => sum + row.lineSubtotalCents, 0);
  const discountCents = computed.reduce((sum, row) => sum + row.discountCents, 0);
  const taxCents = computed.reduce((sum, row) => sum + row.taxCents, 0);
  const totalCents = computed.reduce((sum, row) => sum + row.lineTotalCents, 0);

  return {
    computed,
    totals: {
      subtotalCents,
      discountCents,
      taxCents,
      totalCents
    }
  };
}

function clampText(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function toRgbHex(hex?: string) {
  if (!hex) return rgb(0.08, 0.2, 0.43);
  const match = hex.trim().match(/^#?([a-f\d]{6})$/i);
  if (!match) return rgb(0.08, 0.2, 0.43);
  const parsed = match[1];
  const r = parseInt(parsed.slice(0, 2), 16) / 255;
  const g = parseInt(parsed.slice(2, 4), 16) / 255;
  const b = parseInt(parsed.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function isPastDate(value?: string | null) {
  if (!value) return false;
  const comparedDate = new Date(value);
  if (Number.isNaN(comparedDate.valueOf())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  comparedDate.setHours(0, 0, 0, 0);
  return comparedDate.getTime() < now.getTime();
}

export async function buildFinancialDocumentPdf(params: {
  kind: 'quote' | 'invoice';
  brandColor?: string;
  logoBytes?: Uint8Array;
  workshop: {
    name: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    billingAddress?: string | null;
    taxNumber?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankBranchCode?: string | null;
    footer?: string | null;
  };
  customer: { name: string; billingAddress?: string | null };
  vehicle: {
    registrationNumber?: string | null;
    make?: string | null;
    model?: string | null;
    vin?: string | null;
  };
  subject: string;
  referenceNumber: string;
  issueDate: string;
  dueOrExpiryDate?: string | null;
  notes?: string | null;
  currencyCode?: string;
  items: FinancialLineComputed[];
  totals: {
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    totalCents: number;
    amountPaidCents?: number;
    balanceDueCents?: number;
  };
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = toRgbHex(params.brandColor);

  const left = 36;
  const right = 559;
  const thin = 0.9;

  const money = (cents: number) => {
    const value = (Math.max(0, cents) / 100).toFixed(2).replace('.', ',');
    return `${params.currencyCode === 'ZAR' || !params.currencyCode ? 'R' : params.currencyCode} ${value}`;
  };

  page.drawText(params.kind === 'quote' ? 'QUOTE' : 'Invoice', {
    x: left,
    y: 782,
    size: 40,
    font: bold,
    color: params.kind === 'quote' ? brand : rgb(0.1, 0.1, 0.1)
  });

  if (params.logoBytes) {
    try {
      const logo = await pdf.embedPng(params.logoBytes).catch(async () => pdf.embedJpg(params.logoBytes));
      const scale = Math.min(0.35, 92 / logo.width);
      const scaled = logo.scale(scale);
      page.drawImage(logo, {
        x: right - scaled.width - 14,
        y: 722,
        width: scaled.width,
        height: scaled.height
      });
    } catch {
      // ignore invalid logo bytes
    }
  }

  const blockTop = 670;
  const middleX = 270;
  const rightStart = 392;

  page.drawText(clampText(params.customer.name || '-', 40), { x: left, y: blockTop, size: 10.5, font: regular });
  const customerLines = clampText(params.customer.billingAddress || '-', 120).split(/\n|,/).slice(0, 4);
  for (const [i, line] of customerLines.entries()) {
    page.drawText(line.trim() || '-', {
      x: left,
      y: blockTop - 14 - i * 12,
      size: 9.5,
      font: regular
    });
  }
  page.drawText(`Vat: ${params.workshop.taxNumber || '-'}`, { x: left, y: blockTop - 62, size: 9.5, font: regular });

  page.drawText(params.kind === 'quote' ? 'Quote date' : 'Invoice date', {
    x: middleX,
    y: blockTop,
    size: 9.5,
    font: bold
  });
  page.drawText(params.issueDate, { x: middleX + 4, y: blockTop - 14, size: 9.5, font: regular });

  page.drawText(params.kind === 'quote' ? 'Valid date' : 'Due date', {
    x: middleX,
    y: blockTop - 30,
    size: 9.5,
    font: bold
  });
  page.drawText(params.dueOrExpiryDate || '-', { x: middleX + 4, y: blockTop - 44, size: 9.5, font: regular });

  page.drawText(params.kind === 'quote' ? 'Quote number' : 'Invoice number', {
    x: middleX,
    y: blockTop - 60,
    size: 9.5,
    font: bold
  });
  page.drawText(params.referenceNumber, { x: middleX + 4, y: blockTop - 74, size: 9.5, font: regular });

  page.drawLine({
    start: { x: 372, y: blockTop + 8 },
    end: { x: 372, y: blockTop - 86 },
    thickness: thin,
    color: rgb(0.2, 0.2, 0.2)
  });

  page.drawText(clampText(params.workshop.name || '-', 33), { x: rightStart, y: blockTop, size: 10.5, font: bold });
  page.drawText(`Co Reg: ${params.workshop.taxNumber || '-'}`, { x: rightStart, y: blockTop - 14, size: 9.5, font: regular });
  page.drawText(`Tel: ${params.workshop.contactPhone || '-'}`, { x: rightStart, y: blockTop - 27, size: 9.5, font: regular });
  page.drawText(`Email: ${params.workshop.contactEmail || '-'}`, { x: rightStart, y: blockTop - 40, size: 9.5, font: regular });

  const workshopAddressLines = clampText(params.workshop.billingAddress || '-', 80).split(/\n|,/).slice(0, 3);
  for (const [i, line] of workshopAddressLines.entries()) {
    page.drawText(line.trim() || '-', { x: rightStart, y: blockTop - 53 - i * 11, size: 9.5, font: regular });
  }

  const subjectLine = [params.vehicle.make, params.vehicle.model, params.vehicle.registrationNumber].filter(Boolean).join(' ');
  page.drawText(clampText(subjectLine || params.subject || '-', 80), { x: left, y: 550, size: 11, font: bold });

  const tableLeft = left;
  const tableRight = right - 24;
  const tableWidth = tableRight - tableLeft;
  const tableTop = 530;
  const showDiscount = params.items.some((item) => item.discountCents > 0);

  const rowItems = params.items.slice(0, 6);
  const qtyTexts = rowItems.map((item) => String(item.qty));
  const unitTexts = rowItems.map((item) => money(item.unitPriceCents));
  const totalTexts = rowItems.map((item) => money(item.lineTotalCents));
  const discountTexts = rowItems.map((item) => money(item.discountCents));

  const maxTextWidth = (texts: string[], size = 10, font = regular) =>
    texts.reduce((max, text) => Math.max(max, font.widthOfTextAtSize(text, size)), 0);

  const qtyWidth = Math.max(62, maxTextWidth(['Qty', ...qtyTexts], 10, bold) + 22);
  const unitWidth = Math.max(86, maxTextWidth(['Unit price', ...unitTexts], 10, bold) + 24);
  const discountWidth = showDiscount
    ? Math.max(88, maxTextWidth(['Discount', ...discountTexts], 10, bold) + 24)
    : 0;
  const totalWidth = Math.max(96, maxTextWidth(['Total', ...totalTexts], 10, bold) + 24);
  const reservedRight = qtyWidth + unitWidth + discountWidth + totalWidth;
  const descriptionWidth = Math.max(170, tableWidth - reservedRight);

  const cols = {
    descLeft: tableLeft,
    descRight: tableLeft + descriptionWidth,
    qtyRight: tableLeft + descriptionWidth + qtyWidth,
    unitRight: tableLeft + descriptionWidth + qtyWidth + unitWidth,
    discountRight: tableLeft + descriptionWidth + qtyWidth + unitWidth + discountWidth,
    totalRight: tableRight
  };

  page.drawRectangle({ x: tableLeft, y: tableTop - 28, width: tableWidth, height: 28, borderWidth: thin, borderColor: rgb(0, 0, 0) });
  page.drawLine({ start: { x: cols.descRight, y: tableTop }, end: { x: cols.descRight, y: tableTop - 28 }, thickness: thin, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: cols.qtyRight, y: tableTop }, end: { x: cols.qtyRight, y: tableTop - 28 }, thickness: thin, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: cols.unitRight, y: tableTop }, end: { x: cols.unitRight, y: tableTop - 28 }, thickness: thin, color: rgb(0, 0, 0) });
  if (showDiscount) {
    page.drawLine({ start: { x: cols.discountRight, y: tableTop }, end: { x: cols.discountRight, y: tableTop - 28 }, thickness: thin, color: rgb(0, 0, 0) });
  }

  page.drawText('Description', { x: cols.descLeft + 10, y: tableTop - 18, size: 10, font: bold });
  page.drawText('Qty', { x: cols.descRight + 10, y: tableTop - 18, size: 10, font: bold });
  page.drawText('Unit price', { x: cols.qtyRight + 8, y: tableTop - 18, size: 10, font: bold });
  if (showDiscount) {
    page.drawText('Discount', { x: cols.unitRight + 8, y: tableTop - 18, size: 10, font: bold });
  }
  page.drawText('Total', {
    x: (showDiscount ? cols.discountRight : cols.unitRight) + 8,
    y: tableTop - 18,
    size: 10,
    font: bold
  });

  let rowTop = tableTop - 28;
  for (const item of rowItems) {
    const rowHeight = 34;
    const rowBottom = rowTop - rowHeight;
    page.drawRectangle({ x: tableLeft, y: rowBottom, width: tableWidth, height: rowHeight, borderWidth: thin, borderColor: rgb(0, 0, 0) });
    page.drawLine({ start: { x: cols.descRight, y: rowTop }, end: { x: cols.descRight, y: rowBottom }, thickness: thin, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: cols.qtyRight, y: rowTop }, end: { x: cols.qtyRight, y: rowBottom }, thickness: thin, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: cols.unitRight, y: rowTop }, end: { x: cols.unitRight, y: rowBottom }, thickness: thin, color: rgb(0, 0, 0) });
    if (showDiscount) {
      page.drawLine({ start: { x: cols.discountRight, y: rowTop }, end: { x: cols.discountRight, y: rowBottom }, thickness: thin, color: rgb(0, 0, 0) });
    }

    page.drawText(clampText(item.description, 58), { x: cols.descLeft + 10, y: rowTop - 21, size: 10, font: regular });

    const qtyText = String(item.qty);
    page.drawText(qtyText, {
      x: cols.qtyRight - 10 - regular.widthOfTextAtSize(qtyText, 10),
      y: rowTop - 21,
      size: 10,
      font: regular
    });

    const unitValue = money(item.unitPriceCents);
    page.drawText(unitValue, {
      x: cols.unitRight - 10 - regular.widthOfTextAtSize(unitValue, 10),
      y: rowTop - 21,
      size: 10,
      font: regular
    });

    const totalValue = money(item.lineTotalCents);
    page.drawText(totalValue, {
      x: cols.totalRight - 10 - regular.widthOfTextAtSize(totalValue, 10),
      y: rowTop - 21,
      size: 10,
      font: regular
    });

    if (showDiscount) {
      const discountValue = money(item.discountCents);
      page.drawText(discountValue, {
        x: cols.discountRight - 10 - regular.widthOfTextAtSize(discountValue, 10),
        y: rowTop - 21,
        size: 10,
        font: regular
      });
    }

    rowTop = rowBottom;
  }

  const summaryWidth = 220;
  const summaryLeft = tableRight - summaryWidth;
  const summaryRowHeight = 22;
  const summaryTop = rowTop - 8;

  const summaryRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Subtotal', value: money(params.totals.subtotalCents) },
    ...(showDiscount ? [{ label: 'Discount', value: money(params.totals.discountCents) }] : []),
    { label: 'Tax', value: money(params.totals.taxCents) },
    { label: 'Total', value: money(params.totals.totalCents), bold: true }
  ];

  summaryRows.forEach((row, index) => {
    const y = summaryTop - summaryRowHeight * (index + 1);
    page.drawRectangle({ x: summaryLeft, y, width: summaryWidth, height: summaryRowHeight, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: summaryLeft, y, width: summaryWidth, height: summaryRowHeight, borderWidth: thin, borderColor: rgb(0, 0, 0) });
    const font = row.bold ? bold : regular;
    const size = row.bold ? 10.5 : 10;
    page.drawText(row.label, { x: summaryLeft + 12, y: y + 7, size, font });
    page.drawText(row.value, {
      x: summaryLeft + summaryWidth - 10 - font.widthOfTextAtSize(row.value, size),
      y: y + 7,
      size,
      font
    });
  });

  const summaryBottom = summaryTop - summaryRowHeight * summaryRows.length;
  const bankY = summaryBottom - 34;
  page.drawText(`BANK NAME: ${params.workshop.bankName || '-'}`, { x: left, y: bankY, size: 10, font: regular });
  page.drawText(`ACC NAME: ${params.workshop.name || '-'}`, { x: left, y: bankY - 15, size: 10, font: regular });
  page.drawText(`ACC NO: ${params.workshop.bankAccountNumber || '-'}`, { x: left, y: bankY - 30, size: 10, font: regular });
  page.drawText(`BRANCH: ${params.workshop.bankBranchCode || '-'}`, { x: left, y: bankY - 45, size: 10, font: regular });

  const balanceDue = params.totals.balanceDueCents ?? params.totals.totalCents;
  if (params.kind === 'invoice' && balanceDue > 0 && isPastDate(params.dueOrExpiryDate)) {
    const badge = 'OVERDUE';
    const badgeWidth = 102;
    const badgeHeight = 34;
    const badgeX = left + (tableWidth - badgeWidth) / 2;
    page.drawRectangle({
      x: badgeX,
      y: 66,
      width: badgeWidth,
      height: badgeHeight,
      borderWidth: 2,
      borderColor: rgb(0.82, 0.1, 0.1)
    });
    page.drawText(badge, {
      x: badgeX + (badgeWidth - regular.widthOfTextAtSize(badge, 11)) / 2,
      y: 78,
      size: 11,
      font: regular,
      color: rgb(0.82, 0.1, 0.1)
    });
  }

  return pdf.save();
}
