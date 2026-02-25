import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { inspectionGenerateSchema, formatInspectionResult } from '@/lib/inspection-reports';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

type PdfPageLike = {
  drawText: (text: string, options: Record<string, unknown>) => void;
};

type PdfFontLike = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

function drawWrappedText(args: {
  page: PdfPageLike;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  font: PdfFontLike;
  color?: ReturnType<typeof rgb>;
  lineHeight?: number;
}) {
  const { page, text, x, y, maxWidth, size, font, color = rgb(0, 0, 0), lineHeight = size + 2 } = args;
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  let currentY = y;
  for (const entry of lines) {
    page.drawText(entry, { x, y: currentY, size, font, color });
    currentY -= lineHeight;
  }

  return { y: currentY, lines: Math.max(lines.length, 1) };
}

export async function POST(request: NextRequest) {
  const parsed = inspectionGenerateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const admin = createAdminClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .in('role', ['admin', 'technician'])
    .maybeSingle();

  if (!profile?.workshop_account_id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const [{ data: vehicle }, { data: workshop }, { data: template }, { data: customer }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,vin,odometer_km,workshop_account_id,current_customer_account_id')
      .eq('id', payload.vehicleId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase
      .from('workshop_accounts')
      .select('id,name')
      .eq('id', profile.workshop_account_id)
      .maybeSingle(),
    supabase
      .from('inspection_templates')
      .select('id,name,inspection_template_fields(id,sort_order,field_type,label,required,options)')
      .eq('id', payload.templateId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('current_customer_account_id,customer_accounts(name)')
      .eq('id', payload.vehicleId)
      .maybeSingle()
  ]);

  if (!vehicle || !template) {
    return NextResponse.json({ error: 'Vehicle or template not found' }, { status: 404 });
  }

  const fields = (template.inspection_template_fields ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  for (const field of fields) {
    const answer = payload.answers[field.id];
    if (field.required && (answer == null || answer === '')) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 });
    }
  }

  const currentMileage = vehicle.odometer_km ?? 0;
  if (payload.odometerKm < currentMileage) {
    return NextResponse.json(
      { error: `Mileage cannot be less than current mileage (${currentMileage.toLocaleString()} km)` },
      { status: 400 }
    );
  }

  const { data: selectedTechnician } = await supabase
    .from('profiles')
    .select('id,display_name,full_name,signature_text,workshop_account_id')
    .eq('id', payload.technicianProfileId)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (!selectedTechnician) {
    return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
  }

  const { data: report, error: reportError } = await supabase
    .from('inspection_reports')
    .insert({
      workshop_account_id: profile.workshop_account_id,
      vehicle_id: vehicle.id,
      template_id: template.id,
      mode: 'digital',
      technician_profile_id: payload.technicianProfileId,
      notes: payload.notes?.trim() || null,
      answers: payload.answers,
      created_by: user.id
    })
    .select('id')
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: reportError?.message ?? 'Could not create report' }, { status: 400 });
  }

  await supabase.from('vehicles').update({ odometer_km: payload.odometerKm }).eq('id', vehicle.id);

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let cursorY = PAGE_HEIGHT - MARGIN;
  const rightX = PAGE_WIDTH - MARGIN - 180;

  page.drawText(workshop?.name ?? 'Workshop', { x: MARGIN, y: cursorY, size: 20, font: bold });
  cursorY -= 20;
  page.drawText(`Email: ${user.email ?? '-'}`, { x: MARGIN, y: cursorY, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  cursorY -= 14;
  page.drawText('Generated inspection report', { x: MARGIN, y: cursorY, size: 10, font, color: rgb(0.3, 0.3, 0.3) });

  page.drawText('INSPECTION REPORT', { x: rightX, y: PAGE_HEIGHT - MARGIN, size: 16, font: bold });
  page.drawText(new Date().toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }), { x: rightX, y: PAGE_HEIGHT - MARGIN - 18, size: 10, font });

  cursorY -= 20;
  page.drawRectangle({ x: MARGIN, y: cursorY - 65, width: PAGE_WIDTH - MARGIN * 2, height: 65, borderColor: rgb(0.8,0.8,0.8), borderWidth: 1 });
  page.drawText(`Reg: ${vehicle.registration_number ?? '-'}`, { x: MARGIN + 10, y: cursorY - 18, size: 10, font: bold });
  page.drawText(`Make/Model: ${[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '-'}`, { x: MARGIN + 10, y: cursorY - 34, size: 10, font });
  page.drawText(`VIN: ${vehicle.vin ?? '-'}`, { x: MARGIN + 10, y: cursorY - 50, size: 10, font });
  page.drawText(`Mileage: ${payload.odometerKm} km`, { x: MARGIN + 280, y: cursorY - 18, size: 10, font });
  const customerName = (customer?.customer_accounts as { name?: string } | null)?.name ?? '-';
  page.drawText(`Customer: ${customerName}`, { x: MARGIN + 280, y: cursorY - 34, size: 10, font });

  cursorY -= 88;

  const drawTableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: cursorY - 20, width: PAGE_WIDTH - MARGIN * 2, height: 20, color: rgb(0.94,0.94,0.94) });
    page.drawText('Item', { x: MARGIN + 8, y: cursorY - 14, size: 10, font: bold });
    page.drawText('Result', { x: MARGIN + 285, y: cursorY - 14, size: 10, font: bold });
    page.drawText('Notes', { x: MARGIN + 420, y: cursorY - 14, size: 10, font: bold });
    cursorY -= 22;
  };

  drawTableHeader();

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const value = formatInspectionResult(field.field_type, payload.answers[field.id]);
    const lineCount = Math.max(
      Math.ceil(bold.widthOfTextAtSize(field.label, 9) / 260),
      Math.ceil(font.widthOfTextAtSize(value || '-', 9) / 120),
      1
    );
    const rowHeight = Math.max(22, lineCount * 12 + 8);

    if (cursorY - rowHeight < MARGIN + 110) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }

    if (index % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: cursorY - rowHeight, width: PAGE_WIDTH - MARGIN * 2, height: rowHeight, color: rgb(0.985,0.985,0.985) });
    }

    drawWrappedText({ page, text: field.label, x: MARGIN + 8, y: cursorY - 14, maxWidth: 260, size: 9, font });
    drawWrappedText({ page, text: value || '-', x: MARGIN + 285, y: cursorY - 14, maxWidth: 120, size: 9, font });
    page.drawText('', { x: MARGIN + 420, y: cursorY - 14, size: 9, font });

    cursorY -= rowHeight;
  }

  cursorY -= 16;
  page.drawText('Inspector notes', { x: MARGIN, y: cursorY, size: 12, font: bold });
  cursorY -= 14;
  const wrappedNotes = drawWrappedText({
    page,
    text: payload.notes?.trim() || 'None',
    x: MARGIN,
    y: cursorY,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    size: 10,
    font,
    lineHeight: 13
  });
  cursorY = wrappedNotes.y - 20;

  const signatureLabel = selectedTechnician.signature_text?.trim()
    ? selectedTechnician.signature_text.trim()
    : '____________________';
  const saDate = new Date().toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg'
  });
  page.drawText(`Technician signature: ${signatureLabel}`, { x: MARGIN, y: cursorY, size: 11, font });
  page.drawText(`Date: ${saDate}`, { x: MARGIN + 330, y: cursorY, size: 11, font });

  page.drawText('Generated by TJ Autovault', {
    x: PAGE_WIDTH / 2 - 60,
    y: 20,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.45)
  });

  const pdfBytes = await pdfDoc.save();
  const pdfPath = `workshop/${profile.workshop_account_id}/vehicles/${vehicle.id}/inspection_reports/${report.id}.pdf`;

  const { error: uploadError } = await admin.storage
    .from('vehicle-files')
    .upload(pdfPath, Buffer.from(pdfBytes), {
      upsert: true,
      contentType: 'application/pdf'
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  await supabase
    .from('inspection_reports')
    .update({ pdf_storage_path: pdfPath })
    .eq('id', report.id);

  const displayName = `Inspection Report (${new Date().toISOString().slice(0, 10)})`;

  const { data: document, error: documentError } = await supabase
    .from('vehicle_documents')
    .insert({
      workshop_account_id: profile.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: vehicle.id,
      document_type: 'inspection',
      doc_type: 'inspection',
      storage_bucket: 'vehicle-files',
      storage_path: pdfPath,
      original_name: `${displayName}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: pdfBytes.length,
      subject: displayName,
      // Customer visibility is enforced by access rules/RLS; there is no visible_to_customer column.
      importance: 'info'
    })
    .select('id')
    .single();

  if (documentError || !document) {
    return NextResponse.json({ error: documentError?.message ?? 'Could not create document' }, { status: 400 });
  }

  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: profile.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    event_type: 'inspection_report_added',
    title: displayName,
    description: 'Inspection report added',
    importance: 'info',
    metadata: {
      report_id: report.id,
      mode: 'digital',
      display_name: displayName,
      doc_id: document.id
    }
  });

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    documentId: document.id,
    display_name: displayName
  });
}
