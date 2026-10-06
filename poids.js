// ══════════════════════════════════════════════════════════════
// KeyFit — le poids et les mensurations
// Module isolé : ce fichier ne contient que le poids et les mensurations.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function openBodyComp(){
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('bc-date').value=today;
  ['bc-eau','bc-muscle','bc-graisse','bc-os'].forEach(i=>{document.getElementById(i).value='';});
  delete document.getElementById('bc-date').dataset.editId;
  openModal('modal-body-comp');
  renderBcHistory();
}
function openMensurations(){
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('mens-date').value=today;
  MENS_FIELDS.forEach(f=>{const e=document.getElementById('mens-'+f.id);if(e)e.value='';});
  delete document.getElementById('mens-date').dataset.editId;
  openModal('modal-mensurations');
  renderMensHistory();
}
function renderWeightChart(){
  const hist=(ST.weightHistory||[]).slice(-20);
  const wrap=document.getElementById('weight-chart-wrap');
  if(!hist.length){
    if(_wChart){_wChart.destroy();_wChart=null;}
    wrap.innerHTML=`<div class="chart-empty"><div style="font-size:32px;">⚖️</div><div>Aucune donnée encore.<br>Enregistre ton poids pour voir ta courbe de progression.</div></div>`;
    return;
  }
  wrap.innerHTML='<div style="height:150px;position:relative;"><canvas id="weightChart"></canvas></div>';
  const labels=hist.map(h=>h.date.slice(5).split('-').reverse().join('/'));
  const data=hist.map(h=>unit==='imperial'?Math.round(h.value*2.2046*10)/10:h.value);
  if(_wChart){_wChart.destroy();_wChart=null;}
  const ctx=document.getElementById('weightChart');if(!ctx)return;
  // Points cachés sauf le dernier (style démo Apple)
  const ptRadius=data.map((_,i)=>i===data.length-1?5:0);
  _wChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{data,borderColor:getAccentColorLite(),backgroundColor:getAccentColorAlpha(.14),borderWidth:2.5,pointBackgroundColor:getAccentColorLite(),pointRadius:ptRadius,pointHoverRadius:5,tension:.4,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:true}},scales:{x:{display:false,grid:{display:false}},y:{display:false,grid:{display:false}}}}});
}
function renderWeightHist(){
  const hist=(ST.weightHistory||[]).slice().reverse().slice(0,8);
  const el=document.getElementById('weight-hist');
  if(el) el.innerHTML=hist.map(h=>`<div class="wrow"><span class="wrow-date">${h.date.slice(5).split('-').reverse().join('/')}</span><span class="wrow-val">${fmtW(h.value)}</span><button class="wrow-del" onclick="deleteWeight('${h.id}')">✕</button></div>`).join('');
  // Restaurer l'état replié
  try{
    const states={...JSON.parse(localStorage.getItem('kf-hist-state')||'{}'),...(ST.uiState||{})};
    const wrap=document.getElementById('weight-hist-wrap');
    const btn=document.getElementById('btn-weight-hist-wrap');
    if(wrap&&states['weight-hist-wrap']===false){
      wrap.style.display='none';
      if(btn)btn.textContent='▸ Historique';
    }
  }catch(e){}
}
function saveWeight(){
  const date=document.getElementById('poids-date').value,val=parseFloat(document.getElementById('poids-val').value);
  if(!date||isNaN(val)||val<=0){toast('Entre une date et un poids valide','err');return;}
  if(val>300){toast('Poids trop élevé (max 300 kg)','err');return;}
  if(val<20){toast('Poids trop faible (min 20 kg)','err');return;}
  const today=new Date().toISOString().slice(0,10);
  if(date>today){toast('La date ne peut pas être dans le futur','err');return;}
  if(!ST.weightHistory)ST.weightHistory=[];
  // Toujours ajouter une nouvelle entrée — jamais écraser
  // (sauf si même date ET même valeur — doublon exact)
  const exact=ST.weightHistory.find(h=>h.date===date&&h.value===val);
  if(!exact){
    ST.weightHistory.push({date,value:val,id:Date.now()+''});
    ST.weightHistory.sort((a,b)=>a.date.localeCompare(b.date));
  }
  // Mettre à jour le poids actuel dans le profil
  P.poids_actuel=val;
  sb.from('profiles').update({poids_actuel:val}).eq('id',U.id);
  saveState();renderHome();renderProfilePage();closeModal('modal-poids');toast('✓ Poids enregistré','ok');
  checkAchievements();
}
function deleteWeight(id){ST.weightHistory=(ST.weightHistory||[]).filter(h=>h.id!==id);saveState();renderHome();}
function saveBodyComp(){
  const dateEl=document.getElementById('bc-date');
  const date=dateEl.value;
  if(!date){toast('Entre une date','err');return;}
  const editId=dateEl.dataset.editId||null;
  const vals={
    eau:parseFloat(document.getElementById('bc-eau').value)||null,
    muscle:parseFloat(document.getElementById('bc-muscle').value)||null,
    graisse:parseFloat(document.getElementById('bc-graisse').value)||null,
    os:parseFloat(document.getElementById('bc-os').value)||null
  };
  if(!vals.eau&&!vals.muscle&&!vals.graisse&&!vals.os){toast('Remplis au moins un champ','err');return;}
  if(!ST.bodyComp)ST.bodyComp=[];
  if(editId){
    const i=ST.bodyComp.findIndex(e=>e.id===editId);
    if(i>=0)ST.bodyComp[i]={...ST.bodyComp[i],date,...vals};
    delete dateEl.dataset.editId;
  } else {
    ST.bodyComp.push({id:Date.now()+'',date,...vals});
  }
  ST.bodyComp.sort((a,b)=>a.date.localeCompare(b.date));
  ['bc-eau','bc-muscle','bc-graisse','bc-os'].forEach(id=>document.getElementById(id).value='');
  saveState();renderBcHistory();renderBodyCompCard();
  toast(editId?'✓ Mis à jour':'✓ Composition enregistrée','ok');
}
function renderBodyCompCard(){
  const card=document.getElementById('pr-body-comp-card');
  const el=document.getElementById('pr-body-comp-display');
  if(!card||!el)return;
  const entries=(ST.bodyComp||[]).slice().reverse().slice(0,3);
  if(!entries.length){
    el.innerHTML='<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0;">Aucune mesure. Appuie sur le crayon ✎ pour en ajouter une.</div>';
    return;
  }
  const last=entries[0];
  let h='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">';
  if(last.eau!=null)h+='<div class="stat"><div class="stat-lbl">Eau</div><div class="stat-val" style="font-size:22px;color:#3b82f6;">'+last.eau+'%</div></div>';
  if(last.muscle!=null)h+='<div class="stat"><div class="stat-lbl">Muscle</div><div class="stat-val" style="font-size:22px;color:var(--green);">'+last.muscle+'%</div></div>';
  if(last.graisse!=null)h+='<div class="stat"><div class="stat-lbl">Graisse</div><div class="stat-val" style="font-size:22px;color:var(--orange);">'+last.graisse+'%</div></div>';
  if(last.os!=null)h+='<div class="stat"><div class="stat-lbl">Os</div><div class="stat-val" style="font-size:22px;color:var(--muted);">'+last.os+' kg</div></div>';
  h+='</div>';
  el.innerHTML=h;
}
function saveMensurations(){
  const date=document.getElementById('mens-date').value;
  if(!date){toast('Entre une date','err');return;}
  const editId=document.getElementById('mens-date').dataset.editId||null;
  const entry={id:editId||Date.now()+'',date};
  let hasData=false;
  MENS_FIELDS.forEach(f=>{const v=parseFloat(document.getElementById('mens-'+f.id)?.value);if(!isNaN(v)&&v>0){entry[f.id]=v;hasData=true;}});
  if(!hasData){toast('Remplis au moins une mesure','err');return;}
  if(!ST.mensurations)ST.mensurations=[];
  if(editId){
    const i=ST.mensurations.findIndex(e=>e.id===editId);
    if(i>=0)ST.mensurations[i]=entry; else ST.mensurations.push(entry);
    delete document.getElementById('mens-date').dataset.editId;
  } else {
    ST.mensurations.push(entry);
  }
  ST.mensurations.sort((a,b)=>a.date.localeCompare(b.date));
  MENS_FIELDS.forEach(f=>{const el=document.getElementById('mens-'+f.id);if(el)el.value='';});
  saveState();renderMensHistory();renderMensurationsCard();
  toast(editId?'✓ Mis à jour':'✓ Mensurations enregistrées','ok');
  checkAchievements();
}
function renderMensurationsCard(){
  const card=document.getElementById('pr-mensurations-card');
  const el=document.getElementById('pr-mensurations-display');
  if(!card||!el)return;
  const entries=(ST.mensurations||[]).slice().reverse();
  if(!entries.length){
    el.innerHTML='<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0;">Aucune mesure. Appuie sur le crayon ✎ pour en ajouter une.</div>';
    return;
  }
  const last=entries[0],prev=entries[1];
  let h='<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Dernière mesure — '+last.date.slice(5).split('-').reverse().join('/')+'</div>';
  const LABELS={cou:'Cou',epaules:'Epaules',poitrine:'Poitrine',bras:'Bras',avantbras:'Avant-bras',nombril:'Nombril',hanches:'Hanches',cuisses:'Cuisses',mollets:'Mollets'};
  Object.keys(LABELS).forEach(k=>{
    if(!last[k])return;
    const diff=prev&&prev[k]?Math.round((last[k]-prev[k])*10)/10:null;
    const diffStr=diff!=null?'<span style="font-size:12px;font-weight:600;color:'+(diff<0?'var(--green)':diff>0?'var(--red)':'var(--muted)')+';">'+(diff>0?'+':'')+diff+' cm</span>':'';
    h+='<div class="irow"><span class="ik">'+LABELS[k]+'</span><div style="display:flex;align-items:center;gap:8px;"><span class="iv">'+last[k]+' cm</span>'+diffStr+'</div></div>';
  });
  el.innerHTML=h;
}
function bodySVG(side){
  // Silhouette humaine stylisée (proportions réelles, membres reliés).
  // Base = .body-base, zones musculaires = .mz avec id m-xxx(-l/-r).
  const base=`
    <circle class="body-base" cx="100" cy="28" r="20"/>
    <rect class="body-base" x="89" y="44" width="22" height="16" rx="7"/>
    <path class="body-base" d="M58 64 Q100 54 142 64 Q150 68 152 78 L146 128 Q144 158 136 180 L134 204 Q100 216 66 204 L64 180 Q56 158 54 128 L48 78 Q50 68 58 64 Z"/>
    <rect class="body-base" x="30" y="70" width="22" height="66" rx="11" transform="rotate(7 41 103)"/>
    <rect class="body-base" x="148" y="70" width="22" height="66" rx="11" transform="rotate(-7 159 103)"/>
    <rect class="body-base" x="24" y="132" width="19" height="64" rx="9.5" transform="rotate(5 33 164)"/>
    <rect class="body-base" x="157" y="132" width="19" height="64" rx="9.5" transform="rotate(-5 167 164)"/>
    <ellipse class="body-base" cx="28" cy="204" rx="9" ry="12"/>
    <ellipse class="body-base" cx="172" cy="204" rx="9" ry="12"/>
    <rect class="body-base" x="60" y="204" width="32" height="98" rx="16"/>
    <rect class="body-base" x="108" y="204" width="32" height="98" rx="16"/>
    <rect class="body-base" x="66" y="296" width="24" height="94" rx="12"/>
    <rect class="body-base" x="110" y="296" width="24" height="94" rx="12"/>
    <ellipse class="body-base" cx="78" cy="398" rx="14" ry="8"/>
    <ellipse class="body-base" cx="122" cy="398" rx="14" ry="8"/>`;
  if(side==='front'){
    return `<svg viewBox="0 0 200 415" style="width:100%;height:100%;">${base}
      <ellipse class="mz" id="m-deltoides-ant-l" cx="60" cy="74" rx="13" ry="11"/>
      <ellipse class="mz" id="m-deltoides-ant-r" cx="140" cy="74" rx="13" ry="11"/>
      <ellipse class="mz" id="m-deltoides-lat-l" cx="45" cy="83" rx="9" ry="13" transform="rotate(12 45 83)"/>
      <ellipse class="mz" id="m-deltoides-lat-r" cx="155" cy="83" rx="9" ry="13" transform="rotate(-12 155 83)"/>
      <path class="mz" id="m-pecs" d="M66 76 Q100 66 134 76 Q139 95 128 104 Q113 110 100 106 Q87 110 72 104 Q61 95 66 76 Z"/>
      <rect class="mz" id="m-abdos" x="85" y="112" width="30" height="56" rx="9"/>
      <line x1="100" y1="116" x2="100" y2="164" stroke="#232329" stroke-width="2"/>
      <line x1="87" y1="130" x2="113" y2="130" stroke="#232329" stroke-width="2"/>
      <line x1="87" y1="148" x2="113" y2="148" stroke="#232329" stroke-width="2"/>
      <path class="mz" id="m-obliques-l" d="M82 114 Q73 119 72 136 L76 162 Q80 166 83 161 L83 119 Z"/>
      <path class="mz" id="m-obliques-r" d="M118 114 Q127 119 128 136 L124 162 Q120 166 117 161 L117 119 Z"/>
      <ellipse class="mz" id="m-biceps-l" cx="42" cy="102" rx="10" ry="18" transform="rotate(7 42 102)"/>
      <ellipse class="mz" id="m-biceps-r" cx="158" cy="102" rx="10" ry="18" transform="rotate(-7 158 102)"/>
      <ellipse class="mz" id="m-avant-bras-l" cx="34" cy="162" rx="8" ry="23" transform="rotate(5 34 162)"/>
      <ellipse class="mz" id="m-avant-bras-r" cx="166" cy="162" rx="8" ry="23" transform="rotate(-5 166 162)"/>
      <ellipse class="mz" id="m-quadriceps-l" cx="76" cy="252" rx="14" ry="42"/>
      <ellipse class="mz" id="m-quadriceps-r" cx="124" cy="252" rx="14" ry="42"/>
      <ellipse class="mz" id="m-adducteurs-l" cx="94" cy="240" rx="7" ry="30"/>
      <ellipse class="mz" id="m-adducteurs-r" cx="106" cy="240" rx="7" ry="30"/>
      <ellipse class="mz" id="m-mollets-l" cx="78" cy="338" rx="9" ry="28"/>
      <ellipse class="mz" id="m-mollets-r" cx="122" cy="338" rx="9" ry="28"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 200 415" style="width:100%;height:100%;">${base}
    <path class="mz" id="m-trapezes" d="M78 58 Q100 50 122 58 L112 94 Q100 100 88 94 Z"/>
    <ellipse class="mz" id="m-deltoides-post-l" cx="58" cy="76" rx="13" ry="11"/>
    <ellipse class="mz" id="m-deltoides-post-r" cx="142" cy="76" rx="13" ry="11"/>
    <path class="mz" id="m-dorsaux" d="M64 92 Q100 84 136 92 L130 132 Q118 154 100 160 Q82 154 70 132 Z"/>
    <ellipse class="mz" id="m-triceps-l" cx="42" cy="104" rx="10" ry="19" transform="rotate(7 42 104)"/>
    <ellipse class="mz" id="m-triceps-r" cx="158" cy="104" rx="10" ry="19" transform="rotate(-7 158 104)"/>
    <rect class="mz" id="m-lombaires" x="86" y="160" width="28" height="26" rx="8"/>
    <path class="mz" id="m-fessiers" d="M68 188 Q100 178 132 188 Q138 210 124 218 Q112 223 100 218 Q88 223 76 218 Q62 210 68 188 Z"/>
    <ellipse class="mz" id="m-ischios-l" cx="76" cy="258" rx="13" ry="38"/>
    <ellipse class="mz" id="m-ischios-r" cx="124" cy="258" rx="13" ry="38"/>
    <ellipse class="mz" id="m-mollets-l" cx="78" cy="342" rx="10" ry="30"/>
    <ellipse class="mz" id="m-mollets-r" cx="122" cy="342" rx="10" ry="30"/>
  </svg>`;
}
