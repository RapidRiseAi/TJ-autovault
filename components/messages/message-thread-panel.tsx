'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { MessageSquareMore } from 'lucide-react';
import { replyToMessage } from '@/lib/actions/messages';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

type ThreadMessage = {
  id: string;
  body: string;
  subject: string | null;
  created_at: string;
  sender_role: string;
  in_reply_to_message_id: string | null;
};

type Conversation = {
  id: string;
  subject: string;
  vehicle_id: string | null;
  vehicles?: { registration_number: string | null } | null;
};

export function MessageThreadPanel({ conversationId, open, onClose }: { conversationId: string | null; open: boolean; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !conversationId) return;
    const load = async () => {
      const [{ data: conv, error: convError }, { data: rows, error: rowsError }] = await Promise.all([
        supabase.from('message_conversations').select('id,subject,vehicle_id,vehicles(registration_number)').eq('id', conversationId).maybeSingle(),
        supabase.from('messages').select('id,body,subject,created_at,sender_role,in_reply_to_message_id').eq('conversation_id', conversationId).order('created_at', { ascending: true })
      ]);

      if (convError || rowsError) {
        setError(convError?.message ?? rowsError?.message ?? 'Unable to load thread.');
        return;
      }

      setConversation((conv as Conversation | null) ?? null);
      setMessages((rows as ThreadMessage[] | null) ?? []);
      setError(null);
    };

    void load();
  }, [conversationId, open, supabase]);

  return (
    <Modal open={open} onClose={onClose} title="Message thread">
      {!conversationId ? <p className="text-sm text-gray-500">Select a message notification to view the full conversation.</p> : null}
      {conversation ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="font-semibold">{conversation.subject}</p>
            {conversation.vehicles?.registration_number ? <p className="text-xs text-blue-700">Vehicle: {conversation.vehicles.registration_number}</p> : <p className="text-xs text-blue-700">Not about a vehicle</p>}
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border p-3">
            {messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-black/10 bg-white p-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">{message.sender_role}</p>
                <p className="text-sm">{message.body}</p>
                <p className="text-xs text-gray-500">{new Date(message.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!conversationId) return;
              startTransition(async () => {
                const result = await replyToMessage({ conversationId, body: reply });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setReply('');
                const { data } = await supabase
                  .from('messages')
                  .select('id,body,subject,created_at,sender_role,in_reply_to_message_id')
                  .eq('conversation_id', conversationId)
                  .order('created_at', { ascending: true });
                setMessages((data as ThreadMessage[] | null) ?? []);
              });
            }}
          >
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reply</label>
            <textarea className="min-h-24 w-full rounded-lg border px-3 py-2" value={reply} onChange={(event) => setReply(event.target.value)} required />
            <Button type="submit" disabled={isPending || !reply.trim()}>
              <MessageSquareMore className="mr-1 h-4 w-4" />
              {isPending ? 'Sending...' : 'Send reply'}
            </Button>
          </form>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </Modal>
  );
}
