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
  referenceNumber: z.string().trim().min(1).max(60),
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

export async function buildFinancialDocumentPdf(params: {
  kind: 'quote' | 'invoice';
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
  vehicle: { registrationNumber?: string | null; make?: string | null; model?: string | null; vin?: string | null };
  subject: string;
  referenceNumber: string;
  issueDate: string;
  dueOrExpiryDate?: string | null;
  notes?: string | null;
  currencyCode?: string;
  items: FinancialLineComputed[];
  totals: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; amountPaidCents?: number; balanceDueCents?: number };
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const left = 42;
  const right = pageWidth - 42;

  const drawRight = (text: string, y: number, size = 10, font = regular) => {
    page.drawText(text, {
      x: right - font.widthOfTextAtSize(text, size),
      y,
      size,
      font
    });
  };

  const drawLabelValue = (label: string, value: string, x: number, y: number, width = 240) => {
    page.drawText(label, { x, y, size: 8, font: bold, color: rgb(0.45, 0.45, 0.45) });
    page.drawText(clampText(value, 90), { x, y: y - 12, size: 10, font: regular, maxWidth: width });
  };

  let y = 800;

  page.drawText(params.workshop.name || 'Workshop', { x: left, y, size: 20, font: bold, color: rgb(0.05, 0.05, 0.05) });
  page.drawText(params.kind === 'quote' ? 'QUOTE' : 'INVOICE', {
    x: right - bold.widthOfTextAtSize(params.kind === 'quote' ? 'QUOTE' : 'INVOICE', 28),
    y: y - 2,
    size: 28,
    font: bold,
    color: rgb(0.05, 0.05, 0.05)
  });

  y -= 22;
  page.drawText(clampText(params.workshop.contactEmail || '-', 70), {
    x: left,
    y,
    size: 10,
    font: regular,
    color: rgb(0.35, 0.35, 0.35)
  });
  y -= 14;
  page.drawText(clampText(params.workshop.contactPhone || '-', 40), {
    x: left,
    y,
    size: 10,
    font: regular,
    color: rgb(0.35, 0.35, 0.35)
  });

  drawRight(params.referenceNumber, 776, 11, bold);
  drawRight(`Issue date: ${params.issueDate}`, 760, 10);
  if (params.dueOrExpiryDate) {
    drawRight(
      `${params.kind === 'quote' ? 'Valid until' : 'Due date'}: ${params.dueOrExpiryDate}`,
      746,
      10
    );
  }

  y -= 22;
  page.drawRectangle({ x: left, y: y - 154, width: right - left, height: 154, borderWidth: 1, borderColor: rgb(0.82, 0.82, 0.82) });

  drawLabelValue('SUBJECT', params.subject, left + 12, y - 16, 500);
  drawLabelValue('CUSTOMER', params.customer.name || '-', left + 12, y - 50);
  drawLabelValue('CUSTOMER ADDRESS', params.customer.billingAddress || '-', left + 270, y - 50);

  const vehicleLabel = [params.vehicle.make, params.vehicle.model].filter(Boolean).join(' ') || '-';
  drawLabelValue('VEHICLE', `${vehicleLabel}${params.vehicle.registrationNumber ? ` (${params.vehicle.registrationNumber})` : ''}`, left + 12, y - 92);
  drawLabelValue('VIN', params.vehicle.vin || '-', left + 270, y - 92);

  drawLabelValue('BILLING ADDRESS', params.workshop.billingAddress || '-', left + 12, y - 134, 500);

  y -= 178;

  const tableX = left;
  const tableWidth = right - left;
  const tableRight = tableX + tableWidth;

  const grid = {
    descriptionLeft: tableX + 10,
    descriptionRight: tableX + 180,
    qtyLeft: tableX + 188,
    qtyRight: tableX + 228,
    unitLeft: tableX + 236,
    unitRight: tableX + 308,
    discountLeft: tableX + 316,
    discountRight: tableX + 388,
    taxLeft: tableX + 396,
    taxRight: tableX + 448,
    totalLeft: tableX + 456,
    totalRight: tableRight - 10
  };

  const drawLeftInColumn = (text: string, leftX: number, yPos: number, size = 9, font = regular) => {
    page.drawText(text, {
      x: leftX,
      y: yPos,
      size,
      font
    });
  };

  const drawColumnDivider = (x: number, top: number, bottom: number) => {
    page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      thickness: 0.5,
      color: rgb(0.86, 0.86, 0.88)
    });
  };

  page.drawRectangle({ x: tableX, y: y - 24, width: tableWidth, height: 24, color: rgb(0.94, 0.94, 0.95) });
  page.drawRectangle({ x: tableX, y: y - 24, width: tableWidth, height: 24, borderWidth: 1, borderColor: rgb(0.8, 0.8, 0.82) });

  drawColumnDivider(grid.descriptionRight, y, y - 24);
  drawColumnDivider(grid.qtyRight, y, y - 24);
  drawColumnDivider(grid.unitRight, y, y - 24);
  drawColumnDivider(grid.discountRight, y, y - 24);
  drawColumnDivider(grid.taxRight, y, y - 24);

  page.drawText('Description', { x: grid.descriptionLeft, y: y - 16, size: 9, font: bold });
  drawLeftInColumn('Qty', grid.qtyLeft, y - 16, 9, bold);
  drawLeftInColumn('Unit', grid.unitLeft, y - 16, 9, bold);
  drawLeftInColumn('Discount', grid.discountLeft, y - 16, 9, bold);
  drawLeftInColumn('Tax', grid.taxLeft, y - 16, 9, bold);
  drawLeftInColumn('Total', grid.totalLeft, y - 16, 9, bold);

  y -= 24;

  const rowHeight = 20;
  for (const [index, item] of params.items.slice(0, 18).entries()) {
    const rowY = y - rowHeight;
    if (index % 2 === 0) {
      page.drawRectangle({ x: tableX, y: rowY, width: tableWidth, height: rowHeight, color: rgb(0.985, 0.985, 0.99) });
    }
    page.drawRectangle({ x: tableX, y: rowY, width: tableWidth, height: rowHeight, borderWidth: 0.5, borderColor: rgb(0.86, 0.86, 0.88) });

    drawColumnDivider(grid.descriptionRight, rowY + rowHeight, rowY);
    drawColumnDivider(grid.qtyRight, rowY + rowHeight, rowY);
    drawColumnDivider(grid.unitRight, rowY + rowHeight, rowY);
    drawColumnDivider(grid.discountRight, rowY + rowHeight, rowY);
    drawColumnDivider(grid.taxRight, rowY + rowHeight, rowY);

    page.drawText(clampText(item.description, 24), { x: grid.descriptionLeft, y: rowY + 7, size: 9, font: regular });
    drawLeftInColumn(String(item.qty), grid.qtyLeft, rowY + 7, 8.8);
    drawLeftInColumn(clampText(formatMoney(item.unitPriceCents, params.currencyCode), 12), grid.unitLeft, rowY + 7, 8.8);
    drawLeftInColumn(clampText(formatMoney(item.discountCents, params.currencyCode), 12), grid.discountLeft, rowY + 7, 8.8);
    drawLeftInColumn(clampText(formatMoney(item.taxCents, params.currencyCode), 10), grid.taxLeft, rowY + 7, 8.8);
    drawLeftInColumn(clampText(formatMoney(item.lineTotalCents, params.currencyCode), 14), grid.totalLeft, rowY + 7, 8.8);

    y -= rowHeight;
    if (y < 250) break;
  }

  const totalsBoxX = right - 250;
  const totalsBoxY = y - 96;
  page.drawRectangle({ x: totalsBoxX, y: totalsBoxY, width: 250, height: 96, borderWidth: 1, borderColor: rgb(0.8, 0.8, 0.82) });

  const drawTotalLine = (label: string, value: string, yy: number, emphasize = false) => {
    page.drawText(label, {
      x: totalsBoxX + 10,
      y: yy,
      size: emphasize ? 11 : 10,
      font: emphasize ? bold : regular
    });
    const font = emphasize ? bold : regular;
    const size = emphasize ? 11 : 10;
    page.drawText(value, {
      x: totalsBoxX + 240 - font.widthOfTextAtSize(value, size),
      y: yy,
      size,
      font
    });
  };

  drawTotalLine('Subtotal', formatMoney(params.totals.subtotalCents, params.currencyCode), totalsBoxY + 72);
  drawTotalLine('Discount', formatMoney(params.totals.discountCents, params.currencyCode), totalsBoxY + 56);
  drawTotalLine('Tax', formatMoney(params.totals.taxCents, params.currencyCode), totalsBoxY + 40);
  drawTotalLine('Total', formatMoney(params.totals.totalCents, params.currencyCode), totalsBoxY + 20, true);

  if (params.kind === 'invoice') {
    const statusY = totalsBoxY - 46;
    page.drawRectangle({ x: totalsBoxX, y: statusY, width: 250, height: 40, borderWidth: 1, borderColor: rgb(0.8, 0.8, 0.82) });
    drawTotalLine('Paid', formatMoney(params.totals.amountPaidCents ?? 0, params.currencyCode), statusY + 24);
    drawTotalLine(
      'Balance due',
      formatMoney(params.totals.balanceDueCents ?? params.totals.totalCents, params.currencyCode),
      statusY + 8,
      true
    );
  }

  const notesY = 168;
  page.drawText('Notes', { x: left, y: notesY, size: 10, font: bold });
  page.drawRectangle({ x: left, y: notesY - 56, width: 300, height: 48, borderWidth: 1, borderColor: rgb(0.85, 0.85, 0.87) });
  page.drawText(clampText(params.notes?.trim() || '-', 320), {
    x: left + 8,
    y: notesY - 24,
    size: 9,
    font: regular,
    maxWidth: 285,
    lineHeight: 12,
    color: rgb(0.2, 0.2, 0.2)
  });

  const footerTop = 78;
  page.drawLine({ start: { x: left, y: footerTop }, end: { x: right, y: footerTop }, color: rgb(0.82, 0.82, 0.84), thickness: 1 });

  page.drawText(`Tax/VAT: ${params.workshop.taxNumber || '-'}`, { x: left, y: footerTop - 16, size: 8.5, font: regular, color: rgb(0.35, 0.35, 0.35) });
  page.drawText(
    `Bank: ${params.workshop.bankName || '-'}  |  Account: ${params.workshop.bankAccountNumber || '-'}  |  Branch: ${params.workshop.bankBranchCode || '-'}`,
    { x: left, y: footerTop - 30, size: 8.5, font: regular, color: rgb(0.35, 0.35, 0.35), maxWidth: 360 }
  );

  page.drawText(clampText(params.workshop.footer?.trim() || 'Thank you for your business.', 200), {
    x: right - 190,
    y: footerTop - 30,
    size: 8.5,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
    maxWidth: 190
  });

  return pdf.save();
}
