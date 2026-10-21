import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MessageContext, ProjectRole } from '@/features/projects/project';

/**
 * The conversation, and the record beside it.
 *
 * ⚠️ TWO LISTS, DELIBERATELY NOT ONE. Chat is what people said; activity is what happened, derived from the rows
 * that caused it. Interleaving them is how a decision gets read as a comment about a decision, which is the
 * separation the brief asks for.
 *
 * ⚠️ THE ORIGINAL TEXT IS ALWAYS RENDERED, AND A TRANSLATION IS NEVER SUBSTITUTED FOR IT. `translatedBody` is null
 * on every row today because no translation provider is configured; the page shows the original, offers the
 * translation only when one exists, and says why it does not.
 */

export type ProjectMessage = {
  id: string;
  contextKind: MessageContext;
  contextId: string | null;
  contextLabel: string;
  authorRole: 'customer' | 'provider';
  authorName: string;
  body: string;
  translatedBody: string | null;
  translatedLanguage: string | null;
  attachment: { evidenceId: string; kind: string | null; note: string | null } | null;
  createdAt: string | null;
};

export type ProjectActivity = { kind: string; label: string; at: string | null };

export type ProjectMessagesRead = {
  role: ProjectRole | null;
  contexts: { kind: MessageContext; label: string; tasks?: { id: string; title: string }[] }[];
  messages: ProjectMessage[];
  activity: ProjectActivity[];
  denied: boolean;
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const CONTEXTS: MessageContext[] = ['project', 'task', 'quote', 'scope_change', 'milestone', 'dispute'];

export async function getProjectMessages(assignmentId: string): Promise<ProjectMessagesRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_messages_command', { p_assignment_id: assignmentId });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[projects] could not read the messages: ${error.message}`);
    }
    return { role: null, contexts: [], messages: [], activity: [], denied: false, unavailable: true };
  }
  const raw = obj(data);
  if (raw.allowed !== true) {
    return { role: null, contexts: [], messages: [], activity: [], denied: true, unavailable: false };
  }
  const role = raw.role === 'provider' || raw.role === 'admin' ? raw.role : 'customer';

  return {
    role,
    contexts: rows(raw.contexts)
      .map(entry => {
        const kind = text(entry.kind);
        if (!kind || !CONTEXTS.includes(kind as MessageContext)) return null;
        return {
          kind: kind as MessageContext,
          label: text(entry.label) ?? kind,
          tasks: rows(entry.tasks).map(task => ({ id: text(task.id) ?? '', title: text(task.title) ?? 'Task' })),
        };
      })
      .filter((entry): entry is { kind: MessageContext; label: string; tasks: { id: string; title: string }[] } => entry !== null),
    messages: rows(raw.messages)
      .map(entry => {
        const id = text(entry.id);
        const body = text(entry.body);
        if (!id || !body) return null;
        const attachment = entry.attachment && typeof entry.attachment === 'object' ? obj(entry.attachment) : null;
        return {
          id,
          contextKind: (text(entry.context_kind) ?? 'project') as MessageContext,
          contextId: text(entry.context_id),
          contextLabel: text(entry.context_label) ?? 'The project',
          authorRole: entry.author_role === 'customer' ? ('customer' as const) : ('provider' as const),
          authorName: text(entry.author_name) ?? 'A participant',
          body,
          translatedBody: text(entry.translated_body),
          translatedLanguage: text(entry.translated_language),
          attachment: attachment
            ? {
                evidenceId: text(attachment.evidence_id) ?? '',
                kind: text(attachment.kind),
                note: text(attachment.note),
              }
            : null,
          createdAt: text(entry.created_at),
        } satisfies ProjectMessage;
      })
      .filter((entry): entry is ProjectMessage => entry !== null),
    activity: rows(raw.activity).map(entry => ({
      kind: text(entry.kind) ?? 'event',
      label: text(entry.label) ?? 'Something happened',
      at: text(entry.at),
    })),
    denied: false,
    unavailable: false,
  };
}
