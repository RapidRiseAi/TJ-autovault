import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import { createHash } from 'node:crypto';
import fontkit from '@pdf-lib/fontkit';
import { createClient } from '@/lib/supabase/server';
import {
  inspectionGenerateSchema,
  formatInspectionResult
} from '@/lib/inspection-reports';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;

const CHECKBOX_SYMBOLS = ['☑', '☒', '☐'] as const;

async function probeFontSupportsCheckboxGlyphs(bytes: Uint8Array) {
  const probeDoc = await PDFDocument.create();
  probeDoc.registerFontkit(fontkit);
  const probeFont = await probeDoc.embedFont(bytes, { subset: false });

  for (const symbol of CHECKBOX_SYMBOLS) {
    probeFont.encodeText(symbol);
  }
}

function checksum(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12);
}

type PdfPageLike = {
  drawText: (text: string, options: Record<string, unknown>) => void;
};

type PdfFontLike = {
  widthOfTextAtSize: (text: string, size: number) => number;
  encodeText?: (text: string) => unknown;
};

function toPdfSafeText(font: PdfFontLike, text: string) {
  if (!text) return '';
  if (!font.encodeText) return text;

  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  let safeText = '';

  for (const char of normalized) {
    try {
      font.encodeText(char);
      safeText += char;
    } catch {
      safeText += '?';
    }
  }

  return safeText;
}

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
  const {
    page,
    text,
    x,
    y,
    maxWidth,
    size,
    font,
    color = rgb(0, 0, 0),
    lineHeight = size + 2
  } = args;
  const safeText = toPdfSafeText(font, text || '');
  const words = safeText.split(/\s+/).filter(Boolean);
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

function widthOfSafeTextAtSize(font: PdfFontLike, text: string, size: number) {
  return font.widthOfTextAtSize(toPdfSafeText(font, text), size);
}

function drawSafeText(args: {
  page: PdfPageLike;
  font: PdfFontLike;
  text: string;
  options: Record<string, unknown>;
}) {
  const { page, font, text, options } = args;
  page.drawText(toPdfSafeText(font, text), options);
}

async function readFontFromCandidates(label: string, relativePaths: string[]) {
  const attempted: string[] = [];
  const rejected: string[] = [];
  const cwd = process.cwd();

  for (const relativePath of relativePaths) {
    const locations = [relativePath];

    if (!relativePath.includes('/') && !relativePath.includes('\\')) {
      locations.push(path.join('assets', 'fonts', relativePath));
    }

    for (const location of locations) {
      const fontPath = path.isAbsolute(location)
        ? location
        : path.resolve(cwd, location);
      attempted.push(fontPath);
      try {
        const bytes = await readFile(fontPath);
        await probeFontSupportsCheckboxGlyphs(bytes);
        return {
          bytes,
          sourcePath: fontPath,
          checksum: checksum(bytes)
        };
      } catch (error) {
        rejected.push(
          `${fontPath} (${error instanceof Error ? error.message : 'unknown error'})`
        );
      }
    }
  }

  throw new Error(
    `Could not load ${label} PDF font with checkbox glyph support. Attempted: ${attempted.join(', ')}. Rejected: ${rejected.join(', ')}.`
  );
}

export async function POST(request: NextRequest) {
  try {
    const parsed = inspectionGenerateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const payload = parsed.data;
    const supabase = await createClient();
    const admin = createAdminClient();
    const user = (await supabase.auth.getUser()).data.user;

    if (!user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role,workshop_account_id')
      .eq('id', user.id)
      .in('role', ['admin', 'technician'])
      .maybeSingle();

    if (!profile?.workshop_account_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const [
      { data: vehicle },
      { data: workshop },
      { data: template },
      { data: customer }
    ] = await Promise.all([
      supabase
        .from('vehicles')
        .select(
          'id,registration_number,make,model,vin,odometer_km,workshop_account_id,current_customer_account_id'
        )
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
        .select(
          'id,name,inspection_template_fields(id,sort_order,field_type,label,required,options)'
        )
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
      return NextResponse.json(
        { error: 'Vehicle or template not found' },
        { status: 404 }
      );
    }

    const fields = (template.inspection_template_fields ?? []).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    const cleanedFieldNotes = Object.entries(payload.fieldNotes ?? {}).reduce<
      Record<string, string>
    >((acc, [fieldId, note]) => {
      const cleaned = note.trim();
      if (cleaned) acc[fieldId] = cleaned;
      return acc;
    }, {});

    for (const field of fields) {
      if (field.field_type === 'section_break') continue;
      const answer = payload.answers[field.id];
      if (field.required && (answer == null || answer === '')) {
        return NextResponse.json(
          { error: `${field.label} is required` },
          { status: 400 }
        );
      }
    }

    const currentMileage = vehicle.odometer_km ?? 0;
    if (payload.odometerKm < currentMileage) {
      return NextResponse.json(
        {
          error: `Mileage cannot be less than current mileage (${currentMileage.toLocaleString()} km)`
        },
        { status: 400 }
      );
    }

    const { data: selectedTechnician } = await supabase
      .from('profiles')
      .select('id,display_name,full_name,signature_image_path,workshop_account_id')
      .eq('id', payload.technicianProfileId)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle();

    if (!selectedTechnician) {
      return NextResponse.json(
        { error: 'Technician not found' },
        { status: 404 }
      );
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
        field_notes: Object.keys(cleanedFieldNotes).length
          ? cleanedFieldNotes
          : null,
        created_by: user.id
      })
      .select('id')
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: reportError?.message ?? 'Could not create report' },
        { status: 400 }
      );
    }

    await supabase
      .from('vehicles')
      .update({ odometer_km: payload.odometerKm })
      .eq('id', vehicle.id);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const [regularFont, boldFont] = await Promise.all([
      readFontFromCandidates('regular', [
        'assets/fonts/DejaVuSans.ttf',
        'DejaVuSans.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/local/share/fonts/DejaVuSans.ttf',
        'assets/fonts/NotoSans-Regular.ttf',
        'NotoSans-Regular.ttf',
        'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf'
      ]),
      readFontFromCandidates('bold', [
        'assets/fonts/DejaVuSans-Bold.ttf',
        'DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/local/share/fonts/DejaVuSans-Bold.ttf',
        'assets/fonts/NotoSans-Bold.ttf',
        'NotoSans-Bold.ttf',
        'node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf'
      ])
    ]);

    console.info('[inspection-pdf] Runtime font sources', {
      regular: regularFont.sourcePath,
      regularChecksum: regularFont.checksum,
      bold: boldFont.sourcePath,
      boldChecksum: boldFont.checksum
    });

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const font = await pdfDoc.embedFont(regularFont.bytes, { subset: true });
    const bold = await pdfDoc.embedFont(boldFont.bytes, { subset: true });

    let cursorY = PAGE_HEIGHT - MARGIN;
    const rightX = PAGE_WIDTH - MARGIN - 180;

    drawSafeText({
      page,
      font: bold,
      text: workshop?.name ?? 'Workshop',
      options: { x: MARGIN, y: cursorY, size: 20, font: bold }
    });
    cursorY -= 20;
    drawSafeText({
      page,
      font,
      text: `Email: ${user.email ?? '-'}`,
      options: {
        x: MARGIN,
        y: cursorY,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.3)
      }
    });
    cursorY -= 14;
    page.drawText('Generated inspection report', {
      x: MARGIN,
      y: cursorY,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    page.drawText('INSPECTION REPORT', {
      x: rightX,
      y: PAGE_HEIGHT - MARGIN,
      size: 16,
      font: bold
    });
    page.drawText(
      new Date().toLocaleDateString('en-ZA', {
        timeZone: 'Africa/Johannesburg'
      }),
      { x: rightX, y: PAGE_HEIGHT - MARGIN - 18, size: 10, font }
    );

    cursorY -= 20;
    page.drawRectangle({
      x: MARGIN,
      y: cursorY - 65,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 65,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1
    });
    drawSafeText({
      page,
      font: bold,
      text: `Reg: ${vehicle.registration_number ?? '-'}`,
      options: { x: MARGIN + 10, y: cursorY - 18, size: 10, font: bold }
    });
    drawSafeText({
      page,
      font,
      text: `Make/Model: ${[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '-'}`,
      options: { x: MARGIN + 10, y: cursorY - 34, size: 10, font }
    });
    drawSafeText({
      page,
      font,
      text: `VIN: ${vehicle.vin ?? '-'}`,
      options: { x: MARGIN + 10, y: cursorY - 50, size: 10, font }
    });
    drawSafeText({
      page,
      font,
      text: `Mileage: ${payload.odometerKm} km`,
      options: { x: MARGIN + 280, y: cursorY - 18, size: 10, font }
    });
    const customerName =
      (customer?.customer_accounts as { name?: string } | null)?.name ?? '-';
    drawSafeText({
      page,
      font,
      text: `Customer: ${customerName}`,
      options: { x: MARGIN + 280, y: cursorY - 34, size: 10, font }
    });

    cursorY -= 88;

    const drawTableHeader = () => {
      page.drawRectangle({
        x: MARGIN,
        y: cursorY - 20,
        width: PAGE_WIDTH - MARGIN * 2,
        height: 20,
        color: rgb(0.94, 0.94, 0.94)
      });
      page.drawText('Item', {
        x: MARGIN + 8,
        y: cursorY - 14,
        size: 10,
        font: bold
      });
      page.drawText('Result', {
        x: MARGIN + 285,
        y: cursorY - 14,
        size: 10,
        font: bold
      });
      page.drawText('Notes', {
        x: MARGIN + 420,
        y: cursorY - 14,
        size: 10,
        font: bold
      });
      cursorY -= 22;
    };

    drawTableHeader();

    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];

      if (field.field_type === 'section_break') {
        const sectionHeight = 24;
        if (cursorY - sectionHeight < MARGIN + 110) {
          page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          cursorY = PAGE_HEIGHT - MARGIN;
          drawTableHeader();
        }
        page.drawRectangle({
          x: MARGIN,
          y: cursorY - sectionHeight,
          width: PAGE_WIDTH - MARGIN * 2,
          height: sectionHeight,
          color: rgb(0.93, 0.93, 0.93)
        });
        drawWrappedText({
          page,
          text: field.label,
          x: MARGIN + 8,
          y: cursorY - 15,
          maxWidth: PAGE_WIDTH - MARGIN * 2 - 16,
          size: 10,
          font: bold
        });
        cursorY -= sectionHeight;
        continue;
      }

      const value = formatInspectionResult(
        field.field_type,
        payload.answers[field.id],
        field.options
      );
      const fieldNote = cleanedFieldNotes[field.id] ?? '';
      const displayValue = value;
      const valueFont = font;
      const lineCount = Math.max(
        Math.ceil(widthOfSafeTextAtSize(bold, field.label, 9) / 260),
        Math.ceil(
          widthOfSafeTextAtSize(valueFont, displayValue || '-', 9) / 120
        ),
        Math.ceil(widthOfSafeTextAtSize(font, fieldNote || '-', 9) / 120),
        1
      );
      const rowHeight = Math.max(22, lineCount * 12 + 8);

      if (cursorY - rowHeight < MARGIN + 110) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        cursorY = PAGE_HEIGHT - MARGIN;
        drawTableHeader();
      }

      if (index % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: cursorY - rowHeight,
          width: PAGE_WIDTH - MARGIN * 2,
          height: rowHeight,
          color: rgb(0.985, 0.985, 0.985)
        });
      }

      drawWrappedText({
        page,
        text: field.label,
        x: MARGIN + 8,
        y: cursorY - 14,
        maxWidth: 260,
        size: 9,
        font
      });
      drawWrappedText({
        page,
        text: displayValue || '-',
        x: MARGIN + 285,
        y: cursorY - 14,
        maxWidth: 120,
        size: 9,
        font: valueFont
      });
      drawWrappedText({
        page,
        text: fieldNote || '-',
        x: MARGIN + 420,
        y: cursorY - 14,
        maxWidth: 120,
        size: 9,
        font
      });

      cursorY -= rowHeight;
    }

    cursorY -= 16;
    page.drawText('Inspector notes', {
      x: MARGIN,
      y: cursorY,
      size: 12,
      font: bold
    });
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

    const signatureBox = {
      x: MARGIN,
      y: cursorY - 40,
      width: 210,
      height: 52
    };
    page.drawRectangle({
      x: signatureBox.x,
      y: signatureBox.y,
      width: signatureBox.width,
      height: signatureBox.height,
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 1
    });

    let missingSignature = false;
    if (selectedTechnician.signature_image_path) {
      const { data: signatureBlob, error: signatureDownloadError } = await admin.storage
        .from('vehicle-files')
        .download(selectedTechnician.signature_image_path);

      if (!signatureDownloadError && signatureBlob) {
        const signatureBytes = new Uint8Array(await signatureBlob.arrayBuffer());
        const embeddedSignature = await pdfDoc.embedPng(signatureBytes);
        const maxWidth = 200;
        const maxHeight = 48;
        const dimensions = embeddedSignature.scale(1);
        const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height, 1);
        const imageWidth = dimensions.width * scale;
        const imageHeight = dimensions.height * scale;
        page.drawImage(embeddedSignature, {
          x: signatureBox.x + 5,
          y: signatureBox.y + (signatureBox.height - imageHeight) / 2,
          width: imageWidth,
          height: imageHeight
        });
      } else {
        missingSignature = true;
      }
    } else {
      missingSignature = true;
    }

    if (missingSignature) {
      const fallbackName =
        selectedTechnician.full_name?.trim() ||
        selectedTechnician.display_name?.trim() ||
        'Technician signature on file not provided';
      drawSafeText({
        page,
        font,
        text: fallbackName,
        options: {
          x: signatureBox.x + 8,
          y: signatureBox.y + 20,
          size: 11,
          font,
          color: rgb(0.35, 0.35, 0.35)
        }
      });
    }

    const saDate = new Date().toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Africa/Johannesburg'
    });

    drawSafeText({
      page,
      font,
      text: 'Technician signature',
      options: { x: signatureBox.x, y: signatureBox.y + signatureBox.height + 5, size: 10, font }
    });
    drawSafeText({
      page,
      font,
      text: `Date: ${saDate}`,
      options: { x: MARGIN + 330, y: signatureBox.y + 20, size: 11, font }
    });

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
      return NextResponse.json(
        { error: documentError?.message ?? 'Could not create document' },
        { status: 400 }
      );
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
      display_name: displayName,
      warning: missingSignature
        ? 'No saved signature. Add signature in Profile to sign reports automatically.'
        : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '[api/workshop/inspection-reports/generate] Unexpected error',
      error
    );
    return NextResponse.json(
      { error: 'Could not generate report', detail: message },
      { status: 500 }
    );
  }
}
