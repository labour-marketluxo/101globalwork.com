import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Money', robots: { index: false, follow: false } };

export default async function MoneyPage(){
 const supabase=await createSupabaseServerClient();
 const [{count: funded},{count: eligible},{count: disputes},{count: refunds},{data: recent}]=await Promise.all([
  supabase.from('payment_obligations').select('*',{count:'exact',head:true}).eq('status','funded'),
  supabase.from('payouts').select('*',{count:'exact',head:true}).eq('status','eligible'),
  supabase.from('payment_disputes').select('*',{count:'exact',head:true}),
  supabase.from('payment_refunds').select('*',{count:'exact',head:true}).in('status',['requested','processing','needs_attention']),
  supabase.from('payment_obligations').select('id,amount_minor,currency_code,status,created_at').order('created_at',{ascending:false}).limit(12)
 ]);
 const money=(n:number,c:string)=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(n/100)}catch{return `${c} ${(n/100).toFixed(2)}`}};
 return <div className="admin-page"><header className="admin-page-header"><div><p className="eyebrow">Money</p><h1>Financial truth, without guesswork.</h1><p>Provider events reconcile into the ledger. Browser redirects never decide payment state.</p></div></header><section className="admin-stat-grid"><article><span>Funded obligations</span><strong>{funded??0}</strong><small>Reconciled funding</small></article><article><span>Eligible payouts</span><strong>{eligible??0}</strong><small>Completed + funded</small></article><article><span>Disputes</span><strong>{disputes??0}</strong><small>Provider chargebacks/disputes</small></article><article><span>Refund attention</span><strong>{refunds??0}</strong><small>Open refund workflow</small></article></section><section className="admin-section"><div className="admin-section-heading"><div><h2>Recent obligations</h2><p>Authoritative internal financial obligations.</p></div></div>{recent?.length?<div className="admin-list">{recent.map(item=><article key={item.id}><div><strong>{money(Number(item.amount_minor),item.currency_code)}</strong><span>{item.status.replaceAll('_',' ')}</span></div><small>{new Date(item.created_at).toLocaleString()}</small></article>)}</div>:<p className="empty-admin">No financial obligations yet.</p>}</section></div>;
}
