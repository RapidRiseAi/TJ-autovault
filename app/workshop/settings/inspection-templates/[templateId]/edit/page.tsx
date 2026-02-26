import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { InspectionTemplateBuilder } from '@/components/workshop/inspection-template-builder';

export default async function EditInspectionTemplatePage({
  params
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workshop_account_id,role')
    .eq('id', user.id)
    .in('role', ['admin', 'technician'])
    .maybeSingle();

  if (!profile?.workshop_account_id) redirect('/workshop/dashboard');

  const { data: template } = await supabase
    .from('inspection_templates')
    .select('id,name,inspection_template_fields(id,field_type,label,required,options,sort_order)')
    .eq('id', templateId)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (!template) redirect('/workshop/settings/inspection-templates');

  return (
    <main className="space-y-4">
      <PageHeader
        title="Edit inspection template"
        subtitle="Update field order, labels, and required settings."
      />
      <InspectionTemplateBuilder
        mode="edit"
        templateId={template.id}
        initialName={template.name}
        initialFields={(template.inspection_template_fields ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((field) => ({
            field_type: field.field_type,
            label: field.label,
            required: field.field_type === 'section_break' ? false : field.required,
            optionsText:
              field.field_type === 'dropdown' && Array.isArray(field.options)
                ? field.options.join('\n')
                : '',
            checkboxTwoOptions:
              field.field_type === 'checkbox' && field.options && typeof field.options === 'object'
                ? Boolean((field.options as { allowCross?: unknown }).allowCross)
                : false
          }))}
      />
    </main>
  );
}
