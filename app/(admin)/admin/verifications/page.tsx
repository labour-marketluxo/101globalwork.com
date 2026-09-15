import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reviewVerificationAction } from './actions';

export const metadata={title:'Verification review',robots:{index:false,follow:false}};

type VerificationRecord = {
  id: string;
  provider_id: string;
  provider_name: string;
  account_id: string;
  owner_name: string;
  owner_email?: string | null;
  kind: string;
  status: string;
  jurisdiction_code?: string | null;
  reference_label?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  verified_at?: string | null;
  review_note?: string | null;
  reviewer_name?: string | null;
};

export default async function VerificationReviewPage({searchParams}:{searchParams:Promise<{error?:string;reviewed?:string}>}){
  const {error,reviewed}=await searchParams;
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/sign-in?next=/admin/verifications');

  const {data,error:recordsError}=await supabase.rpc('admin_verification_records_command',{p_limit:100});
  if(recordsError) return <section className="content-shell"><p className="eyebrow">Trust operations</p><h1>Verification review</h1><p className="notice" role="alert">You do not have access to the verification queue.</p></section>;
  const records=(data??[]) as VerificationRecord[];
  const pending=records.filter(item=>item.status==='pending');
  const history=records.filter(item=>item.status!=='pending');

  return <section className="content-shell">
    <p className="eyebrow">Trust operations</p>
    <h1>Verification review</h1>
    <p className="lede left">The queue is for decisions. The history remains visible after approval or rejection so operators can understand what happened without searching raw audit records.</p>
    {error?<p className="notice" role="alert">{error}</p>:null}
    {reviewed?<p className="notice" role="status"><strong>Review recorded.</strong><br />Decision: {reviewed}. The record remains in history below.</p>:null}

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Needs review</h2><p>Only pending records can be decided here.</p></div><span>{pending.length}</span></div>
      {pending.length ? pending.map(item=><form key={item.id} action={reviewVerificationAction} className="stack-form action-panel">
        <input type="hidden" name="verification_id" value={item.id}/>
        <div className="section-heading-row"><div><p className="eyebrow">{item.kind}</p><h2>{item.provider_name}</h2></div><span className="pill">pending</span></div>
        <p><strong>Account:</strong> <Link href={`/admin/users/${item.account_id}`}>{item.owner_name}</Link>{item.owner_email ? ` · ${item.owner_email}` : ''}</p>
        <p><strong>Jurisdiction:</strong> {item.jurisdiction_code??'Not supplied'}</p>
        <p><strong>Reference:</strong> {item.reference_label??'Not supplied'}</p>
        <p className="hint">Submitted {new Date(item.created_at).toLocaleString()}</p>
        <label htmlFor={`note-${item.id}`}>Review note</label><textarea id={`note-${item.id}`} name="note" rows={3} placeholder="Record why you are approving or rejecting this submission."/>
        <div className="button-row"><button type="submit" name="decision" value="verified">Approve</button><button type="submit" name="decision" value="rejected">Reject</button></div>
      </form>) : <p className="notice">No verification records are waiting for review.</p>}
    </section>

    <section className="admin-section">
      <div className="admin-section-heading"><div><h2>Review history</h2><p>Approved and rejected records remain visible. Decisions are also preserved in the immutable audit stream.</p></div><span>{history.length}</span></div>
      {history.length ? <div className="admin-list">{history.map(item=><article key={item.id}>
        <div>
          <strong>{item.provider_name} · {item.kind}</strong>
          <span>{item.status} · {item.jurisdiction_code??'jurisdiction not supplied'}</span>
          <span>Owner: <Link href={`/admin/users/${item.account_id}`}>{item.owner_name}</Link></span>
          {item.review_note ? <span>Review note: {item.review_note}</span> : null}
        </div>
        <div><small>{item.reviewed_at ? `Reviewed ${new Date(item.reviewed_at).toLocaleString()}` : `Updated after ${new Date(item.created_at).toLocaleString()}`}</small>{item.reviewer_name ? <small>By {item.reviewer_name}</small> : <small>Decision audited</small>}</div>
      </article>)}</div> : <p className="empty-admin">No completed verification reviews yet.</p>}
    </section>
  </section>;
}
