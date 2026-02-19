import type { ReactNode } from 'react';

export function ModalFormShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3 text-sm [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-black/15 [&_input]:px-3 [&_input]:py-2 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-black/15 [&_select]:px-3 [&_select]:py-2 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-black/15 [&_textarea]:px-3 [&_textarea]:py-2">{children}</div>;
}
