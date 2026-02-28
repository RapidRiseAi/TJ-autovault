import { Card } from '@/components/ui/card';

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10">
      <Card className="space-y-4 rounded-3xl border border-black/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">Privacy notice</h1>
        <p className="text-sm text-gray-700">
          This notice describes how this portal currently handles personal data.
          It should be reviewed by your legal/compliance advisor before relying
          on it as formal legal advice.
        </p>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">What data is stored</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Account identity details (for example: email, display name, role).
            </li>
            <li>
              Workshop and customer records needed to manage vehicles and
              services.
            </li>
            <li>
              Vehicle, quote, invoice, message, and timeline data created inside
              the portal.
            </li>
            <li>
              Uploaded files (for example documents and photos) tied to those
              records.
            </li>
          </ul>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">
            How access is controlled
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Signed-in users only access data allowed for their role and
              workshop/customer context.
            </li>
            <li>
              Workshop admins can manage workshop-level settings and staff
              access.
            </li>
            <li>
              Customers can access their own account and linked vehicle
              information.
            </li>
          </ul>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">Your responsibilities</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Only upload data you are authorised to share.</li>
            <li>Do not share login credentials.</li>
            <li>
              Contact your workshop if you need data correction or account
              support.
            </li>
          </ul>
        </section>

        <p className="text-xs text-gray-500">
          Last reviewed: 2026-02-28. Update this page whenever data handling
          changes so the notice remains accurate.
        </p>
      </Card>
    </main>
  );
}
