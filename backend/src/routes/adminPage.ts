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
input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #a1b8b0}
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
dialog{border:1px solid #a1b8b0;border-radius:16px;max-width:min(540px,95vw)}
dialog::backdrop{background:#1238}
label{display:grid;gap:4px}
button:disabled{opacity:.45;cursor:auto}

</style></head>
<body><main><header><small>Vifani Jamii</small><h1>Usimamizi wa vikundi</h1><p>Mwezi mmoja wa majaribio · TZS 10,000 kwa mwezi</p></header>
<form id="search"><input id="q" aria-label="Tafuta kikundi" placeholder="Tafuta kikundi kwa jina"><button>Tafuta</button></form>
<p id="status" class="status" role="status"></p><section id="results" aria-label="Vikundi"></section>
<div class="toolbar"><button id="prev" class="secondary">Nyuma</button><span id="page"></span><button id="next" class="secondary">Mbele</button></div>
<dialog id="payment"><form id="record"><h2 id="selected"></h2><label>Miezi<input required id="months" type="number" min="1" max="24" value="1"></label><label>Rejea ya malipo<input required id="reference" minlength="3" maxlength="100"></label><p id="total"></p><button id="save">Thibitisha malipo</button><button id="close" type="button" class="secondary">Funga</button><p id="error" class="status" role="status"></p></form></dialog>
<script>
const node=id=>document.getElementById(id);
const endpoint='/admin';
const status=node('status'); let page=1; let selected;
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
 const card=el('article',null,'card');card.append(el('h2',group.name),el('span',labels[group.access]||group.access,'pill'));
 const details=el('dl');for(const [label,value] of [['Kitambulisho',group.id],['Wanachama hai',group._count.members],['Lilianza',date(group.createdAt)],['Majaribio yanaisha',date(group.trialEndsAt)],['Imelipiwa hadi',date(group.paidUntil)]]){
  const row=el('div');row.append(el('dt',label),el('dd',String(value)));details.append(row);
 }
 card.append(details);
 const controls=el('div',null,'actions');
 controls.append(action('Rekodi malipo',()=>{selected=group;node('selected').textContent=group.name;node('record').reset();node('error').textContent='';updateTotal();node('payment').showModal();}));
 const suspend=group.access!=='SUSPENDED';
 controls.append(action(suspend?'Simamisha':'Rejesha',async()=>{if(!confirm((suspend?'Simamisha ':'Rejesha ')+group.name+'?'))return;try{await api('/groups/'+group.id+'/status','PATCH',{suspended:suspend});await load();}catch(e){status.textContent=e.message;}}));
 const history=el('div');controls.append(action('Historia ya malipo',async()=>{if(history.childElementCount){history.replaceChildren();return;}try{const data=await api('/groups/'+group.id+'/payments');if(!data.payments.length){history.append(el('p','Hakuna malipo yaliyorekodiwa.'));return;}const list=el('ul');for(const payment of data.payments)list.append(el('li',payment.reference+' · '+money(payment.amount)+' · '+date(payment.recordedAt)+' · hadi '+date(payment.paidUntil)));history.append(list);}catch(e){status.textContent=e.message;}}));
 card.append(controls,history);return card;
}
async function load(){
 status.textContent='Inapakia vikundi…';
 try{const data=await api('/groups?q='+encodeURIComponent(node('q').value)+'&page='+page);node('results').replaceChildren(...data.groups.map(render));status.textContent=data.total?data.total+' vikundi':'Hakuna vikundi vilivyopatikana.';node('page').textContent='Ukurasa '+page;node('prev').disabled=page<=1;node('next').disabled=page*30>=data.total;}
 catch(error){status.textContent=error.message;}
}
node('search').onsubmit=e=>{e.preventDefault();page=1;void load();};
node('prev').onclick=()=>{page--;void load();};node('next').onclick=()=>{page++;void load();};
function updateTotal(){node('total').textContent=money(Number(node('months').value)*10000);}
node('months').oninput=updateTotal;node('close').onclick=()=>node('payment').close();
node('record').onsubmit=async event=>{event.preventDefault();node('save').disabled=true;node('error').textContent='';try{await api('/groups/'+selected.id+'/payments','POST',{months:Number(node('months').value),reference:node('reference').value});node('payment').close();await load();}catch(error){node('error').textContent=error.message;}finally{node('save').disabled=false;}};
void load();
</script></main></body></html>`; 