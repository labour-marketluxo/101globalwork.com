import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reviewVerificationAction } from './actions';

export const metadata={title:'Verification review',robots:{index:false,follow:false}};

export default async function VerificationReviewPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/sign-in?next=/admin/verifications');
  const {data:items}=await supabase.from('provider_verifications').select('id,provider_id,kind,status,jurisdiction_code,reference_label,created_at').eq('status','pending').order('created_at');
  return <section className="content-shell"><p className="eyebrow">Trust operations</p><h1>Verification review</h1><p className="lede left">Only accounts granted the verification-review capability can see or decide these records. Every decision is audited.</p>{error?<p className="notice" role="alert">{error}</p>:null}{items?.length?items.map(item=><form key={item.id} action={reviewVerificationAction} className="stack-form action-panel"><input type="hidden" name="verification_id" value={item.id}/><h2>{item.kind}</h2><p>Provider: {item.provider_id}</p><p>Jurisdiction: {item.jurisdiction_code??'Not supplied'}</p><p>Reference: {item.reference_label??'Not supplied'}</p><label htmlFor={`note-${item.id}`}>Review note</label><textarea id={`note-${item.id}`} name="note" rows={3}/><div className="button-row"><button name="decision" value="verified">Approve</button><button name="decision" value="rejected">Reject</button></div></form>):<p className="notice">No pending verifications are visible to this account.</p>}</section>;
}
