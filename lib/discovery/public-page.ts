import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PublicDiscoveryDocument = {
  canonical_path: string;
  title: string;
  h1: string;
  meta_description: string | null;
  summary: string | null;
  structured_data: Record<string, unknown>;
  language_code: string;
  indexability:
    | 'indexable'
    | 'noindex_follow'
    | 'canonical_to_parent'
    | 'blocked_private'
    | 'insufficient_content'
    | 'insufficient_supply'
    | 'duplicate';
};

export async function getPublicDiscoveryDocument(canonicalPath: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('public_discovery_documents')
    .select('canonical_path,title,h1,meta_description,summary,structured_data,language_code,indexability')
    .eq('canonical_path', canonicalPath)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw new Error(`Unable to load public discovery page: ${error.message}`);
  return data as PublicDiscoveryDocument | null;
}
