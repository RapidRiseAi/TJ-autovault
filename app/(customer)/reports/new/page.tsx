export default function NewReportPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-bold">Submit problem report</h1>
      <p className="text-sm text-gray-600">
        Category, severity, description, and attachments are captured and sent to workshop.
      </p>
      <form className="space-y-2">
        <input className="w-full rounded border p-2" placeholder="Category" />
        <select className="w-full rounded border p-2">
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
          <option>Critical</option>
        </select>
        <textarea className="w-full rounded border p-2" placeholder="Description" rows={5} />
        <input className="w-full rounded border p-2" type="file" multiple />
        <button className="rounded bg-brand-red px-4 py-2 text-white">Submit</button>
      </form>
    </main>
  );
}
