
const STORAGE_KEY='dpr_v3';
let rows=[],editId=null,sortCol='date',sortDir='asc',charts={};
const SYSICO={HVAC:'wind',Electrical:'lightning-charge-fill',Fire:'fire',BMS:'cpu-fill',Civil:'building',Mechanical:'wrench-adjustable-fill'};

function load(){try{rows=JSON.parse(localStorage.getItem(STORAGE_KEY))||[];}catch{rows=[];}if(!rows.length)seed();}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows));const el=document.getElementById('lastSaved');if(el)el.innerHTML=`<i class="bi bi-cloud-check-fill"></i> Saved ${new Date().toLocaleTimeString()}`;}
function autoSt(p,a){const d=p-a;if(a===0&&p===0)return'Not Started';if(a>=100)return'Completed';if(d>5)return'Delayed';if(a>0&&a<p)return'In Progress';return'On Track';}
function seed(){
  const t=new Date().toISOString().split('T')[0];
  const s=[['HVAC','AHU Installation – Level 3',85,78],['Electrical','Main Panel Wiring – B1',100,100],['Fire','Sprinkler Piping – Zone 2',60,45],['BMS','Controller Programming',40,42],['Civil','False Ceiling Works – Level 2',70,65],['Mechanical','Duct Fabrication – Roof',50,30],['HVAC','Chilled Water Pipe Insulation',90,88],['Electrical','Cable Pulling – Floors 1–4',55,60]];
  rows=s.map((x,i)=>({id:Date.now()+i,date:t,system:x[0],activity:x[1],planned:x[2],actual:x[3],status:autoSt(x[2],x[3]),remarks:''}));
  save();
}

function getFiltered(){
  const q=(document.getElementById('searchInput').value||'').toLowerCase();
  const sys=document.getElementById('sysFilter').value;
  const st=document.getElementById('statusFilter').value;
  return rows.filter(r=>(!q||r.activity.toLowerCase().includes(q)||r.system.toLowerCase().includes(q)||(r.remarks||'').toLowerCase().includes(q))&&(!sys||r.system===sys)&&(!st||r.status===st));
}
function getSorted(arr){
  return[...arr].sort((a,b)=>{
    let va=sortCol==='delay'?a.planned-a.actual:a[sortCol];
    let vb=sortCol==='delay'?b.planned-b.actual:b[sortCol];
    if(['planned','actual'].includes(sortCol)){va=+va;vb=+vb;}
    if(va<vb)return sortDir==='asc'?-1:1;
    if(va>vb)return sortDir==='asc'?1:-1;
    return 0;
  });
}
function sortT(col){
  sortDir=sortCol===col?(sortDir==='asc'?'desc':'asc'):'asc';sortCol=col;
  document.querySelectorAll('thead th').forEach(t=>t.classList.remove('asc','desc'));
  const map={date:1,system:2,activity:3,planned:4,actual:5,delay:6,status:7};
  const th=document.querySelectorAll('thead th')[map[col]];
  if(th)th.classList.add(sortDir==='asc'?'asc':'desc');
  render();
}
function applyFilters(){render();}

function render(){
  const tbody=document.getElementById('tBody');
  const filtered=getSorted(getFiltered());
  if(!filtered.length){
    tbody.innerHTML=`<tr><td colspan="10"><div class="empty"><div class="empty-ico"><i class="bi bi-inbox"></i></div><p>No activities found</p><span>Adjust search/filters or add a new activity.</span></div></td></tr>`;
    document.getElementById('rowCount').textContent='0 rows';
    updateCards();updateSbStats();return;
  }
  tbody.innerHTML=filtered.map(rowHTML).join('');
  document.getElementById('rowCount').textContent=`${filtered.length} of ${rows.length} rows`;
  updateCards();updateSbStats();
}

function rowHTML(r){
  const d=r.planned-r.actual;
  const rc=d>5?'row-red':d<=0&&r.actual>0?'row-grn':'';
  const ico=SYSICO[r.system]||'gear';
  const af=d>5?'pf-late':'pf-ok';
  const ap=Math.min(100,Math.max(0,r.actual));
  const dc=d===0?`<span class="delay-chip dc-zero"><i class="bi bi-dash"></i>0%</span>`:d>0?`<span class="delay-chip dc-pos"><i class="bi bi-arrow-up-short"></i>+${d.toFixed(1)}%</span>`:`<span class="delay-chip dc-neg"><i class="bi bi-arrow-down-short"></i>${d.toFixed(1)}%</span>`;
  return`<tr class="${rc}" data-id="${r.id}">
<td class="sel-col"><input type="checkbox" class="rck" onchange="updDelBtn()"></td>
<td><span class="td-date" contenteditable="true" onblur="cEdit(this,'${r.id}','date')">${r.date}</span></td>
<td><span class="sys-p sys-${r.system}"><i class="bi bi-${ico}"></i>${r.system}</span></td>
<td style="max-width:210px;font-weight:500" contenteditable="true" onblur="cEdit(this,'${r.id}','activity')">${r.activity}</td>
<td><div class="prog"><div class="prog-bar"><div class="prog-fill pf-plan" style="width:${r.planned}%"></div></div><span class="prog-n" contenteditable="true" onblur="cEdit(this,'${r.id}','planned')">${r.planned}</span></div></td>
<td><div class="prog"><div class="prog-bar"><div class="prog-fill ${af}" style="width:${ap}%"></div></div><span class="prog-n" contenteditable="true" onblur="cEdit(this,'${r.id}','actual')">${r.actual}</span></div></td>
<td>${dc}</td>
<td>${sBadge(r.status)}</td>
<td class="td-rem" contenteditable="true" onblur="cEdit(this,'${r.id}','remarks')">${r.remarks||''}</td>
<td class="td-act">
  <button class="abt" title="Edit" onclick="openEdit('${r.id}')"><i class="bi bi-pencil-fill"></i></button>
  <button class="abt del" title="Delete" onclick="delRow('${r.id}')"><i class="bi bi-trash3-fill"></i></button>
</td></tr>`;
}

function sBadge(s){
  const m={'On Track':['s-ok','check2-circle'],'Completed':['s-done','patch-check-fill'],'Delayed':['s-dl','exclamation-triangle-fill'],'In Progress':['s-ip','arrow-repeat'],'Not Started':['s-ns','dash-circle']};
  const c=m[s]||m['Not Started'];
  return`<span class="sbadge ${c[0]}"><i class="bi bi-${c[1]}"></i>${s}</span>`;
}

function updateCards(){
  const t=rows.length,ok=rows.filter(r=>(r.planned-r.actual)<=0||r.status==='On Track'||r.status==='Completed').length;
  const dl=rows.filter(r=>(r.planned-r.actual)>5).length;
  const avg=t?(rows.reduce((s,r)=>s+r.actual,0)/t).toFixed(1):0;
  document.getElementById('card-total').textContent=t;
  document.getElementById('card-done').textContent=ok;
  document.getElementById('card-delayed').textContent=dl;
  document.getElementById('card-progress').textContent=avg+'%';
  document.getElementById('nb-total').textContent=t;
  document.getElementById('nb-delayed').textContent=dl;
  if(document.getElementById('cb-tot'))document.getElementById('cb-tot').textContent=t+' items';
}

function updateSbStats(){
  const sys=['HVAC','Electrical','Fire','BMS','Civil','Mechanical'];
  const html=sys.map(s=>{const c=rows.filter(r=>r.system===s).length;if(!c)return'';return`<div class="sb-stat"><span class="sys"><i class="bi bi-${SYSICO[s]||'gear'}"></i>${s}</span><span class="cnt">${c}</span></div>`;}).filter(Boolean).join('');
  document.getElementById('sbStats').innerHTML=html||'<div style="color:var(--text3);font-size:12px">No data</div>';
}

function cEdit(el,id,field){
  const r=rows.find(x=>x.id==id);if(!r)return;
  let v=el.textContent.trim();
  if(field==='planned'||field==='actual'){v=Math.min(100,Math.max(0,parseFloat(v)||0));el.textContent=v;r.status=autoSt(field==='planned'?v:r.planned,field==='actual'?v:r.actual);}
  r[field]=v;save();render();
}

function toggleSelAll(cb){document.querySelectorAll('.rck').forEach(c=>c.checked=cb.checked);updDelBtn();}
function updDelBtn(){document.getElementById('deleteSelBtn').style.display=document.querySelectorAll('.rck:checked').length>0?'':'none';}
function deleteSelected(){
  const trs=[...document.querySelectorAll('tbody tr')].filter(t=>t.querySelector('.rck:checked'));
  if(!trs.length)return;if(!confirm(`Delete ${trs.length} row(s)?`))return;
  trs.forEach(t=>rows=rows.filter(r=>r.id!=+t.dataset.id));
  save();render();toast('Rows deleted','bi-trash3-fill','error');
}
function delRow(id){rows=rows.filter(r=>r.id!=id);save();render();toast('Row deleted','bi-trash3-fill','error');}

function openModal(){
  editId=null;
  document.getElementById('mTitle').textContent='Add Activity';
  document.getElementById('mIco').innerHTML='<i class="bi bi-plus-circle-fill"></i>';
  document.getElementById('m-date').value=new Date().toISOString().split('T')[0];
  ['m-activity','m-planned','m-actual','m-remarks'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('m-system').selectedIndex=0;
  document.getElementById('m-status').value='Not Started';
  document.getElementById('ov').classList.add('open');
  setTimeout(()=>document.getElementById('m-activity').focus(),220);
}
function openEdit(id){
  const r=rows.find(x=>x.id==id);if(!r)return;
  editId=id;
  document.getElementById('mTitle').textContent='Edit Activity';
  document.getElementById('mIco').innerHTML='<i class="bi bi-pencil-fill"></i>';
  document.getElementById('m-date').value=r.date;
  document.getElementById('m-system').value=r.system;
  document.getElementById('m-activity').value=r.activity;
  document.getElementById('m-planned').value=r.planned;
  document.getElementById('m-actual').value=r.actual;
  document.getElementById('m-status').value=r.status;
  document.getElementById('m-remarks').value=r.remarks||'';
  document.getElementById('ov').classList.add('open');
}
function closeModal(){document.getElementById('ov').classList.remove('open');}
function saveRow(){
  const date=document.getElementById('m-date').value;
  const system=document.getElementById('m-system').value;
  const activity=document.getElementById('m-activity').value.trim();
  const planned=Math.min(100,Math.max(0,parseFloat(document.getElementById('m-planned').value)||0));
  const actual=Math.min(100,Math.max(0,parseFloat(document.getElementById('m-actual').value)||0));
  const status=document.getElementById('m-status').value;
  const remarks=document.getElementById('m-remarks').value.trim();
  if(!date||!activity){toast('Date and Activity are required','bi-exclamation-circle','error');return;}
  if(editId)Object.assign(rows.find(x=>x.id==editId),{date,system,activity,planned,actual,status,remarks});
  else rows.push({id:Date.now(),date,system,activity,planned,actual,status,remarks});
  save();render();closeModal();
  toast(editId?'Activity updated':'Activity added','bi-check-circle-fill','success');
}
document.getElementById('ov').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});

function exportExcel(){
  if(!rows.length){toast('No data to export','bi-info-circle','info');return;}
  const data=[['Date','System','Activity','Planned %','Actual %','Delay %','Status','Remarks'],...rows.map(r=>[r.date,r.system,r.activity,r.planned,r.actual,(r.planned-r.actual).toFixed(1),r.status,r.remarks||''])];
  const ws=XLSX.utils.aoa_to_sheet(data);
  ws['!cols']=[{wch:12},{wch:14},{wch:40},{wch:10},{wch:10},{wch:10},{wch:14},{wch:30}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Daily Progress Report');
  XLSX.writeFile(wb,`DPR_${new Date().toISOString().split('T')[0]}.xlsx`);
  toast('Excel exported!','bi-file-earmark-check-fill','success');
}

function clearAll(){if(!confirm('Clear ALL data?'))return;rows=[];save();render();toast('All data cleared','bi-trash3-fill','info');}

function renderCharts(){
  const dark=document.documentElement.dataset.theme==='dark';
  const grid=dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';
  const tc=dark?'#4e5478':'#9198b8';
  const font={family:'Plus Jakarta Sans',size:12};
  Chart.defaults.color=tc;Chart.defaults.font=font;
  Object.values(charts).forEach(c=>c.destroy());charts={};

  const sts=['On Track','Completed','In Progress','Delayed','Not Started'];
  const stC=sts.map(s=>rows.filter(r=>r.status===s).length);
  charts.status=new Chart('statusChart',{type:'doughnut',data:{labels:sts,datasets:[{data:stC,backgroundColor:['#059669','#4f46e5','#d97706','#dc2626','#64748b'],borderWidth:0,hoverOffset:8,borderRadius:3}]},options:{responsive:true,cutout:'65%',plugins:{legend:{position:'bottom',labels:{padding:16,font,usePointStyle:true,pointStyleWidth:8}}}}});

  const sys=['HVAC','Electrical','Fire','BMS','Civil','Mechanical'];
  const pl=sys.map(s=>{const rs=rows.filter(r=>r.system===s);return rs.length?+(rs.reduce((a,r)=>a+r.planned,0)/rs.length).toFixed(1):0;});
  const ac=sys.map(s=>{const rs=rows.filter(r=>r.system===s);return rs.length?+(rs.reduce((a,r)=>a+r.actual,0)/rs.length).toFixed(1):0;});
  charts.system=new Chart('systemChart',{type:'bar',data:{labels:sys,datasets:[{label:'Planned %',data:pl,backgroundColor:'rgba(2,132,199,.65)',borderRadius:5,borderSkipped:false},{label:'Actual %',data:ac,backgroundColor:'rgba(79,70,229,.75)',borderRadius:5,borderSkipped:false}]},options:{responsive:true,scales:{x:{grid:{color:grid}},y:{grid:{color:grid},max:100,ticks:{stepSize:25}}},plugins:{legend:{labels:{font,usePointStyle:true,pointStyleWidth:8}}}}});

  const lbs=rows.slice(0,10).map(r=>r.activity.slice(0,24)+(r.activity.length>24?'…':''));
  const cv=document.getElementById('barChart');cv.height=Math.max(180,rows.slice(0,10).length*40);
  charts.bar=new Chart('barChart',{type:'bar',data:{labels:lbs,datasets:[{label:'Planned %',data:rows.slice(0,10).map(r=>r.planned),backgroundColor:'rgba(2,132,199,.55)',borderRadius:4,borderSkipped:false},{label:'Actual %',data:rows.slice(0,10).map(r=>r.actual),backgroundColor:'rgba(79,70,229,.75)',borderRadius:4,borderSkipped:false}]},options:{indexAxis:'y',responsive:true,scales:{x:{grid:{color:grid},max:100},y:{grid:{display:false}}},plugins:{legend:{labels:{font,usePointStyle:true,pointStyleWidth:8}}}}});

  const dd=rows.map(r=>({x:r.planned,y:+(r.planned-r.actual).toFixed(1)}));
  charts.delay=new Chart('delayChart',{type:'scatter',data:{datasets:[{label:'Delay',data:dd,backgroundColor:dd.map(d=>d.y>5?'rgba(220,38,38,.7)':d.y<=0?'rgba(5,150,105,.7)':'rgba(217,119,6,.7)'),pointRadius:8,pointHoverRadius:11}]},options:{responsive:true,scales:{x:{title:{display:true,text:'Planned %',font},grid:{color:grid}},y:{title:{display:true,text:'Delay %',font},grid:{color:grid}}},plugins:{legend:{display:false}}}});
}

function toggleTheme(){
  const d=document.documentElement.dataset.theme==='dark';
  document.documentElement.dataset.theme=d?'light':'dark';
  document.getElementById('themeBtn').innerHTML=d?'<i class="bi bi-moon-stars-fill"></i>':'<i class="bi bi-sun-fill"></i>';
  if(document.getElementById('view-charts').classList.contains('active'))renderCharts();
}

function toggleSb(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sbOv').classList.toggle('open');}
function switchView(name,btn){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(name==='charts')setTimeout(renderCharts,60);
  if(window.innerWidth<768)toggleSb();
}

function updateClock(){document.getElementById('liveClock').textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
setInterval(updateClock,1000);updateClock();

function toast(msg,icon='bi-info-circle',type='info'){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<div class="t-ico"><i class="bi ${icon}"></i></div><span class="t-msg">${msg}</span>`;
  document.getElementById('toastDock').appendChild(el);
  setTimeout(()=>{el.style.transition='opacity .3s';el.style.opacity='0';setTimeout(()=>el.remove(),320);},2800);
}

document.addEventListener('DOMContentLoaded',()=>{
  load();render();
  document.getElementById('todayDate').textContent=new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeModal();
  if(e.ctrlKey&&e.key==='n'){e.preventDefault();openModal();}
  if(e.ctrlKey&&e.key==='e'){e.preventDefault();exportExcel();}
});
