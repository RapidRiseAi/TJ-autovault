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
  const left = 40;
  const right = 555;
  let y = 800;

  page.drawText(params.workshop.name || 'Workshop', { x: left, y, size: 18, font: bold });
  y -= 18;
  page.drawText(params.workshop.contactEmail || '-', { x: left, y, size: 10, font: regular, color: rgb(0.35, 0.35, 0.35) });
  y -= 13;
  page.drawText(params.workshop.contactPhone || '-', { x: left, y, size: 10, font: regular, color: rgb(0.35, 0.35, 0.35) });
  y -= 16;

  page.drawText(params.kind === 'quote' ? 'QUOTE' : 'INVOICE', {
    x: right - 130,
    y: 800,
    size: 20,
    font: bold
  });
  page.drawText(params.referenceNumber, { x: right - 130, y: 782, size: 10, font: regular });
  page.drawText(`Issue: ${params.issueDate}`, { x: right - 130, y: 768, size: 10, font: regular });
  if (params.dueOrExpiryDate) {
    page.drawText(`${params.kind === 'quote' ? 'Valid until' : 'Due'}: ${params.dueOrExpiryDate}`, { x: right - 130, y: 754, size: 10, font: regular });
  }

  y -= 4;
  page.drawText(`Subject: ${params.subject}`, { x: left, y, size: 11, font: bold });
  y -= 18;

  const customerLines = [
    `Customer: ${params.customer.name}`,
    `Address: ${params.customer.billingAddress || '-'}`,
    `Vehicle: ${[params.vehicle.make, params.vehicle.model].filter(Boolean).join(' ') || '-'} ${params.vehicle.registrationNumber ? `(${params.vehicle.registrationNumber})` : ''}`,
    `VIN: ${params.vehicle.vin || '-'}`
  ];

  customerLines.forEach((line) => {
    page.drawText(line, { x: left, y, size: 10, font: regular });
    y -= 13;
  });

  y -= 6;
  page.drawRectangle({ x: left, y: y - 18, width: 515, height: 18, color: rgb(0.94, 0.94, 0.94) });
  page.drawText('Description', { x: left + 6, y: y - 12, size: 9, font: bold });
  page.drawText('Qty', { x: left + 240, y: y - 12, size: 9, font: bold });
  page.drawText('Unit', { x: left + 280, y: y - 12, size: 9, font: bold });
  page.drawText('Discount', { x: left + 345, y: y - 12, size: 9, font: bold });
  page.drawText('Tax', { x: left + 415, y: y - 12, size: 9, font: bold });
  page.drawText('Total', { x: left + 470, y: y - 12, size: 9, font: bold });
  y -= 24;

  for (const item of params.items.slice(0, 20)) {
    page.drawText(item.description.slice(0, 42), { x: left + 6, y, size: 9, font: regular });
    page.drawText(String(item.qty), { x: left + 240, y, size: 9, font: regular });
    page.drawText(formatMoney(item.unitPriceCents, params.currencyCode), { x: left + 280, y, size: 9, font: regular });
    page.drawText(formatMoney(item.discountCents, params.currencyCode), { x: left + 345, y, size: 9, font: regular });
    page.drawText(formatMoney(item.taxCents, params.currencyCode), { x: left + 415, y, size: 9, font: regular });
    page.drawText(formatMoney(item.lineTotalCents, params.currencyCode), { x: left + 470, y, size: 9, font: regular });
    y -= 14;
    if (y < 170) break;
  }

  y -= 8;
  const totalsX = 350;
  page.drawText(`Subtotal: ${formatMoney(params.totals.subtotalCents, params.currencyCode)}`, { x: totalsX, y, size: 10, font: regular });
  y -= 14;
  page.drawText(`Discount: ${formatMoney(params.totals.discountCents, params.currencyCode)}`, { x: totalsX, y, size: 10, font: regular });
  y -= 14;
  page.drawText(`Tax: ${formatMoney(params.totals.taxCents, params.currencyCode)}`, { x: totalsX, y, size: 10, font: regular });
  y -= 14;
  page.drawText(`Total: ${formatMoney(params.totals.totalCents, params.currencyCode)}`, { x: totalsX, y, size: 11, font: bold });

  if (params.kind === 'invoice') {
    y -= 14;
    page.drawText(`Paid: ${formatMoney(params.totals.amountPaidCents ?? 0, params.currencyCode)}`, { x: totalsX, y, size: 10, font: regular });
    y -= 14;
    page.drawText(`Balance Due: ${formatMoney(params.totals.balanceDueCents ?? params.totals.totalCents, params.currencyCode)}`, { x: totalsX, y, size: 11, font: bold });
  }

  y -= 24;
  page.drawText('Notes', { x: left, y, size: 10, font: bold });
  y -= 12;
  page.drawText((params.notes || '-').slice(0, 200), { x: left, y, size: 9, font: regular, maxWidth: 300 });

  const footerY = 50;
  const workshopAddress = params.workshop.billingAddress || '-';
  page.drawText(`Address: ${workshopAddress}`, { x: left, y: footerY + 24, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`Tax no: ${params.workshop.taxNumber || '-'}`, { x: left, y: footerY + 12, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`${params.workshop.bankName || '-'} ${params.workshop.bankAccountNumber || ''} ${params.workshop.bankBranchCode || ''}`.trim(), { x: left, y: footerY, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(params.workshop.footer || 'Thank you for your business.', { x: 300, y: footerY, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4), maxWidth: 250 });

  return pdf.save();
}
