'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

type LinkableQuote = {
  id: string;
  quote_number: string | null;
  status: string | null;
  created_at: string | null;
  total_cents: number | null;
};

type QuoteTemplate = {
  id: string;
  quote_number: string | null;
  subject: string | null;
  notes: string | null;
  lineItems: Array<{
    description: string;
    qty: number;
    unit_price_cents: number;
    discount_type: 'none' | 'percent' | 'fixed';
    discount_value: number;
    tax_rate: number;
    category: string | null;
  }>;
};

type ItemRow = {
  description: string;
  qty: string;
  unitPrice: string;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: string;
  taxType: 'none' | 'percent';
  taxRate: string;
  category: string;
};

const EMPTY_ITEM: ItemRow = {
  description: '',
  qty: '',
  unitPrice: '',
  discountType: 'none',
  discountValue: '',
  taxType: 'none',
  taxRate: '',
  category: ''
};

function addDaysIso(dateIso: string, days = 7) {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toCents(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function FinancialDocumentBuilder({
  vehicleId,
  kind,
  linkedQuoteId,
  customerAccountId,
  oneTimeClientDetails,
  onDone
}: {
  vehicleId: string;
  kind: 'quote' | 'invoice';
  linkedQuoteId?: string;
  customerAccountId?: string;
  oneTimeClientDetails?: {
    enabled: boolean;
    customerName: string;
    notificationEmail?: string;
    billingName?: string;
    billingCompany?: string;
    billingEmail?: string;
    billingPhone?: string;
    billingAddress?: string;
    registrationNumber?: string;
    make?: string;
    model?: string;
    vin?: string;
  };
  onDone?: () => void;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [subject, setSubject] = useState(kind === 'quote' ? 'Quote' : 'Invoice');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(addDaysIso(new Date().toISOString().slice(0, 10)));
  const [expiryDate, setExpiryDate] = useState(addDaysIso(new Date().toISOString().slice(0, 10)));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [availableQuotes, setAvailableQuotes] = useState<LinkableQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState(linkedQuoteId ?? '');
  const [prefilledItemIndexes, setPrefilledItemIndexes] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [emailDocument, setEmailDocument] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isReferenceManuallyEdited, setIsReferenceManuallyEdited] = useState(false);
  const [isDueDateManuallyEdited, setIsDueDateManuallyEdited] = useState(false);
  const [isExpiryDateManuallyEdited, setIsExpiryDateManuallyEdited] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setSubject(kind === 'quote' ? 'Quote' : 'Invoice');
    setIssueDate(today);
    setDueDate(addDaysIso(today));
    setExpiryDate(addDaysIso(today));
    setNotes('');
    setItems([{ ...EMPTY_ITEM }]);
    setSelectedQuoteId(linkedQuoteId ?? '');
    setPrefilledItemIndexes(new Set());
    setIsReferenceManuallyEdited(false);
    setIsDueDateManuallyEdited(false);
    setIsExpiryDateManuallyEdited(false);
    setEmailDocument(false);
    setEmailAddress(oneTimeClientDetails?.notificationEmail ?? oneTimeClientDetails?.billingEmail ?? '');
  }, [kind, linkedQuoteId, oneTimeClientDetails]);

  useEffect(() => {
    let active = true;

    async function loadReferenceNumber() {
      try {
        const params = new URLSearchParams({ kind });
        if (kind === 'invoice' && vehicleId && customerAccountId) {
          params.set('vehicleId', vehicleId);
          params.set('customerAccountId', customerAccountId);
        }
        if (kind === 'invoice' && selectedQuoteId) {
          params.set('quoteId', selectedQuoteId);
        }

        const response = await fetch(`/api/workshop/financial-documents?${params.toString()}`);
        if (!response.ok) return;
        const body = (await response.json()) as {
          referenceNumber?: string;
          quotes?: LinkableQuote[];
          quoteTemplate?: QuoteTemplate | null;
        };

        if (active && body.referenceNumber && !isReferenceManuallyEdited) {
          setReferenceNumber(body.referenceNumber);
        }
        if (active) {
          setAvailableQuotes(body.quotes ?? []);
        }

        if (active && kind === 'invoice') {
          const template = body.quoteTemplate;
          if (selectedQuoteId && template?.id === selectedQuoteId) {
            const templateRows: ItemRow[] = template.lineItems.length
              ? template.lineItems.map((line) => ({
                  description: line.description,
                  qty: String(line.qty),
                  unitPrice: (line.unit_price_cents / 100).toFixed(2),
                  discountType: line.discount_type,
                  discountValue: line.discount_type === 'none' ? '' : String(line.discount_value),
                  taxType: line.tax_rate > 0 ? 'percent' : 'none',
                  taxRate: line.tax_rate > 0 ? String(line.tax_rate) : '',
                  category: line.category ?? ''
                }))
              : [{ ...EMPTY_ITEM }];

            setItems(templateRows);
            setPrefilledItemIndexes(new Set(templateRows.map((_, index) => index)));

            if (template.subject?.trim()) setSubject(template.subject.trim());
            if (template.notes?.trim()) setNotes(template.notes.trim());
          } else if (!selectedQuoteId) {
            setPrefilledItemIndexes(new Set());
          }
        }
      } catch {
        // ignore auto-reference failures and let server assign at submit time.
      }
    }

    loadReferenceNumber();
    return () => {
      active = false;
    };
  }, [kind, isReferenceManuallyEdited, vehicleId, customerAccountId, selectedQuoteId]);

  useEffect(() => {
    const plus7 = addDaysIso(issueDate);
    if (kind === 'invoice') {
      if (!isDueDateManuallyEdited) setDueDate(plus7);
    } else {
      if (!isExpiryDateManuallyEdited) setExpiryDate(plus7);
    }
  }, [issueDate, kind, isDueDateManuallyEdited, isExpiryDateManuallyEdited]);

  const canSubmit = useMemo(() => {
    return (
      subject.trim().length > 0 &&
      items.every((item) => {
        const qtyValid = item.qty.trim().length > 0 && Number(item.qty) > 0;
        const unitValid =
          item.unitPrice.trim().length > 0 && Number(item.unitPrice) >= 0;
        const discountValid =
          item.discountType === 'none'
            ? true
            : item.discountValue.trim().length > 0;
        const taxValid =
          item.taxType === 'none' ? true : item.taxRate.trim().length > 0;

        return item.description.trim() && qtyValid && unitValid && discountValid && taxValid;
      })
    );
  }, [items, subject]);

  function updateItemAt(index: number, mutate: (item: ItemRow) => ItemRow) {
    setItems((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? mutate(row) : row
      )
    );
    setPrefilledItemIndexes((current) => {
      if (!current.has(index)) return current;
      const next = new Set(current);
      next.delete(index);
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const lineItems = items.map((item) => ({
      description: item.description.trim(),
      qty: Number(item.qty),
      unitPriceCents: toCents(item.unitPrice) ?? 0,
      discountType: item.discountType,
      discountValue:
        item.discountType === 'none' ? 0 : Number(item.discountValue || '0'),
      taxRate: item.taxType === 'none' ? 0 : Number(item.taxRate || '0'),
      category: item.category.trim() || undefined
    }));

    setIsSubmitting(true);
    try {
      if (!customerAccountId) {
        throw new Error(
          'No customer is linked to this vehicle yet. Please assign a customer first.'
        );
      }

      const response = await fetch('/api/workshop/financial-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId,
          kind,
          customerAccountId,
          issueDate,
          dueDate: kind === 'invoice' ? dueDate || undefined : undefined,
          expiryDate: kind === 'quote' ? expiryDate || undefined : undefined,
          referenceNumber: referenceNumber.trim() || undefined,
          subject: subject.trim(),
          notes: notes.trim() || undefined,
          lineItems,
          quoteId: kind === 'invoice' ? selectedQuoteId || undefined : undefined,
          sendEmailTo: oneTimeClientDetails?.enabled && emailDocument ? emailAddress.trim().toLowerCase() || undefined : undefined,
          oneTimeClient: oneTimeClientDetails?.enabled
            ? {
                customerName: oneTimeClientDetails.customerName,
                notificationEmail: oneTimeClientDetails.notificationEmail,
                billingName: oneTimeClientDetails.billingName,
                billingCompany: oneTimeClientDetails.billingCompany,
                billingEmail: oneTimeClientDetails.billingEmail,
                billingPhone: oneTimeClientDetails.billingPhone,
                billingAddress: oneTimeClientDetails.billingAddress,
                registrationNumber: oneTimeClientDetails.registrationNumber,
                make: oneTimeClientDetails.make,
                model: oneTimeClientDetails.model,
                vin: oneTimeClientDetails.vin
              }
            : undefined
        })
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not create document');
      }

      pushToast({
        title: `${kind === 'quote' ? 'Quote' : 'Invoice'} created`,
        tone: 'success'
      });
      onDone?.();
      router.refresh();
    } catch (error) {
      pushToast({
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 md:grid-cols-2">
        <label>
          Subject
          <p className="mt-1 text-xs text-gray-500">Customer-facing title.</p>
          <input
            className="mt-1 w-full rounded border p-2"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={kind === 'quote' ? 'Quote' : 'Invoice'}
          />
        </label>
        <label>
          Reference number
          <p className="mt-1 text-xs text-gray-500">Auto-generated reference number.</p>
          <input
            className="mt-1 w-full rounded border p-2"
            value={referenceNumber}
            onChange={(event) => {
              setReferenceNumber(event.target.value);
              setIsReferenceManuallyEdited(true);
            }}
            placeholder={kind === 'quote' ? 'QTE-0001' : 'INV-0001'}
          />
        </label>
      </div>

      {kind === 'invoice' ? (
        <label className="block">
          Link to quote (optional)
          <p className="mt-1 text-xs text-gray-500">Associate this invoice with an existing quote for this vehicle.</p>
          <select
            className="mt-1 w-full rounded border p-2"
            value={selectedQuoteId}
            onChange={(event) => setSelectedQuoteId(event.target.value)}
          >
            <option value="">No linked quote</option>
            {availableQuotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {(quote.quote_number ?? quote.id.slice(0, 8)).toString()} · {(quote.status ?? 'sent').replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-2 md:grid-cols-2">
        <label>
          Issue date
          <p className="mt-1 text-xs text-gray-500">Date on the document.</p>
          <input
            type="date"
            className="mt-1 w-full rounded border p-2"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </label>
        {kind === 'invoice' ? (
          <label>
            Due date
            <p className="mt-1 text-xs text-gray-500">Auto-set to 7 days after issue date.</p>
            <input
              type="date"
              className="mt-1 w-full rounded border p-2"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setIsDueDateManuallyEdited(true);
              }}
            />
          </label>
        ) : (
          <label>
            Valid until
            <p className="mt-1 text-xs text-gray-500">Auto-set to 7 days after issue date.</p>
            <input
              type="date"
              className="mt-1 w-full rounded border p-2"
              value={expiryDate}
              onChange={(event) => {
                setExpiryDate(event.target.value);
                setIsExpiryDateManuallyEdited(true);
              }}
            />
          </label>
        )}
      </div>

      <div className="rounded border p-2">
        {kind === 'invoice' && selectedQuoteId && prefilledItemIndexes.size > 0 ? (
          <p className="mb-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            Prefilled from linked quote. Editing a row removes its prefilled highlight.
          </p>
        ) : null}
        <p className="mb-2 text-xs text-gray-600">
          Fill each line item below. Numeric fields are blank by default and must be typed.
        </p>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className={`rounded border p-2 ${prefilledItemIndexes.has(index) ? 'border-emerald-300 bg-emerald-50/40' : ''}`}>
              <div className="grid gap-2 md:grid-cols-6">
                <input
                  className="rounded border p-2 md:col-span-2"
                  placeholder="Description (e.g. Labour - gearbox service)"
                  value={item.description}
                  onChange={(event) => updateItemAt(index, (row) => ({ ...row, description: event.target.value }))}
                />
                <input
                  className="rounded border p-2"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Qty (how many?)"
                  value={item.qty}
                  onChange={(event) => updateItemAt(index, (row) => ({ ...row, qty: event.target.value }))}
                />
                <input
                  className="rounded border p-2"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Unit price"
                  value={item.unitPrice}
                  onChange={(event) => updateItemAt(index, (row) => ({ ...row, unitPrice: event.target.value }))}
                />
                <select
                  className="rounded border p-2"
                  value={item.discountType}
                  onChange={(event) =>
                    updateItemAt(index, (row) => ({
                      ...row,
                      discountType: event.target.value as ItemRow['discountType'],
                      discountValue: event.target.value === 'none' ? '' : row.discountValue
                    }))
                  }
                >
                  <option value="none">No discount</option>
                  <option value="percent">Discount %</option>
                  <option value="fixed">Discount amount</option>
                </select>
                <input
                  className="rounded border p-2"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={
                    item.discountType === 'percent'
                      ? 'Discount %'
                      : item.discountType === 'fixed'
                        ? 'Discount amount'
                        : 'Discount value'
                  }
                  disabled={item.discountType === 'none'}
                  value={item.discountValue}
                  onChange={(event) => updateItemAt(index, (row) => ({ ...row, discountValue: event.target.value }))}
                />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <select
                  className="rounded border p-2"
                  value={item.taxType}
                  onChange={(event) =>
                    updateItemAt(index, (row) => ({
                      ...row,
                      taxType: event.target.value as ItemRow['taxType'],
                      taxRate: event.target.value === 'none' ? '' : row.taxRate
                    }))
                  }
                >
                  <option value="none">No tax</option>
                  <option value="percent">Charge tax %</option>
                </select>
                <input
                  className="rounded border p-2"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Tax % (e.g. 15)"
                  disabled={item.taxType === 'none'}
                  value={item.taxRate}
                  onChange={(event) => updateItemAt(index, (row) => ({ ...row, taxRate: event.target.value }))}
                />
                <input
                  className="rounded border p-2"
                  placeholder="Category (optional)"
                  value={item.category}
                  onChange={(event) => updateItemAt(index, (row) => ({ ...row, category: event.target.value }))}
                />
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-red-700"
                  onClick={() => {
                    setItems((current) => current.filter((_, rowIndex) => rowIndex !== index));
                    setPrefilledItemIndexes(new Set());
                  }}
                  disabled={items.length === 1}
                >
                  Delete line
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="rounded border px-3 py-2"
        onClick={() => {
          setItems((current) => [...current, { ...EMPTY_ITEM }]);
          setPrefilledItemIndexes(new Set());
        }}
      >
        Add line item
      </button>

      <label className="block">
        Notes
        <p className="mt-1 text-xs text-gray-500">Optional message or terms for the customer.</p>
        <textarea
          className="mt-1 w-full rounded border p-2"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes"
        />
      </label>

      {oneTimeClientDetails?.enabled ? (
      <label className="block rounded border border-black/10 p-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={emailDocument}
            onChange={(event) => setEmailDocument(event.target.checked)}
          />
          Email this document after creation
        </span>
        {emailDocument ? (
          <input
            type="email"
            className="mt-2 w-full rounded border p-2"
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            placeholder="customer@email.com"
            required
          />
        ) : null}
      </label>
      ) : null}

      {!customerAccountId ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          This vehicle has no linked customer account. Link a customer to the
          vehicle first before creating invoices/quotes.
        </p>
      ) : null}

      <button
        type="button"
        className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        disabled={!canSubmit || isSubmitting || !customerAccountId || (oneTimeClientDetails?.enabled && emailDocument && !emailAddress.trim())}
        onClick={() => void handleSubmit()}
      >
        {isSubmitting ? 'Saving...' : `Create ${kind}`}
      </button>
    </div>
  );
}
