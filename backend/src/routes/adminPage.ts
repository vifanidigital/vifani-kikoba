export const adminPage = `<!doctype html>
<html lang="sw">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vifani Jamii • Usimamizi</title>
<style>
:root{font:16px system-ui;color:#173b35;background:#eff6f2}
*{box-sizing:border-box}
body{margin:0}
main{max-width:980px;margin:auto;padding:32px 20px}
h1{font-size:clamp(28px,4vw,48px);margin:8px 0}
p{line-height:1.5}
.toolbar,.actions,form{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input,select,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #a1b8b0}
button{background:#125849;color:white;cursor:pointer}
button.secondary{background:white;color:#125849}
.card{background:white;border:1px solid #cbdcd4;border-radius:14px;padding:18px;margin:12px 0}
.card h2{margin:0}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px}
dt{font-size:12px;color:#50665e}
dd{margin:4px 0;font-weight:700;overflow-wrap:anywhere}
.pill{display:inline-block;margin:8px 0;padding:4px 8px;border-radius:6px;background:#d9f0e6}
.status{min-height:24px;color:#933421}
#q{flex:1;min-width:160px}
#overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:22px 0}
.metric{background:white;border:1px solid #cbdcd4;border-radius:12px;padding:12px;display:grid;gap:4px;text-align:left;color:#173b35}
.metric strong{font-size:22px}
#record{display:grid}
#record h2,#record p{margin:0}
.pill.ACTIVE{background:#d3f4e4}.pill.EXPIRED,.pill.SUSPENDED{background:#ffe8df}.pill.TRIAL{background:#e6edff}
dialog{border:1px solid #a1b8b0;border-radius:16px;max-width:min(540px,95vw)}
dialog::backdrop{background:#1238}
label{display:grid;gap:4px}
[hidden]{display:none!important}
button:disabled{opacity:.45;cursor:auto}

</style></head>
<body><main><header><small>Vifani Jamii</small><h1>Usimamizi wa vikundi</h1><p>Mwezi mmoja wa majaribio · TZS 10,000 kwa mwezi</p></header>
<section id="overview" aria-label="Muhtasari wa usajili"></section>
<form id="search"><input id="q" aria-label="Tafuta kikundi" placeholder="Jina au kitambulisho cha kikundi">
<select id="filter" aria-label="Hali ya kikundi"><option value="">Hali zote</option><option value="ACTIVE">Imelipiwa</option><option value="TRIAL">Majaribio</option><option value="EXPIRING">Inaisha ndani ya siku 7</option><option value="EXPIRED">Muda umeisha</option><option value="SUSPENDED">Imesimamishwa</option></select>
<button>Tafuta</button><button type="button" id="reset" class="secondary">Ondoa vichujio</button></form>
<p id="status" class="status" role="status"></p><section id="results" aria-label="Vikundi"></section>
<div class="toolbar"><button id="prev" class="secondary" disabled>Nyuma</button><span id="page"></span><button id="next" class="secondary" disabled>Mbele</button></div>
<dialog id="payment"><form id="record"><h2 id="selected"></h2><label>Muda wa huduma<select id="period"><option value="1">Mwezi 1</option><option value="3">Miezi 3</option><option value="6">Miezi 6</option><option value="12">Mwaka 1</option><option value="24">Miaka 2</option><option value="custom">Chagua idadi ya miezi</option></select></label><label id="custom" hidden>Miezi (1–24)<input required id="months" type="number" min="1" max="24" value="1" disabled></label><label>Rejea ya malipo<input required id="reference" minlength="3" maxlength="100"></label><p id="total"></p><button id="save">Thibitisha malipo</button><button id="close" type="button" class="secondary">Funga</button><p id="error" class="status" role="status"></p></form></dialog>
<script>
const node=id=>document.getElementById(id);
const endpoint='/admin';
const status=node('status'); let page=1; let selected; let requestId=0; let monthlyPrice=10000;
const labels={TRIAL:'Majaribio',ACTIVE:'Imelipiwa',EXPIRED:'Muda umeisha',SUSPENDED:'Imesimamishwa'};
function el(tag, text, cls) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  if (cls) result.className = cls;
  return result;
}
async function api(path,method='GET',body) {
 const response=await fetch(endpoint+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await response.json().catch(()=>({}));
 if(response.status===401) throw new Error('Ingia tena kama msimamizi, kisha pakia ukurasa upya.');
 if(response.status===429) throw new Error('Subiri dakika moja kisha jaribu tena.');
 if(!response.ok) throw new Error(result.error||'Ombi halikufanikiwa. Hakiki muunganisho kisha ujaribu tena.');
 return result;
}
const date=value=>value?new Date(value).toLocaleString('sw-TZ',{timeZone:'Africa/Dar_es_Salaam'}):'—';
const money=value=>'TZS '+value.toLocaleString('en-TZ');
function action(label, handler) {
  const button = el('button', label, 'secondary');
  button.type = 'button';
  button.onclick = handler;
  return button;
}
function render(group){
 const card=el('article',null,'card');card.append(el('h2',group.name),el('span',labels[group.access]||group.access,'pill '+group.access));
 const details=el('dl');for(const [label,value] of [['Kitambulisho',group.id],['Wanachama hai',group._count.members],['Lilianza',date(group.createdAt)],['Majaribio yanaisha',date(group.trialEndsAt)],['Imelipiwa hadi',date(group.paidUntil)]]){
  const row=el('div');row.append(el('dt',label),el('dd',String(value)));details.append(row);
 }
 card.append(details);
 const controls=el('div',null,'actions');
 controls.append(action('Rekodi malipo',()=>{selected=group;node('selected').textContent='Rekodi malipo · '+group.name;node('record').reset();node('error').textContent='';updateTotal();node('payment').showModal();}));
 const suspend=group.access!=='SUSPENDED';
 controls.append(action(suspend?'Simamisha':'Rejesha',async()=>{if(!confirm((suspend?'Simamisha ':'Rejesha ')+group.name+'?'))return;try{await api('/groups/'+group.id+'/status','PATCH',{suspended:suspend});if(node('filter').value) filterBy('');else await load();refreshOverview();}catch(e){status.textContent=e.message;}}));
 const history=el('div');controls.append(action('Historia ya malipo',async event=>{const button=event.currentTarget;if(history.childElementCount){history.replaceChildren();return;}button.disabled=true;try{const data=await api('/groups/'+group.id+'/payments');if(!data.payments.length){history.append(el('p','Hakuna malipo yaliyorekodiwa.'));return;}const list=el('ul');for(const payment of data.payments)list.append(el('li',payment.reference+' · '+money(payment.amount)+' · '+date(payment.recordedAt)+' · hadi '+date(payment.paidUntil)));history.append(list);}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}));
 card.append(controls,history);return card;
}
function filterBy(value){
 node('filter').value=value;page=1;void load();
}
async function loadOverview(){
 const data=await api('/overview');
 monthlyPrice=data.monthlyPrice;
 const metrics=[['Vikundi vyote','',data.total],['Vilivyolipia','ACTIVE',data.active],['Majaribio','TRIAL',data.trial],['Vinaisha siku 7','EXPIRING',data.expiring],['Muda umeisha','EXPIRED',data.expired],['Vilivyosimamishwa','SUSPENDED',data.suspended]];
 const cards=metrics.map(([label,value,count])=>{
  const button=action(label,()=>filterBy(value));button.className='metric';button.append(el('strong',String(count)));return button;
 });
 const revenue=el('div',null,'metric');
 revenue.append(el('span','Malipo yaliyorekodiwa ('+data.paymentCount+')'),el('strong',money(data.amount)));
 node('overview').replaceChildren(...cards,revenue);
}
async function load(){
 const request=++requestId;
 status.textContent='Inapakia vikundi…';
 node('prev').disabled=true;node('next').disabled=true;
 try{
  const params=new URLSearchParams({q:node('q').value,page:String(page)});
  if(node('filter').value) params.set('status',node('filter').value);
  const data=await api('/groups?'+params);
  if(request!==requestId) return;
  node('results').replaceChildren(...data.groups.map(render));
  status.textContent=data.total?data.total+' vikundi':'Hakuna vikundi vilivyopatikana.';
  node('page').textContent='Ukurasa '+page+' kati ya '+Math.max(1,Math.ceil(data.total/30));
  node('prev').disabled=page<=1;node('next').disabled=page*30>=data.total;
 }catch(error){if(request===requestId) status.textContent=error.message;}
}
function refreshOverview(){void loadOverview().catch(error=>{node('overview').textContent=error.message;});}
node('search').onsubmit=e=>{e.preventDefault();page=1;void load();};
node('filter').onchange=()=>filterBy(node('filter').value);
node('reset').onclick=()=>{node('q').value='';filterBy('');};
node('prev').onclick=()=>{page--;void load();};
node('next').onclick=()=>{page++;void load();};
function monthsSelected(){return Number(node('period').value==='custom'?node('months').value:node('period').value);}
function updateTotal(){
 const custom=node('period').value==='custom';
 node('custom').hidden=!custom;node('months').disabled=!custom;
 const months=monthsSelected();
 if(!Number.isInteger(months)||months<1||months>24){node('total').textContent='Chagua miezi 1 hadi 24.';return;}
 const starts=new Date(Math.max(Date.now(),Date.parse(selected.trialEndsAt),selected.paidUntil?Date.parse(selected.paidUntil):0));
 const ends=new Date(starts);
 const day=ends.getUTCDate();
 ends.setUTCDate(1);ends.setUTCMonth(ends.getUTCMonth()+months);
 const last=new Date(Date.UTC(ends.getUTCFullYear(),ends.getUTCMonth()+1,0)).getUTCDate();
 ends.setUTCDate(Math.min(day,last));
 node('total').textContent=money(months*monthlyPrice)+' · Makadirio ya muda: '+date(starts)+' hadi '+date(ends)+(selected.access==='SUSPENDED'?' · Kikundi kitaendelea kusimamishwa hadi ukirejeshe.':'');
}
node('period').onchange=updateTotal;node('months').oninput=updateTotal;
node('close').onclick=()=>node('payment').close();
node('record').onsubmit=async event=>{
 event.preventDefault();
 node('save').disabled=true;node('close').disabled=true;node('error').textContent='';
 try{
  await api('/groups/'+selected.id+'/payments','POST',{months:monthsSelected(),reference:node('reference').value});
  node('payment').close();await load();refreshOverview();
 }catch(error){node('error').textContent=error.message;}
 finally{node('save').disabled=false;node('close').disabled=false;}
};
node('payment').oncancel=event=>{if(node('save').disabled) event.preventDefault();};
refreshOverview();
void load();
</script></main></body></html>`; 