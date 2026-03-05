import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { dispatchNotificationEmailsNow } from '@/lib/email/dispatch-now';
import {
  buildFinancialDocumentPdf,
  computeFinancialLineItems,
  financialDocumentPayloadSchema
} from '@/lib/workshop/financial-documents';

function isMissingColumnError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  return /column .* does not exist/i.test(message);
}

export async function POST(request: NextRequest) {
  try {
    const payloadParsed = financialDocumentPayloadSchema.safeParse(
      await request.json()
    );
    if (!payloadParsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const payload = payloadParsed.data;
    const supabase = await createClient();
    const admin = createAdminClient();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role,workshop_account_id')
      .eq('id', user.id)
      .in('role', ['admin', 'technician'])
      .maybeSingle();

    if (!profile?.workshop_account_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: vehicle } = await supabase
      .from('vehicles')
      .select(
        'id,registration_number,make,model,vin,current_customer_account_id,workshop_account_id'
      )
      .eq('id', payload.vehicleId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle();

    let workshop:
      | {
          id: string;
          name: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          billing_address?: string | null;
          tax_number?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_branch_code?: string | null;
          invoice_footer?: string | null;
        }
      | null = null;

    const enhancedWorkshop = await supabase
      .from('workshop_accounts')
      .select(
        'id,name,contact_email,contact_phone,billing_address,tax_number,bank_name,bank_account_number,bank_branch_code,invoice_footer'
      )
      .eq('id', profile.workshop_account_id)
      .maybeSingle();

    if (enhancedWorkshop.error && isMissingColumnError(enhancedWorkshop.error)) {
      const fallbackWorkshop = await supabase
        .from('workshop_accounts')
        .select('id,name,contact_email,contact_phone')
        .eq('id', profile.workshop_account_id)
        .maybeSingle();

      if (fallbackWorkshop.error) {
        return NextResponse.json(
          { error: fallbackWorkshop.error.message },
          { status: 400 }
        );
      }

      workshop = fallbackWorkshop.data
        ? {
            ...fallbackWorkshop.data,
            billing_address: null,
            tax_number: null,
            bank_name: null,
            bank_account_number: null,
            bank_branch_code: null,
            invoice_footer: null
          }
        : null;
    } else if (enhancedWorkshop.error) {
      return NextResponse.json({ error: enhancedWorkshop.error.message }, { status: 400 });
    } else {
      workshop = enhancedWorkshop.data;
    }

    const resolvedCustomerId =
      payload.customerAccountId ?? vehicle?.current_customer_account_id ?? null;

    let customer:
      | { id: string; name: string; linked_email?: string | null; billing_address?: string | null }
      | null = null;

    if (resolvedCustomerId) {
      const enhancedCustomer = await supabase
        .from('customer_accounts')
        .select('id,name,linked_email,billing_address')
        .eq('id', resolvedCustomerId)
        .eq('workshop_account_id', profile.workshop_account_id)
        .maybeSingle();

      if (enhancedCustomer.error && isMissingColumnError(enhancedCustomer.error)) {
        const fallbackCustomer = await supabase
          .from('customer_accounts')
          .select('id,name')
          .eq('id', resolvedCustomerId)
          .eq('workshop_account_id', profile.workshop_account_id)
          .maybeSingle();

        if (fallbackCustomer.error) {
          return NextResponse.json(
            { error: fallbackCustomer.error.message },
            { status: 400 }
          );
        }

        customer = fallbackCustomer.data
          ? { ...fallbackCustomer.data, billing_address: null }
          : null;
      } else if (enhancedCustomer.error) {
        return NextResponse.json({ error: enhancedCustomer.error.message }, { status: 400 });
      } else {
        customer = enhancedCustomer.data;
      }
    }

    if (!vehicle || !customer || !workshop) {
      return NextResponse.json(
        { error: 'Vehicle, customer, or workshop not found' },
        { status: 404 }
      );
    }

    const { computed, totals } = computeFinancialLineItems(payload.lineItems);

    const dueDate = payload.kind === 'invoice' ? payload.dueDate || null : null;
    const expiryDate = payload.kind === 'quote' ? payload.expiryDate || null : null;

    const workshopSnapshot = {
      name: workshop.name,
      contact_email: workshop.contact_email,
      contact_phone: workshop.contact_phone,
      billing_address: workshop.billing_address,
      tax_number: workshop.tax_number,
      bank_name: workshop.bank_name,
      bank_account_number: workshop.bank_account_number,
      bank_branch_code: workshop.bank_branch_code,
      invoice_footer: workshop.invoice_footer
    };

    const customerSnapshot = {
      id: customer.id,
      name: customer.name,
      billing_address: customer.billing_address
    };

    let linkedId: string;

    if (payload.kind === 'quote') {
      const enhancedQuote = await supabase
        .from('quotes')
        .insert({
          workshop_account_id: profile.workshop_account_id,
          customer_account_id: customer.id,
          vehicle_id: vehicle.id,
          status: 'sent',
          quote_number: payload.referenceNumber,
          issue_date: payload.issueDate,
          expiry_date: expiryDate,
          notes: payload.notes || null,
          subject: payload.subject,
          currency_code: payload.currencyCode,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          discount_cents: totals.discountCents,
          total_cents: totals.totalCents,
          workshop_snapshot: workshopSnapshot,
          customer_snapshot: customerSnapshot
        })
        .select('id')
        .single();

      const quote =
        enhancedQuote.error && isMissingColumnError(enhancedQuote.error)
          ? await supabase
              .from('quotes')
              .insert({
                workshop_account_id: profile.workshop_account_id,
                customer_account_id: customer.id,
                vehicle_id: vehicle.id,
                status: 'sent',
                quote_number: payload.referenceNumber,
                notes: payload.notes || null,
                total_cents: totals.totalCents,
                subtotal_cents: totals.subtotalCents,
                tax_cents: totals.taxCents
              })
              .select('id')
              .single()
          : enhancedQuote;

      if (quote.error || !quote.data) {
        return NextResponse.json(
          { error: quote.error?.message ?? 'Could not create quote' },
          { status: 400 }
        );
      }

      const enhancedQuoteItems = await supabase.from('quote_items').insert(
        computed.map((item, index) => ({
          quote_id: quote.data.id,
          sort_order: index,
          description: item.description,
          qty: item.qty,
          unit_price_cents: item.unitPriceCents,
          line_total_cents: item.lineTotalCents,
          discount_type: item.discountType,
          discount_value: item.discountValue,
          discount_cents: item.discountCents,
          tax_rate: item.taxRate,
          tax_cents: item.taxCents,
          category: item.category || null
        }))
      );

      const quoteItemsError =
        enhancedQuoteItems.error && isMissingColumnError(enhancedQuoteItems.error)
          ? (
              await supabase.from('quote_items').insert(
                computed.map((item) => ({
                  quote_id: quote.data.id,
                  description: item.description,
                  qty: item.qty,
                  unit_price_cents: item.unitPriceCents,
                  line_total_cents: item.lineTotalCents
                }))
              )
            ).error
          : enhancedQuoteItems.error;

      if (quoteItemsError) {
        return NextResponse.json({ error: quoteItemsError.message }, { status: 400 });
      }

      linkedId = quote.data.id;
    } else {
      const enhancedInvoice = await supabase
        .from('invoices')
        .insert({
          workshop_account_id: profile.workshop_account_id,
          customer_account_id: customer.id,
          vehicle_id: vehicle.id,
          status: 'sent',
          payment_status: 'unpaid',
          invoice_number: payload.referenceNumber,
          issue_date: payload.issueDate,
          due_date: dueDate,
          notes: payload.notes || null,
          subject: payload.subject,
          currency_code: payload.currencyCode,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          discount_cents: totals.discountCents,
          total_cents: totals.totalCents,
          amount_paid_cents: 0,
          balance_due_cents: totals.totalCents,
          workshop_snapshot: workshopSnapshot,
          customer_snapshot: customerSnapshot
        })
        .select('id')
        .single();

      const invoice =
        enhancedInvoice.error && isMissingColumnError(enhancedInvoice.error)
          ? await supabase
              .from('invoices')
              .insert({
                workshop_account_id: profile.workshop_account_id,
                customer_account_id: customer.id,
                vehicle_id: vehicle.id,
                status: 'sent',
                payment_status: 'unpaid',
                invoice_number: payload.referenceNumber,
                due_date: dueDate,
                notes: payload.notes || null,
                total_cents: totals.totalCents
              })
              .select('id')
              .single()
          : enhancedInvoice;

      if (invoice.error || !invoice.data) {
        return NextResponse.json(
          { error: invoice.error?.message ?? 'Could not create invoice' },
          { status: 400 }
        );
      }

      const enhancedInvoiceItems = await supabase.from('invoice_items').insert(
        computed.map((item, index) => ({
          invoice_id: invoice.data.id,
          sort_order: index,
          description: item.description,
          qty: item.qty,
          unit_price_cents: item.unitPriceCents,
          line_total_cents: item.lineTotalCents,
          discount_type: item.discountType,
          discount_value: item.discountValue,
          discount_cents: item.discountCents,
          tax_rate: item.taxRate,
          tax_cents: item.taxCents,
          category: item.category || null
        }))
      );

      const invoiceItemsError =
        enhancedInvoiceItems.error && isMissingColumnError(enhancedInvoiceItems.error)
          ? (
              await supabase.from('invoice_items').insert(
                computed.map((item) => ({
                  invoice_id: invoice.data.id,
                  description: item.description,
                  qty: item.qty,
                  unit_price_cents: item.unitPriceCents,
                  line_total_cents: item.lineTotalCents
                }))
              )
            ).error
          : enhancedInvoiceItems.error;

      if (invoiceItemsError) {
        return NextResponse.json(
          { error: invoiceItemsError.message },
          { status: 400 }
        );
      }

      linkedId = invoice.data.id;
    }

    const pdfBytes = await buildFinancialDocumentPdf({
      kind: payload.kind,
      workshop: {
        name: workshop.name,
        contactEmail: workshop.contact_email,
        contactPhone: workshop.contact_phone,
        billingAddress: workshop.billing_address,
        taxNumber: workshop.tax_number,
        bankName: workshop.bank_name,
        bankAccountNumber: workshop.bank_account_number,
        bankBranchCode: workshop.bank_branch_code,
        footer: workshop.invoice_footer
      },
      customer: {
        name: customer.name,
        billingAddress: customer.billing_address
      },
      vehicle: {
        registrationNumber: vehicle.registration_number,
        make: vehicle.make,
        model: vehicle.model,
        vin: vehicle.vin
      },
      subject: payload.subject,
      referenceNumber: payload.referenceNumber,
      issueDate: payload.issueDate,
      dueOrExpiryDate: payload.kind === 'quote' ? expiryDate : dueDate,
      notes: payload.notes,
      currencyCode: payload.currencyCode,
      items: computed,
      totals: {
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        amountPaidCents: 0,
        balanceDueCents: totals.totalCents
      }
    });

    const pdfPath = `workshop/${profile.workshop_account_id}/vehicles/${vehicle.id}/${payload.kind}s/${linkedId}.pdf`;
    const { error: storageError } = await admin.storage
      .from('vehicle-files')
      .upload(pdfPath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: true
      });

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 400 });
    }

    const { data: doc, error: docError } = await supabase
      .from('vehicle_documents')
      .insert({
        workshop_account_id: profile.workshop_account_id,
        customer_account_id: customer.id,
        vehicle_id: vehicle.id,
        document_type: payload.kind,
        doc_type: payload.kind,
        storage_bucket: 'vehicle-files',
        storage_path: pdfPath,
        original_name: `${payload.referenceNumber}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: pdfBytes.length,
        subject: payload.subject,
        importance: 'info'
      })
      .select('id')
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: docError?.message ?? 'Could not save document record' },
        { status: 400 }
      );
    }

    if (payload.kind === 'quote') {
      const quoteUpdate = await supabase
        .from('quotes')
        .update({ document_id: doc.id, pdf_storage_path: pdfPath })
        .eq('id', linkedId);

      if (quoteUpdate.error && isMissingColumnError(quoteUpdate.error)) {
        await supabase.from('quotes').update({ document_id: doc.id }).eq('id', linkedId);
      }

      await supabase
        .from('vehicle_documents')
        .update({ quote_id: linkedId })
        .eq('id', doc.id);
    } else {
      const invoiceUpdate = await supabase
        .from('invoices')
        .update({ document_id: doc.id, pdf_storage_path: pdfPath })
        .eq('id', linkedId);

      if (invoiceUpdate.error && isMissingColumnError(invoiceUpdate.error)) {
        await supabase
          .from('invoices')
          .update({ document_id: doc.id })
          .eq('id', linkedId);
      }

      await supabase
        .from('vehicle_documents')
        .update({ invoice_id: linkedId })
        .eq('id', doc.id);
    }

    await supabase.from('vehicle_timeline_events').insert({
      workshop_account_id: profile.workshop_account_id,
      customer_account_id: customer.id,
      vehicle_id: vehicle.id,
      actor_profile_id: profile.id,
      actor_role: profile.role,
      event_type: payload.kind === 'quote' ? 'quote_created' : 'invoice_created',
      title: `${payload.kind === 'quote' ? 'Quote' : 'Invoice'} ${payload.referenceNumber}`,
      description: payload.subject,
      importance: 'info',
      metadata: {
        linked_id: linkedId,
        document_id: doc.id,
        reference_number: payload.referenceNumber,
        ...(payload.kind === 'invoice'
          ? { invoice_id: linkedId }
          : { quote_id: linkedId })
      }
    });

    const { data: customerNotification } = await supabase
      .from('notifications')
      .insert({
        workshop_account_id: profile.workshop_account_id,
        to_customer_account_id: customer.id,
        kind: payload.kind,
        title: payload.subject,
        body:
          payload.kind === 'quote'
            ? `A new quote (${payload.referenceNumber}) is available.`
            : `A new invoice (${payload.referenceNumber}) is available.`,
        href: `/customer/vehicles/${vehicle.id}`,
        data: {
          vehicle_id: vehicle.id,
          linked_entity_id: linkedId,
          document_id: doc.id,
          document_type: payload.kind
        }
      })
      .select('id')
      .maybeSingle();

    if (customerNotification?.id) {
      await dispatchNotificationEmailsNow([customerNotification.id]);
    }

    if (customer.linked_email?.trim()) {
      await sendEmail(
        customer.linked_email.trim().toLowerCase(),
        payload.kind === 'quote'
          ? `Quote ${payload.referenceNumber}`
          : `Invoice ${payload.referenceNumber}`,
        `<p>Hello ${customer.name},</p><p>Your ${payload.kind} <strong>${payload.referenceNumber}</strong> is ready.</p><p>You can also view it in your AutoVault portal.</p>`,
        {
          attachments: [
            {
              filename: `${payload.referenceNumber}.pdf`,
              content: Buffer.from(pdfBytes)
            }
          ]
        }
      );
    }

    return NextResponse.json({ ok: true, id: linkedId, documentId: doc.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not create financial document'
      },
      { status: 500 }
    );
  }
}
