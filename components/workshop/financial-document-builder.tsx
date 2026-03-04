'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

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
  onDone
}: {
  vehicleId: string;
  kind: 'quote' | 'invoice';
  linkedQuoteId?: string;
  customerAccountId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [subject, setSubject] = useState(kind === 'quote' ? 'Quote' : 'Invoice');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ ...EMPTY_ITEM }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      referenceNumber.trim().length > 0 &&
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
  }, [items, referenceNumber, subject]);

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
          referenceNumber: referenceNumber.trim(),
          subject: subject.trim(),
          notes: notes.trim() || undefined,
          lineItems,
          quoteId: linkedQuoteId
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
          <p className="mt-1 text-xs text-gray-500">Unique number (e.g. INV-001).</p>
          <input
            className="mt-1 w-full rounded border p-2"
            value={referenceNumber}
            onChange={(event) => setReferenceNumber(event.target.value)}
            placeholder={kind === 'quote' ? 'Q-001' : 'INV-001'}
          />
        </label>
      </div>

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
            <p className="mt-1 text-xs text-gray-500">When payment is due.</p>
            <input
              type="date"
              className="mt-1 w-full rounded border p-2"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        ) : (
          <label>
            Valid until
            <p className="mt-1 text-xs text-gray-500">Quote expiry date.</p>
            <input
              type="date"
              className="mt-1 w-full rounded border p-2"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </label>
        )}
      </div>

      <div className="rounded border p-2">
        <p className="mb-2 text-xs text-gray-600">
          Fill each line item below. Numeric fields are blank by default and must be typed.
        </p>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="rounded border p-2">
              <div className="grid gap-2 md:grid-cols-6">
                <input
                  className="rounded border p-2 md:col-span-2"
                  placeholder="Description (e.g. Labour - gearbox service)"
                  value={item.description}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, description: event.target.value }
                          : row
                      )
                    )
                  }
                />
                <input
                  className="rounded border p-2"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Qty (how many?)"
                  value={item.qty}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, qty: event.target.value } : row
                      )
                    )
                  }
                />
                <input
                  className="rounded border p-2"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Unit price"
                  value={item.unitPrice}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, unitPrice: event.target.value }
                          : row
                      )
                    )
                  }
                />
                <select
                  className="rounded border p-2"
                  value={item.discountType}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              discountType: event.target.value as ItemRow['discountType'],
                              discountValue:
                                event.target.value === 'none' ? '' : row.discountValue
                            }
                          : row
                      )
                    )
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
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, discountValue: event.target.value }
                          : row
                      )
                    )
                  }
                />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <select
                  className="rounded border p-2"
                  value={item.taxType}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              taxType: event.target.value as ItemRow['taxType'],
                              taxRate: event.target.value === 'none' ? '' : row.taxRate
                            }
                          : row
                      )
                    )
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
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, taxRate: event.target.value } : row
                      )
                    )
                  }
                />
                <input
                  className="rounded border p-2"
                  placeholder="Category (optional)"
                  value={item.category}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, category: event.target.value } : row
                      )
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-red-700"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index)
                    )
                  }
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
        onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}
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

      {!customerAccountId ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          This vehicle has no linked customer account. Link a customer to the
          vehicle first before creating invoices/quotes.
        </p>
      ) : null}

      <button
        type="button"
        className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        disabled={!canSubmit || isSubmitting || !customerAccountId}
        onClick={() => void handleSubmit()}
      >
        {isSubmitting ? 'Saving...' : `Create ${kind}`}
      </button>
    </div>
  );
}
