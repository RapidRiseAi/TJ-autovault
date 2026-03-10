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

  const left = 38;
  const right = 557;
  const width = right - left;
  const border = rgb(0.78, 0.8, 0.84);
  const textMuted = rgb(0.33, 0.36, 0.42);

  page.drawText(params.kind === 'quote' ? 'QUOTE' : 'Invoice', {
    x: left,
    y: 790,
    size: 40,
    font: bold,
    color: params.kind === 'quote' ? brand : rgb(0.1, 0.1, 0.1)
  });

  if (params.logoBytes) {
    try {
      const logo = await pdf.embedPng(params.logoBytes).catch(async () => pdf.embedJpg(params.logoBytes));
      const scaled = logo.scale(0.2);
      page.drawImage(logo, {
        x: right - scaled.width,
        y: 760,
        width: scaled.width,
        height: scaled.height
      });
    } catch {
      // fallback when image cannot be embedded
    }
  }

  const midYTop = 700;
  const centerX = left + width * 0.6;

  page.drawText(clampText(params.customer.name || '-', 50), { x: left, y: midYTop, size: 11, font: regular });
  page.drawText(clampText(params.customer.billingAddress || '-', 64), {
    x: left,
    y: midYTop - 16,
    size: 10,
    font: regular,
    color: textMuted,
    lineHeight: 11,
    maxWidth: 250
  });

  const middleLabelX = left + 260;
  page.drawText(params.kind === 'quote' ? 'Quote date' : 'Invoice date', { x: middleLabelX, y: midYTop, size: 10, font: bold });
  page.drawText(params.issueDate, { x: middleLabelX + 6, y: midYTop - 14, size: 10, font: regular });
  page.drawText(params.kind === 'quote' ? 'Valid date' : 'Due date', { x: middleLabelX, y: midYTop - 34, size: 10, font: bold });
  page.drawText(params.dueOrExpiryDate || '-', { x: middleLabelX + 6, y: midYTop - 48, size: 10, font: regular });
  page.drawText(`${params.kind === 'quote' ? 'Quote' : 'Invoice'} number`, { x: middleLabelX, y: midYTop - 68, size: 10, font: bold });
  page.drawText(params.referenceNumber, { x: middleLabelX + 6, y: midYTop - 82, size: 10, font: regular });

  page.drawLine({
    start: { x: centerX, y: midYTop + 8 },
    end: { x: centerX, y: midYTop - 95 },
    thickness: 1,
    color: rgb(0.52, 0.54, 0.58)
  });

  page.drawText(clampText(params.workshop.name || '-', 38), { x: centerX + 14, y: midYTop, size: 11, font: bold });
  page.drawText(`Co Reg: ${params.workshop.taxNumber || '-'}`, { x: centerX + 14, y: midYTop - 14, size: 9.5, font: regular });
  page.drawText(`Tel: ${params.workshop.contactPhone || '-'}`, { x: centerX + 14, y: midYTop - 27, size: 9.5, font: regular });
  page.drawText(`Email: ${params.workshop.contactEmail || '-'}`, { x: centerX + 14, y: midYTop - 40, size: 9.5, font: regular });
  page.drawText(clampText(params.workshop.billingAddress || '-', 44), {
    x: centerX + 14,
    y: midYTop - 54,
    size: 9.5,
    font: regular,
    maxWidth: 150,
    lineHeight: 10
  });

  const vehicleLabel = [params.vehicle.make, params.vehicle.model, params.vehicle.registrationNumber].filter(Boolean).join(' ');
  page.drawText(clampText(vehicleLabel || params.subject, 76), { x: left, y: 575, size: 10.5, font: bold });

  const tableTop = 555;
  page.drawRectangle({ x: left, y: tableTop - 26, width, height: 26, borderWidth: 1, borderColor: rgb(0, 0, 0) });

  const col = {
    desc: left,
    qty: left + 320,
    unit: left + 380,
    total: left + 440,
    right
  };

  page.drawLine({ start: { x: col.qty, y: tableTop }, end: { x: col.qty, y: tableTop - 26 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: col.unit, y: tableTop }, end: { x: col.unit, y: tableTop - 26 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: col.total, y: tableTop }, end: { x: col.total, y: tableTop - 26 }, thickness: 1, color: rgb(0, 0, 0) });

  page.drawText('Description', { x: left + 8, y: tableTop - 17, size: 10, font: bold });
  page.drawText('Qty', { x: col.qty + 22, y: tableTop - 17, size: 10, font: bold });
  page.drawText('Unit price', { x: col.unit + 10, y: tableTop - 17, size: 10, font: bold });
  page.drawText('Total', { x: col.total + 20, y: tableTop - 17, size: 10, font: bold });

  let y = tableTop - 26;
  for (const item of params.items.slice(0, 10)) {
    const rowHeight = 34;
    page.drawRectangle({ x: left, y: y - rowHeight, width, height: rowHeight, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.drawLine({ start: { x: col.qty, y }, end: { x: col.qty, y: y - rowHeight }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: col.unit, y }, end: { x: col.unit, y: y - rowHeight }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: col.total, y }, end: { x: col.total, y: y - rowHeight }, thickness: 1, color: rgb(0, 0, 0) });

    page.drawText(clampText(item.description, 58), { x: left + 8, y: y - 21, size: 10, font: regular });
    page.drawText(String(item.qty), { x: col.qty + 27, y: y - 21, size: 10, font: regular });

    const unitText = clampText(formatMoney(item.unitPriceCents, params.currencyCode), 14);
    const unitX = col.total - 10 - regular.widthOfTextAtSize(unitText, 10);
    page.drawText(unitText, { x: unitX, y: y - 21, size: 10, font: regular });

    const lineText = clampText(formatMoney(item.lineTotalCents, params.currencyCode), 14);
    const totalX = right - 10 - regular.widthOfTextAtSize(lineText, 10);
    page.drawText(lineText, { x: totalX, y: y - 21, size: 10, font: regular });

    y -= rowHeight;
  }

  const totalsTop = y;
  const totalsX = col.unit;
  const totalsWidth = right - totalsX;
  const rowH = 24;

  const drawTotalsRow = (label: string, value: string, rowIndex: number, emphasize = false) => {
    const rowY = totalsTop - rowH * (rowIndex + 1);
    page.drawRectangle({ x: totalsX, y: rowY, width: totalsWidth, height: rowH, borderWidth: 1, borderColor: border });
    page.drawText(label, { x: totalsX + 10, y: rowY + 8, size: emphasize ? 11 : 10, font: emphasize ? bold : regular });
    const font = emphasize ? bold : regular;
    const size = emphasize ? 11 : 10;
    page.drawText(value, {
      x: right - 10 - font.widthOfTextAtSize(value, size),
      y: rowY + 8,
      size,
      font
    });
  };

  drawTotalsRow('Subtotal', formatMoney(params.totals.subtotalCents, params.currencyCode), 0);
  drawTotalsRow('Discount', formatMoney(params.totals.discountCents, params.currencyCode), 1);
  drawTotalsRow('Tax', formatMoney(params.totals.taxCents, params.currencyCode), 2);
  drawTotalsRow('Total', formatMoney(params.totals.totalCents, params.currencyCode), 3, true);

  const notesY = 180;
  page.drawText('Notes', { x: left, y: notesY, size: 12, font: bold });
  page.drawRectangle({ x: left, y: notesY - 56, width: 300, height: 48, borderWidth: 1, borderColor: border });
  page.drawText(clampText(params.notes?.trim() || '-', 200), { x: left + 8, y: notesY - 25, size: 10, font: regular, color: textMuted });

  page.drawText(`Tax/VAT: ${params.workshop.taxNumber || '-'}`, {
    x: left,
    y: 82,
    size: 10,
    font: regular,
    color: textMuted
  });
  page.drawText(
    `Bank Name: ${params.workshop.bankName || '-'}    ACC NAME: ${params.workshop.name || '-'}    ACC NO: ${params.workshop.bankAccountNumber || '-'}    BRANCH: ${params.workshop.bankBranchCode || '-'}`,
    { x: left, y: 66, size: 9, font: regular, color: textMuted, maxWidth: 360 }
  );

  const balanceDue = params.totals.balanceDueCents ?? params.totals.totalCents;
  if (params.kind === 'invoice' && balanceDue > 0 && isPastDate(params.dueOrExpiryDate)) {
    const badge = 'OVERDUE';
    const badgeWidth = 88;
    const badgeX = left + (width - badgeWidth) / 2;
    page.drawRectangle({ x: badgeX, y: 24, width: badgeWidth, height: 30, borderWidth: 2, borderColor: rgb(0.82, 0.12, 0.12) });
    page.drawText(badge, {
      x: badgeX + (badgeWidth - bold.widthOfTextAtSize(badge, 11)) / 2,
      y: 34,
      size: 11,
      font: bold,
      color: rgb(0.82, 0.12, 0.12)
    });
  }

  return pdf.save();
}
