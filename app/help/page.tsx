import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { HelpFaq } from '@/components/auth/help-faq';

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10">
      <Card className="space-y-4 rounded-3xl border border-black/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">Help center</h1>
        <p className="text-sm text-gray-700">
          Browse frequently asked questions below. If you still need help,
          contact your workshop team.
        </p>
        <HelpFaq />
        <p className="text-sm text-gray-700">
          Need direct support? Visit the{' '}
          <Link
            href="/contact"
            className="font-semibold text-brand-red underline"
          >
            contact page
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
