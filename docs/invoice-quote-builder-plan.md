# Invoice + Quote Builder Replacement Plan (Using Existing Inspection Patterns)

## Why this change is needed
Current workflow still relies on **uploading external quote/invoice PDFs**, then inserting a minimal DB record (`amount`, `reference`) in `api/uploads/complete`. That means:
- no structured line items,
- no discount/tax logic,
- no repeatable PDF layout control,
- weak statement/reporting options for admin staff.

The inspection system already proves a better pattern: structured builder UI → server-validated payload → generated signed PDF → document timeline + notifications.

## What exists today (from codebase)

### Reusable pattern from inspections
The inspection flow already has these pieces and should be the blueprint:
1. Builder UI for structured data (`InspectionTemplateBuilder`, `InspectionReportFormRenderer`).
2. API validation and workshop scope checks.
3. PDF generation on server (`pdf-lib`) with workshop + vehicle + customer metadata.
4. Signature support and PDF storage in `vehicle-files` bucket.
5. Timeline/document linkage and notifications to customer.

### Invoice/quote behavior today
Today quotes/invoices are mainly uploaded files with minimal metadata:
- Upload panels call `/api/uploads/sign` + `/api/uploads/complete`.
- `/api/uploads/complete` inserts a quote/invoice with top-level amount/reference but **does not create line items**.
- Job close flow still asks for invoice PDF upload.

### Statements behavior today
Current statement archive is workshop-month financial snapshot (`workshop_monthly_statement_archives`) with a generic monthly statement PDF. It is **not** customer-specific AR statement output.

## Product direction to build

## 1) Build native Quote Builder + Invoice Builder (not template builder)
Use fixed, opinionated forms (not dynamic schema like inspection templates):

### Header section (prefilled constants + editable where needed)
- Workshop details (business name, address, phone, email, tax/VAT number, banking details, logo/signoff).
- Customer details (name/company, billing address, contact info).
- Vehicle/job context (reg, VIN, job card link).
- Document metadata (quote number / invoice number, issue date, due date, currency).

### Line item grid
Each row should support:
- item/service description,
- quantity,
- unit price,
- discount (line fixed amount or %),
- tax code/rate,
- computed line subtotal/tax/total,
- optional category (labour/parts/other) for reporting.

### Summary totals
- subtotal,
- discount total,
- tax total,
- grand total,
- amount paid / balance due (invoice).

### Terms and notes
- payment terms,
- validity period (quote expiry),
- internal note vs customer-facing note,
- sign-off block.

### Lifecycle states
- Quote: draft → sent → approved/declined → converted to invoice.
- Invoice: draft → sent → partial/paid/overdue/cancelled.

## 2) Manage prefilled constants from profile/settings
Add editable company constants in workshop profile/settings so the builder pre-fills automatically:
- legal/business name,
- billing/street/postal address,
- tax number,
- bank details,
- default payment terms,
- default quote validity days,
- default notes/footer,
- logo.

Current `workshop_accounts` already has contact fields (email/phone/website/signoff). Extend this model for invoice/quote identity fields.

## 3) Replace upload-first invoice/quote workflow

### New flow
1. User clicks **Create quote/invoice** (vehicle/job context).
2. Form preloads workshop constants + customer/vehicle defaults.
3. User edits line items, discounts, due dates, notes.
4. Server validates and saves structured rows.
5. System generates PDF automatically.
6. PDF stored in storage bucket and linked in `vehicle_documents`.
7. Notification sent to customer.

### Keep manual upload as fallback (phase 1)
Keep upload path for edge cases initially, but make builder the primary UI.

## 4) Customer statement export (admin lady requirement)

Admin needs to select **customer** and pull statement for a date range.

### Statement filter controls
- customer selector,
- document type filter: invoices / quotes / both,
- date range,
- status filter (paid/unpaid/overdue, approved/pending),
- optional include line-item detail toggle.

### Statement output (PDF + optional CSV)
Recommended layout:
1. Header: workshop identity + customer identity + statement period.
2. Opening balance (optional if prior-period tracking enabled).
3. Chronological table:
   - date,
   - doc type (INV/QUO),
   - number,
   - reference/job/vehicle,
   - debit/credit,
   - running balance.
4. Totals block:
   - invoiced total,
   - paid total,
   - outstanding total,
   - overdue total,
   - quote pipeline total (if included).
5. Footer notes/payment instructions.

For quick reconciliation, CSV export should include one row per document and optional rows per line item.

## 5) Data model changes (high-level)

Existing tables already include `quote_items` / `invoice_items` but upload flow is not using them deeply.

Required enhancements:
- `workshop_accounts` (or `workshop_billing_settings`) for invoice constants.
- `quote_items` and `invoice_items`:
  - discount fields,
  - tax rate/code,
  - sort order,
  - optional category.
- `quotes` / `invoices`:
  - richer summary columns (discount_total, tax_total, subtotal, paid/balance fields),
  - snapshot JSON for workshop/customer details at issue time (preserve historical accuracy if profile changes later),
  - generated PDF storage path fields.

## 6) PDF system approach
Mirror inspection PDF approach:
- server-side `pdf-lib` generator,
- deterministic sections (header, addresses, line table, totals, terms),
- multi-page line item handling,
- signature block if needed,
- generated file path in storage,
- linked `vehicle_documents` record and timeline event.

## 7) Rollout plan

### Phase A: Foundation
- DB migrations for billing settings + richer item fields.
- workshop profile UI to manage invoice constants.

### Phase B: Quote Builder
- Create/edit/send quote.
- Quote PDF generation.
- Customer view/approval remains connected.

### Phase C: Invoice Builder
- Convert quote → invoice.
- Create invoice directly.
- Payment status tracking and balances.
- PDF generation + send.

### Phase D: Statements
- New admin statement page by customer + range + filters.
- PDF + CSV outputs.
- optional archive snapshots.

### Phase E: Decommission old upload-only flow
- Hide legacy upload UI for quote/invoice once confidence is high.

## 8) UX principles from common invoice builders (best practice)
Industry patterns (Xero/QuickBooks/Zoho/Stripe-style) to adopt:
- fast row entry with keyboard-friendly line editor,
- clear auto-calculation and immediate totals feedback,
- document numbering automation with override,
- convert quote to invoice in one click,
- clear status badges + audit trail,
- downloadable PDF and emailed share link,
- statement export by customer and period.

## 9) Can this be built in this codebase?
Yes. This repo already has the key architecture needed:
- server-validated builder APIs,
- Supabase RLS/workshop scoping,
- PDF generation + storage pipeline,
- customer notification/timeline integration,
- existing quote/invoice core tables to extend.

This is a good fit to replace the current upload-based quote/invoice flow with native creation.
