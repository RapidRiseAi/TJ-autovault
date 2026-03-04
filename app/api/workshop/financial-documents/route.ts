import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildFinancialDocumentPdf,
  computeFinancialLineItems,
  financialDocumentPayloadSchema
} from '@/lib/workshop/financial-documents';

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
      .select('id,role,workshop_account_id,display_name')
      .eq('id', user.id)
      .in('role', ['admin', 'technician'])
      .maybeSingle();

    if (!profile?.workshop_account_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const [{ data: workshop }, { data: vehicle }] =
      await Promise.all([
        supabase
          .from('workshop_accounts')
          .select(
            'id,name,contact_email,contact_phone,billing_address,tax_number,bank_name,bank_account_number,bank_branch_code,invoice_footer,invoice_payment_terms_days,quote_validity_days'
          )
          .eq('id', profile.workshop_account_id)
          .maybeSingle(),
        supabase
          .from('vehicles')
          .select(
            'id,registration_number,make,model,vin,current_customer_account_id,workshop_account_id'
          )
          .eq('id', payload.vehicleId)
          .eq('workshop_account_id', profile.workshop_account_id)
          .maybeSingle()
      ]);

    const { data: customer } = vehicle?.current_customer_account_id
      ? await supabase
          .from('customer_accounts')
          .select('id,name,billing_address')
          .eq('id', vehicle.current_customer_account_id)
          .eq('workshop_account_id', profile.workshop_account_id)
          .maybeSingle()
      : { data: null };

    if (!vehicle || !customer || !workshop) {
      return NextResponse.json(
        { error: 'Vehicle, customer, or workshop not found' },
        { status: 404 }
      );
    }

    const { computed, totals } = computeFinancialLineItems(payload.lineItems);

    const dueDate = payload.kind === 'invoice'
      ? payload.dueDate || null
      : null;
    const expiryDate = payload.kind === 'quote'
      ? payload.expiryDate || null
      : null;

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
    let documentType: 'quote' | 'invoice' = payload.kind;

    if (payload.kind === 'quote') {
      const { data: quote, error: quoteError } = await supabase
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

      if (quoteError || !quote) {
        return NextResponse.json(
          { error: quoteError?.message ?? 'Could not create quote' },
          { status: 400 }
        );
      }

      const quoteItems = computed.map((item, index) => ({
        quote_id: quote.id,
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
      }));

      const { error: quoteItemsError } = await supabase
        .from('quote_items')
        .insert(quoteItems);

      if (quoteItemsError) {
        return NextResponse.json(
          { error: quoteItemsError.message },
          { status: 400 }
        );
      }

      linkedId = quote.id;
    } else {
      const { data: invoice, error: invoiceError } = await supabase
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

      if (invoiceError || !invoice) {
        return NextResponse.json(
          { error: invoiceError?.message ?? 'Could not create invoice' },
          { status: 400 }
        );
      }

      const invoiceItems = computed.map((item, index) => ({
        invoice_id: invoice.id,
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
      }));

      const { error: invoiceItemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems);

      if (invoiceItemsError) {
        return NextResponse.json(
          { error: invoiceItemsError.message },
          { status: 400 }
        );
      }

      linkedId = invoice.id;
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
      await supabase
        .from('quotes')
        .update({ document_id: doc.id, pdf_storage_path: pdfPath })
        .eq('id', linkedId);

      await supabase
        .from('vehicle_documents')
        .update({ quote_id: linkedId })
        .eq('id', doc.id);
    } else {
      await supabase
        .from('invoices')
        .update({ document_id: doc.id, pdf_storage_path: pdfPath })
        .eq('id', linkedId);

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
        reference_number: payload.referenceNumber
      }
    });

    await supabase.from('notifications').insert({
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
    });

    return NextResponse.json({ ok: true, id: linkedId, documentId: doc.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not create financial document'
      },
      { status: 500 }
    );
  }
}
