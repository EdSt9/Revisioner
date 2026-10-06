// ══════════════════════════════════════════════════════════════
// KeyFit — le sommeil
// Module isolé : ce fichier ne contient que le sommeil.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function editSleep(dateStr){
  const existing=(ST.sleep||[]).find(s=>s.date===dateStr);
  document.getElementById('sleep-date').value=dateStr;
  document.getElementById('sleep-hours').value=existing&&existing.hours?decToHHMM(existing.hours):'';
  document.getElementById('sleep-bedtime').value=existing&&existing.bedtime?existing.bedtime:'';
  document.getElementById('sleep-waketime').value=existing&&existing.waketime?existing.waketime:'';
  document.getElementById('sleep-nap').value=existing&&existing.nap?existing.nap:'';
  document.getElementById('sleep-hours-hint').textContent='';
  _sleepQual=existing?existing.qual:null;
  document.querySelectorAll('.sleep-qual-btn').forEach(b=>{
    const on=_sleepQual&&b.dataset.q===_sleepQual;
    b.style.borderColor=on?'var(--ac)':'var(--bdr)';
    b.style.color=on?'var(--ac)':'var(--muted)';
    b.style.background='var(--surf2)';
  });
  openModal('modal-sleep');
}
function sleepLabel(hours, qual){
  if(!hours && !qual) return '--';
  if(qual==='mauvais' || (hours&&hours<6))             return 'Insuffisant';
  if(qual==='moyen'   || (hours&&hours<SLEEP_QUOTA))   return 'En dessous';
  if(hours&&hours>9.5)                                 return 'Trop long';
  return 'Optimal'; // 7.5h–9.5h, bon ou excellent
}
function selectSleepQual(btn){
  _sleepQual=btn.dataset.q;
  document.querySelectorAll('.sleep-qual-btn').forEach(b=>{
    const on=b.dataset.q===_sleepQual;
    b.style.borderColor=on?'var(--ac)':'var(--bdr)';
    b.style.color=on?'var(--ac)':'var(--muted)';
    b.style.background='var(--surf2)';
  });
}
function openSleepModal(){
  const today=new Date();
  const ds=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  document.getElementById('sleep-date').value=ds;
  document.getElementById('sleep-hours').value='';
  document.getElementById('sleep-bedtime').value='';
  document.getElementById('sleep-waketime').value='';
  document.getElementById('sleep-hours-hint').textContent='';
  document.getElementById('sleep-nap').value='';
  _sleepQual=null;
  document.querySelectorAll('.sleep-qual-btn').forEach(b=>{
    b.style.borderColor='var(--bdr)';b.style.color='var(--muted)';b.style.background='var(--surf2)';
  });
  // Pré-remplir si données existantes
  const existing=(ST.sleep||[]).find(s=>s.date===ds);
  if(existing){
    document.getElementById('sleep-hours').value=decToHHMM(existing.hours);
    document.getElementById('sleep-bedtime').value=existing.bedtime||'';
    document.getElementById('sleep-waketime').value=existing.waketime||'';
    document.getElementById('sleep-nap').value=existing.nap||'';
    if(existing.qual){
      _sleepQual=existing.qual;
      document.querySelectorAll('.sleep-qual-btn').forEach(b=>{
        const on=b.dataset.q===_sleepQual;
        b.style.borderColor=on?'var(--ac)':'var(--bdr)';
        b.style.color=on?'var(--ac)':'var(--muted)';
      });
    }
  }
  // Calcul auto de la durée quand les deux champs horaires sont remplis
  ['sleep-bedtime','sleep-waketime'].forEach(id=>{
    document.getElementById(id).addEventListener('change', ()=>{
      const b=document.getElementById('sleep-bedtime').value;
      const w=document.getElementById('sleep-waketime').value;
      if(b&&w){
        const [bh,bm]=b.split(':').map(Number);
        const [wh,wm]=w.split(':').map(Number);
        let diff=(wh*60+wm)-(bh*60+bm);
        if(diff<0)diff+=1440;
        const totalMin=diff;
        document.getElementById('sleep-hours').value=String(Math.floor(totalMin/60)).padStart(2,'0')+':'+String(totalMin%60).padStart(2,'0');
        document.getElementById('sleep-hours-hint').textContent='(calculé auto)';
      }
    });
  });
  openModal('modal-sleep');
}
function saveSleep(){
  const date=document.getElementById('sleep-date').value;
  const bedtime=document.getElementById('sleep-bedtime').value||null;
  const waketime=document.getElementById('sleep-waketime').value||null;
  let hours=hhmmToDec(document.getElementById('sleep-hours').value);
  const qual=_sleepQual||null;
  if(!date){toast('Entre une date','err');return;}
  // Calcul auto de la durée si coucher + réveil renseignés et durée vide
  if(bedtime&&waketime&&!hours){
    const [bh,bm]=bedtime.split(':').map(Number);
    const [wh,wm]=waketime.split(':').map(Number);
    let diff=(wh*60+wm)-(bh*60+bm);
    if(diff<0)diff+=1440; // nuit qui passe minuit
    hours=Math.round(diff/60*100)/100;
    document.getElementById('sleep-hours').value=String(Math.floor(diff/60)).padStart(2,'0')+':'+String(diff%60).padStart(2,'0');
  }
  if(!hours&&!qual){toast('Entre au moins la durée ou la qualité','err');return;}
  if(!ST.sleep)ST.sleep=[];
  const existing=ST.sleep.findIndex(s=>s.date===date);
  const nap=parseFloat(document.getElementById('sleep-nap').value)||null;
  const entry={date,hours:hours||null,qual:qual||null,bedtime:bedtime||null,waketime:waketime||null,nap:nap||null};
  if(existing>=0)ST.sleep[existing]=entry;
  else ST.sleep.push(entry);
  ST.sleep.sort((a,b)=>a.date.localeCompare(b.date));
  saveState();
  renderSleepCard();
  renderActivityCalendar();
  closeModal('modal-sleep');
  toast('Sommeil enregistré','ok');
}
function fmtSleep(h){
  if(!h)return '--';
  const hrs=Math.floor(h);
  const mins=Math.round((h-hrs)*60);
  return mins>0?`${hrs}h${String(mins).padStart(2,'0')}`:`${hrs}h`;
}
function renderSleepCard(){
  const el=document.getElementById('sleep-summary');
  const grid=document.getElementById('sleep-grid');
  if(!el||!grid)return;
  const entries=ST.sleep||[];
  const hasData=entries.length>0;
  // Même sans données, on affiche le graphique de la semaine (jours cliquables)

  // ── Semaine lundi→dimanche en cours ──
  const today=new Date();
  const todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  // Trouver le lundi de la semaine en cours
  const dow=(today.getDay()+6)%7; // 0=lundi … 6=dimanche
  const monday=new Date(today); monday.setDate(today.getDate()-dow);
  const last7days=[];
  for(let i=0;i<7;i++){
    const d=new Date(monday); d.setDate(monday.getDate()+i);
    const ds=fmt(d);
    const isFuture=ds>todayStr;
    const entry=isFuture?null:(ST.sleep||[]).find(s=>s.date===ds);
    last7days.push({ds,entry,label:['Lu','Ma','Me','Je','Ve','Sa','Di'][i],isToday:ds===todayStr,isFuture});
  }

  // Total sommeil = nuit + sieste (jours passés seulement)
  const withHours=last7days.filter(d=>!d.isFuture&&d.entry?.hours);
  const totalHours7=last7days.reduce((a,d)=>{
    if(d.isFuture)return a;
    return a+(d.entry?.hours||0)+(d.entry?.nap||0);
  },0);
  const avgHours=withHours.length?totalHours7/withHours.length:0;

  // Quota 7.5h — calculé sur les jours passés seulement (pas les jours futurs)
  const QUOTA=SLEEP_QUOTA;
  const joursPassés=last7days.filter(d=>!d.isFuture).length;
  const optimalTotal=joursPassés*QUOTA;
  const detteH=Math.max(0,Math.round((optimalTotal-totalHours7)*10)/10);
  const excesH=Math.max(0,Math.round((totalHours7-optimalTotal)*10)/10);

  // Score de régularité
  let regularityScore='--';
  const withBedtime=last7days.filter(d=>d.entry?.bedtime);
  if(withBedtime.length>=3){
    const toMin=t=>{const[h,m]=t.split(':').map(Number);return h<12?h*60+m+1440:h*60+m;};
    const mins=withBedtime.map(d=>toMin(d.entry.bedtime));
    const mean=mins.reduce((a,b)=>a+b,0)/mins.length;
    const sd=Math.sqrt(mins.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/mins.length);
    regularityScore=sd<20?'🟢 Top':sd<40?'🟡 Moyen':'🔴 Irrégulier';
  }

  // Bilan
  let bilanHtml='';
  if(withHours.length>=3){
    if(detteH>0){
      bilanHtml=`<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:14px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#ef4444;">
        ⚠️ Il te manque <strong>${fmtSleep(detteH)}</strong> de sommeil cette semaine. Essaie de récupérer progressivement.
      </div>`;
    } else if(excesH>2){
      bilanHtml=`<div style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#6366f1;">
        😴 Tu dors plus que le quota cette semaine. Si c'est récurrent, parles-en à un médecin.
      </div>`;
    } else {
      bilanHtml=`<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:14px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:#22c55e;">
        ✅ Bravo, ton quota de sommeil est atteint cette semaine !
      </div>`;
    }
  }

  const optNights=last7days.filter(d=>sleepLabel(d.entry?.hours,d.entry?.qual)==='Optimal').length;
  const totalNaps=last7days.reduce((a,d)=>a+(d.entry?.nap||0),0);
  el.innerHTML=`
    <div style="text-align:center;padding:8px 0 16px;">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;">Moyenne cette semaine</div>
      <div style="font-size:44px;font-weight:800;letter-spacing:-.03em;color:var(--txt);margin-top:2px;">${fmtSleep(avgHours)}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:2px;">Objectif ${fmtSleep(QUOTA)} par nuit</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
      <div style="background:var(--surf2);border-radius:16px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#22c55e;letter-spacing:-.02em;">${optNights}<span style="font-size:14px;color:var(--muted);font-weight:600;">/7</span></div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">Nuits optimales</div>
      </div>
      <div style="background:var(--surf2);border-radius:16px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;">${regularityScore}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">Régularité</div>
      </div>
      ${totalNaps>0?`
      <div style="background:var(--surf2);border-radius:16px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#6366f1;letter-spacing:-.02em;">${fmtSleep(totalNaps)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">🛋️ Siestes</div>
      </div>
      <div style="background:var(--surf2);border-radius:16px;padding:14px;text-align:center;">
        <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;">${fmtSleep(totalHours7)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">Total (nuit+sieste)</div>
      </div>`:''}
    </div>
    ${bilanHtml}`;

  // ── Graphique ──
  const sessionDates=new Set();
  (ST.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>(e.sessions||[]).forEach(s=>sessionDates.add(s.date))));
  const maxH=Math.max(QUOTA+1,...last7days.map(d=>(d.entry?.hours||0)+(d.entry?.nap||0)));

  const chartBars=last7days.map(({ds,entry,label,isToday,isFuture})=>{
    const h=entry?.hours||0;
    if(isFuture){
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;opacity:.2;">
        <div style="height:16px;"></div>
        <div style="width:70%;background:var(--surf2);border-radius:6px;height:80px;"></div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">${label}</div>
      </div>`;
    }
    if(isToday&&!h){
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;" onclick="openSleepModal()">
        <div style="height:16px;font-size:11px;color:var(--ac);font-weight:700;">+</div>
        <div style="width:70%;background:rgba(99,102,241,.12);border:1px dashed rgba(99,102,241,.4);border-radius:6px;height:80px;"></div>
        <div style="font-size:11px;color:var(--ac);margin-top:6px;font-weight:700;">${label}</div>
      </div>`;
    }
    if(!h){
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;" onclick="editSleep('${ds}')">
        <div style="height:16px;"></div>
        <div style="width:70%;background:var(--surf2);border-radius:6px;height:80px;opacity:.3;"></div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">${label}</div>
      </div>`;
    }
    const napVal=entry?.nap||0;
    const totalH=Math.round((h+napVal)*100)/100;
    const BAR_MAX=80; // hauteur pixel max de la barre
    const GAP=napVal?3:0;
    // Répartition proportionnelle SANS jamais dépasser BAR_MAX (gap inclus)
    const totalPx=Math.max(6,Math.round(totalH/maxH*(BAR_MAX-GAP)));
    const napPx=napVal?Math.max(3,Math.round(napVal/totalH*totalPx)):0;
    const nightPx=Math.max(4,totalPx-napPx);
    const nightColor=sleepColor(h,entry?.qual);
    const bedInfo=entry?.bedtime?`🛌 ${entry.bedtime}`:'';
    const wakeInfo=entry?.waketime?`⏰ ${entry.waketime}`:'';
    const tooltipParts=[fmtSleep(h)+' nuit'+(napVal?` + ${fmtSleep(napVal)} sieste = ${fmtSleep(totalH)}`:''),entry?.qual,bedInfo,wakeInfo].filter(Boolean).join(' · ');
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;"
      onclick="(()=>{let p=document.getElementById('sleep-tip-${ds}');if(p){p.remove();return;}document.querySelectorAll('.sleep-tip').forEach(x=>x.remove());p=document.createElement('div');p.id='sleep-tip-${ds}';p.className='sleep-tip';p.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--surf);border:1px solid var(--bdr);border-radius:14px;padding:8px 14px;font-size:12px;color:var(--txt);z-index:999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.4);';p.textContent='${tooltipParts}';document.body.appendChild(p);setTimeout(()=>p.remove(),2500);editSleep('${ds}');})()" >
      <div style="height:16px;font-size:10px;color:${totalH<6?'#ef4444':'var(--muted)'};font-weight:600;line-height:16px;">${fmtSleep(totalH)}</div>
      <div style="width:70%;height:${BAR_MAX}px;display:flex;flex-direction:column;justify-content:flex-end;">
        ${napPx?`<div style="width:100%;height:${napPx}px;background:#d946ef;border-radius:6px 6px 0 0;margin-bottom:3px;" title="Sieste"></div>`:''}
        <div style="width:100%;height:${nightPx}px;background:${nightColor};border-radius:${napPx?'6px':'6px'};min-height:4px;transition:height .3s;"></div>
      </div>
      <div style="font-size:11px;color:${isToday?'var(--ac)':'var(--muted)'};margin-top:6px;font-weight:${isToday?'700':'400'};">${label}</div>
    </div>`;
  }).join('');

  grid.innerHTML=`
    <div>
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:12px;">7 dernières nuits${!hasData?' · <span style="text-transform:none;color:var(--ac);">appuie sur un jour pour saisir</span>':''}</div>
      <div style="display:flex;gap:6px;align-items:flex-end;">${chartBars}</div>
      ${last7days.some(d=>d.entry?.nap)?`<div style="display:flex;gap:16px;justify-content:center;margin-top:14px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);"><span style="width:10px;height:10px;border-radius:3px;background:linear-gradient(90deg,#ef4444,#f97316,#22c55e);display:inline-block;"></span>Nuit (couleur = qualité)</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);"><span style="width:10px;height:10px;border-radius:3px;background:#d946ef;display:inline-block;"></span>Sieste</div>
      </div>`:''}
    </div>`;
}
