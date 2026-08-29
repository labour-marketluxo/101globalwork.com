'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function reviewVerificationAction(formData: FormData) {
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/sign-in?next=/admin/verifications');
  const id=String(formData.get('verification_id')??'');
  const decision=String(formData.get('decision')??'');
  const note=String(formData.get('note')??'').trim()||null;
  const {error}=await supabase.rpc('review_provider_verification_command',{p_verification_id:id,p_decision:decision,p_note:note});
  if(error) redirect(`/admin/verifications?error=${encodeURIComponent('Unable to review this verification. It may already have been decided or you may not have permission.')}`);
  redirect(`/admin/verifications?reviewed=${encodeURIComponent(decision)}`);
}
