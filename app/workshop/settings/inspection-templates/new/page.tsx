import { PageHeader } from '@/components/layout/page-header';
import { InspectionTemplateBuilder } from '@/components/workshop/inspection-template-builder';

export default function NewInspectionTemplatePage() {
  return (
    <main className="space-y-4">
      <PageHeader
        title="Create inspection template"
        subtitle="Define reusable fields for digital inspection reports."
      />
      <InspectionTemplateBuilder mode="create" />
    </main>
  );
}
