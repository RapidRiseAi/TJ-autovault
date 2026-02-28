'use client';

import { useMemo, useState } from 'react';

type FaqItem = {
  question: string;
  answer: string;
  tags: string[];
};

const FAQS: FaqItem[] = [
  {
    question: 'How do I reset my password?',
    answer:
      'On the login page, use your workshop support contact if password reset is not yet enabled for your account. They can guide you through regaining access.',
    tags: ['login', 'password', 'account']
  },
  {
    question: 'Where can I view quotes and invoices?',
    answer:
      'After signing in, open your customer dashboard and check the invoices or vehicle pages to review pending quotes, invoices, and documents.',
    tags: ['quotes', 'invoices', 'billing']
  },
  {
    question: 'How do I approve or decline a quote?',
    answer:
      'Open the quote from your dashboard or vehicle timeline, then choose approve or decline. The workshop receives your decision immediately.',
    tags: ['quotes', 'approve']
  },
  {
    question: 'I cannot see my vehicle. What should I do?',
    answer:
      'Your workshop controls vehicle visibility. If a vehicle is missing, contact the workshop so they can link your account to the correct customer profile.',
    tags: ['vehicle', 'account', 'visibility']
  },
  {
    question: 'How can I upload documents or photos?',
    answer:
      'Open the vehicle page and use the upload actions section. Supported uploads depend on the workflow configured by your workshop.',
    tags: ['uploads', 'documents', 'photos']
  }
];

export function HelpFaq() {
  const [filter, setFilter] = useState('');

  const filteredFaqs = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) return FAQS;

    return FAQS.filter((item) => {
      const searchable =
        `${item.question} ${item.answer} ${item.tags.join(' ')}`.toLowerCase();
      return searchable.includes(normalizedFilter);
    });
  }, [filter]);

  return (
    <section className="space-y-4">
      <label
        className="block text-sm font-medium text-gray-700"
        htmlFor="faq-filter"
      >
        Search FAQ
      </label>
      <input
        id="faq-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Try: invoice, login, quote..."
        className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm"
      />

      <div className="space-y-3">
        {filteredFaqs.length ? (
          filteredFaqs.map((item) => (
            <details
              key={item.question}
              className="rounded-2xl border border-black/10 bg-white p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                {item.question}
              </summary>
              <p className="mt-2 text-sm text-gray-700">{item.answer}</p>
            </details>
          ))
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No matching FAQ found. Please contact your workshop directly for
            support.
          </p>
        )}
      </div>
    </section>
  );
}
