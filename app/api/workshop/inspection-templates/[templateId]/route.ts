import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  inspectionTemplateSchema,
  normalizeFieldOptions
} from '@/lib/inspection-reports';

async function getWorkshopContext() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { supabase, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .in('role', ['admin', 'technician'])
    .maybeSingle();

  if (!profile?.workshop_account_id) {
    return { supabase, error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  return { supabase, profile, error: null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const context = await getWorkshopContext();
  if (context.error) return context.error;

  const { supabase, profile } = context;

  const { data, error } = await supabase
    .from('inspection_templates')
    .select('id,name,created_at,updated_at,inspection_template_fields(id,sort_order,field_type,label,required,options,created_at)')
    .eq('id', templateId)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json({ template: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const context = await getWorkshopContext();
  if (context.error) return context.error;

  const { supabase, profile } = context;
  const parsed = inspectionTemplateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid template payload' }, { status: 400 });
  }

  const payload = parsed.data;

  const { error: templateError } = await supabase
    .from('inspection_templates')
    .update({
      name: payload.name,
      updated_at: new Date().toISOString()
    })
    .eq('id', templateId)
    .eq('workshop_account_id', profile.workshop_account_id);

  if (templateError) {
    return NextResponse.json({ error: templateError.message }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from('inspection_template_fields')
    .delete()
    .eq('template_id', templateId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (payload.fields.length) {
    const { error: fieldsError } = await supabase
      .from('inspection_template_fields')
      .insert(
        payload.fields.map((field, index) => ({
          template_id: templateId,
          sort_order: index,
          field_type: field.field_type,
          label: field.label,
          required: field.field_type === 'section_break' ? false : field.required,
          options: normalizeFieldOptions(field.field_type, field.options)
        }))
      );

    if (fieldsError) {
      return NextResponse.json({ error: fieldsError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await params;
  const context = await getWorkshopContext();
  if (context.error) return context.error;
  const { supabase, profile } = context;

  const { error } = await supabase
    .from('inspection_templates')
    .delete()
    .eq('id', templateId)
    .eq('workshop_account_id', profile.workshop_account_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
