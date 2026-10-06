// ══════════════════════════════════════════════════════════════
// KeyFit — la nutrition et les compléments
// Module isolé : ce fichier ne contient que la nutrition et les compléments.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function computeNutrition(genre,age,h,w,activite,objectif,rythme){
  age=age||25; h=h||170; w=w||70; rythme=rythme||'Modéré';
  // BMR — Mifflin-St Jeor (référence actuelle)
  const bmr = 10*w + 6.25*h - 5*age + (genre==='Femme'?-161:5);
  // TDEE — facteur d'activité
  const actM={'Sédentaire':1.2,'Peu actif':1.375,'Modérément actif':1.55,'Très actif':1.725};
  const tdee = Math.round(bmr*(actM[activite]||1.375));
  // Déficit/surplus FIXE en kcal, basé sur le rythme (1 kg ≈ 7700 kcal)
  // Doux=0.25kg/sem, Modéré=0.5kg/sem, Rapide=0.75kg/sem
  const kgParSem={'Doux':.25,'Modéré':.5,'Rapide':.75}[rythme]||.5;
  const kcalDelta=Math.round(kgParSem*7700/7); // déficit/surplus journalier
  let kcal;
  if(objectif==='Perdre du poids')        kcal=tdee-kcalDelta;
  else if(objectif==='Prendre du muscle') kcal=tdee+kcalDelta;
  else if(objectif==='Performance')       kcal=Math.round(tdee*1.05);
  else                                    kcal=tdee; // Recomposition / Maintien
  // Garde-fou : ne jamais descendre sous le métabolisme de base (BMR)
  kcal=Math.max(Math.round(bmr), kcal);
  // Protéines (g/kg) et lipides (% kcal) selon l'objectif
  const protRatio={'Perdre du poids':2.0,'Prendre du muscle':1.8,'Recomposition':2.2,'Performance':1.6,'Maintien':1.6}[objectif]||1.8;
  const lipPct={'Perdre du poids':.28,'Prendre du muscle':.25,'Recomposition':.27,'Performance':.25,'Maintien':.30}[objectif]||.28;
  let prot=Math.round(w*protRatio);
  let lip=Math.round(kcal*lipPct/9);
  let gluc=Math.round((kcal-prot*4-lip*9)/4);
  // Rééquilibrage : garantir un minimum de glucides (~2g/kg) en réduisant les protéines si besoin
  const glucMin=Math.round(w*2);
  if(gluc<glucMin){
    gluc=glucMin;
    prot=Math.max(Math.round(w*1.6),Math.round((kcal-gluc*4-lip*9)/4));
  }
  gluc=Math.max(0,gluc);
  // Eau — recommandation EFSA : ~2.5L homme / 2L femme de base,
  // + léger bonus activité, plafonné pour rester réaliste
  const eauBase=genre==='Femme'?2.0:2.5;
  const eauBonus={'Sédentaire':0,'Peu actif':.1,'Modérément actif':.3,'Très actif':.5}[activite]||.1;
  const eau=Math.min(3.5, Math.round((eauBase+eauBonus)*10)/10);
  // Fibres — 14g/1000kcal (EFSA), plancher officiel 25g F / 30g H
  const fibres=Math.max(genre==='Femme'?25:30, Math.round(kcal/1000*14));
  return {kcal,prot,gluc,lip,fibres,eau,kcalOff:Math.round(kcal*.9),kcalOn:Math.round(kcal*1.1)};
}
function maybeShowMacroUpdateNotice(){
  if(!U)return;
  // Le flag est stocké dans le cloud (profil) → définitif sur tous les appareils
  if(P&&P.macro_notice_seen)return;
  if(!ST.nutrition)return; // pas encore configuré, pas concerné
  // Les comptes créés avec la nouvelle formule sont déjà à jour → pas de notice
  if(P&&P.rythme){dismissMacroNotice(true);return;}
  setTimeout(()=>{openModal('modal-macro-notice');}, 1000);
}
async function dismissMacroNotice(silent){
  if(!silent)closeModal('modal-macro-notice');
  if(P)P.macro_notice_seen=true;
  if(U&&sb){
    try{
      await sb.from('profiles').update({macro_notice_seen:true}).eq('id',U.id);
      if(P)localStorage.setItem('kf-profile-'+U.id, JSON.stringify(P));
    }catch(e){}
  }
}

// ══════════ COMPLÉMENTS ══════════
// Les statuts restent stockés tels quels (avec leur emoji) pour ne rien casser
// sur les comptes existants ; l'affichage, lui, passe par ce tableau.
const COMP_STATUTS=[
  {k:'✅ En cours',      l:'En cours', c:'var(--green)'},
  {k:'⏸ Pause',          l:'Pause',    c:'var(--orange)'},
  {k:'📅 Prévu',         l:'Prévu',    c:'var(--ac2)'},
  {k:'✓ Cure terminée', l:'Terminé',  c:'#8E8E93'},
];
let _compFiltre='tous';
function compStatut(c){
  return COMP_STATUTS.find(s=>s.k===(c.status||'✅ En cours'))||COMP_STATUTS[0];
}
// Ce que les compléments EN COURS apportent chaque jour.
function compApportsJour(){
  const t={kcal:0,prot:0,gluc:0,lip:0};
  (ST.complements||[]).forEach(c=>{
    if(c.status!=='✅ En cours'||!c.nutri)return;
    ['kcal','prot','gluc','lip'].forEach(k=>t[k]+=(+c.nutri[k]||0));
  });
  return t;
}
function compJoursEcoules(c){
  if(!c.dur||!c.dur.start)return 0;
  return Math.floor((new Date()-new Date(c.dur.start))/86400000)+1;
}
function compProgression(c){
  if(!c.dur||!c.dur.days)return null;
  if(c.status==='📅 Prévu')return null;
  if(c.status==='✓ Cure terminée')return 100;
  const e=Math.min(c.dur.days,Math.max(1,compJoursEcoules(c)));
  return Math.round(e/c.dur.days*100);
}
function compLigneDuree(c){
  const st=c.status||'✅ En cours';
  if(st==='📅 Prévu'){
    if(!c.dur||!c.dur.start)return 'Pas encore démarré';
    const d=new Date(c.dur.start);
    return 'Démarre le '+d.toLocaleDateString('fr-FR',{day:'numeric',month:'long'});
  }
  if(st==='✓ Cure terminée')return c.dur&&c.dur.days?'Cure bouclée · '+c.dur.days+' j':'Cure bouclée';
  if(st==='⏸ Pause')return c.dur&&c.dur.days?'En pause · cure de '+c.dur.days+' j':'En pause';
  if(!c.dur||!c.dur.days)return 'En continu, sans date de fin';
  const tot=c.dur.days, e=compJoursEcoules(c);
  if(e>tot)return 'Cure de '+tot+' j terminée, à renouveler';
  return 'Jour '+Math.max(1,e)+' sur '+tot+' · '+(tot-e)+' j restants';
}
function setCompFiltre(k){_compFiltre=k;renderComplements();}

function renderComplements(){
  const comps=ST.complements||[];
  const el=document.getElementById('complements-list');
  if(!el)return;
  if(!comps.length){
    el.innerHTML='<p style="font-size:13px;color:var(--muted);text-align:center;padding:16px 0;">Aucun complément ajouté.<br>Appuie sur le crayon pour en ajouter.</p>';
    return;
  }
  // Barre de filtres : un onglet par statut réellement utilisé
  const onglets=[{k:'tous',l:'Tous',c:'var(--ac)'}].concat(COMP_STATUTS);
  if(_compFiltre!=='tous'&&!comps.some(c=>(c.status||'✅ En cours')===_compFiltre))_compFiltre='tous';
  const filtres=onglets.map(o=>{
    const n=o.k==='tous'?comps.length:comps.filter(c=>(c.status||'✅ En cours')===o.k).length;
    if(!n&&o.k!=='tous')return'';
    return `<button class="cf-chip${_compFiltre===o.k?' on':''}" style="--fc:${o.c}" onclick="setCompFiltre('${o.k.replace(/'/g,"\\'")}')">${o.l}<b>${n}</b></button>`;
  }).join('');
  // Sur « Tous », on garde l'ordre des statuts et on aère entre les groupes
  const rang=c=>COMP_STATUTS.findIndex(s=>s.k===(c.status||'✅ En cours'));
  const list=_compFiltre==='tous'
    ? comps.slice().sort((a,b)=>rang(a)-rang(b))
    : comps.filter(c=>(c.status||'✅ En cours')===_compFiltre);
  let prec=null;
  const cartes=list.map(c=>{
    const s=compStatut(c), pct=compProgression(c);
    const sep=(_compFiltre==='tous'&&prec&&prec!==c.status)?' sep':'';
    prec=c.status;
    const prot=c.nutri&&+c.nutri.prot?(+c.nutri.prot)+' g prot':'';
    return `<div class="ccard${sep}${s.k==='✓ Cure terminée'?' off':''}" style="--cc:${s.c}" onclick="editComplement('${c.id}')">
      <div class="cc-top"><div class="cc-nm">${c.name}</div>
        <span class="cc-dose">${c.dose||'—'}</span></div>
      <div class="cc-sub"><span class="st">${s.l}</span><span class="txt">${compLigneDuree(c)}</span>
        ${prot?`<span class="nut">${prot}</span>`:''}</div>
      ${pct!==null?`<div class="cc-prog"><i style="width:${pct}%"></i></div>`:''}
    </div>`;
  }).join('');
  el.innerHTML=`<div class="cf-filters">${filtres}</div>${cartes}`;
}

function saveComplement(){
  const name = document.getElementById('comp-name').value.trim();
  const dose = document.getElementById('comp-dose').value.trim();
  const status = OB['comp-status'] || '✅ En cours';
  if(!name){toast('Donne un nom au complément','err');return;}
  if(!ST.complements) ST.complements=[];
  const num=id=>parseFloat(document.getElementById(id).value)||0;
  const durOn=document.getElementById('sw-comp-dur').classList.contains('on');
  const jours=num('comp-days');
  const dur=durOn&&jours>0
    ? {start:document.getElementById('comp-start').value||new Date().toISOString().slice(0,10),days:jours}
    : null;
  const nutriOn=document.getElementById('sw-comp-nutri').classList.contains('on');
  const nutri=nutriOn
    ? {kcal:num('comp-kcal'),prot:num('comp-prot'),gluc:num('comp-gluc'),lip:num('comp-lip')}
    : null;
  const editId = document.getElementById('comp-edit-id').value;
  if(editId){
    const c=ST.complements.find(c=>c.id===editId);
    if(c){c.name=name;c.dose=dose;c.status=status;c.dur=dur;c.nutri=nutri;}
    _compEditId=null;
  }else{
    ST.complements.push({id:Date.now()+'',name,dose,status,dur,nutri});
  }
  saveState();renderComplements();
  try{renderComplementsManager();}catch(e){}
  try{renderNutrition();}catch(e){}
  closeModal('modal-add-complement');
  resetComplementForm();
  toast('✓ Complément sauvegardé','ok');
}
// Remet le formulaire à zéro : les deux blocs optionnels repartent fermés.
function resetComplementForm(){
  document.getElementById('comp-name').value='';
  document.getElementById('comp-dose').value='';
  document.getElementById('comp-edit-id').value='';
  document.getElementById('comp-modal-ttl').textContent='+ Complément alimentaire';
  document.getElementById('comp-start').value=new Date().toISOString().slice(0,10);
  document.getElementById('comp-days').value='';
  ['kcal','prot','gluc','lip'].forEach(k=>document.getElementById('comp-'+k).value='');
  setCompSwitch('dur',false);setCompSwitch('nutri',false);
  OB['comp-status']='✅ En cours';
  document.querySelectorAll('#chips-comp-status .chip').forEach((c,i)=>c.classList.toggle('on',i===0));
}
function setCompSwitch(quoi,on){
  const sw=document.getElementById('sw-comp-'+quoi);
  const box=document.getElementById('comp-'+quoi+'-fields');
  if(!sw||!box)return;
  sw.classList.toggle('on',!!on);
  box.style.display=on?'block':'none';
}
function toggleCompDur(){
  setCompSwitch('dur',!document.getElementById('sw-comp-dur').classList.contains('on'));
}
function toggleCompNutri(){
  setCompSwitch('nutri',!document.getElementById('sw-comp-nutri').classList.contains('on'));
}
function openAddComplementFromMgr(){
  resetComplementForm();
  openModal('modal-add-complement');
}
function showCompMenu(id, btn){
  closeExoMenu();
  const rect=btn.getBoundingClientRect();
  const menu=document.createElement('div');
  menu.className='exo-menu';
  menu.innerHTML=`
    <button class="exo-menu-item" onclick="closeExoMenu();editComplement('${id}')">Modifier<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="exo-menu-item danger" onclick="closeExoMenu();deleteComplement('${id}')">Supprimer<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`;
  menu.style.top=(rect.bottom+8)+'px';
  const mw2=180;
  menu.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-mw2-10))+'px';
  document.body.appendChild(menu);
  _activeMenu=menu;
  setTimeout(()=>document.addEventListener('click',closeExoMenu,{once:true}),10);
}
function editComplement(id){
  const c=(ST.complements||[]).find(c=>c.id===id);
  if(!c)return;
  resetComplementForm();
  document.getElementById('comp-modal-ttl').textContent='✏️ Modifier le complément';
  document.getElementById('comp-name').value=c.name;
  document.getElementById('comp-dose').value=c.dose||'';
  document.getElementById('comp-edit-id').value=id;
  OB['comp-status']=c.status;
  document.querySelectorAll('#chips-comp-status .chip').forEach(b=>{b.classList.toggle('on',b.textContent.trim()===c.status);});
  if(c.dur&&c.dur.days){
    document.getElementById('comp-start').value=c.dur.start||new Date().toISOString().slice(0,10);
    document.getElementById('comp-days').value=c.dur.days;
    setCompSwitch('dur',true);
  }
  if(c.nutri){
    ['kcal','prot','gluc','lip'].forEach(k=>document.getElementById('comp-'+k).value=c.nutri[k]||'');
    setCompSwitch('nutri',true);
  }
  openModal('modal-add-complement');
}
function deleteComplement(id){
  if(!confirm('Supprimer ce complément ?'))return;
  ST.complements=(ST.complements||[]).filter(c=>c.id!==id);
  saveState();renderComplements();
  try{renderComplementsManager();}catch(e){}
  try{renderNutrition();}catch(e){}
}
function openComplementsManager(){
  renderComplementsManager();
  openModal('modal-complements-mgr');
}
function renderComplementsManager(){
  const comps=ST.complements||[];
  const el=document.getElementById('comp-mgr-list');
  if(!el)return;
  if(!comps.length){
    el.innerHTML='<p style="font-size:14px;color:var(--muted);text-align:center;padding:24px 0;">Aucun complément.<br>Appuie sur « + Ajouter » pour commencer.</p>';
    return;
  }
  el.innerHTML=comps.map(c=>{
    const s=compStatut(c);
    return `<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--bdr);">
    <div style="flex:1;min-width:0;">
      <div style="font-size:16px;font-weight:600;letter-spacing:-.01em;">${c.name}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:2px;">${c.dose||'—'} · <span style="color:${s.c};">${s.l}</span></div>
    </div>
    <button onclick="editComplement('${c.id}')" style="width:34px;height:34px;border-radius:50%;background:var(--surf2);color:var(--muted);border:none;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button onclick="deleteComplement('${c.id}')" style="width:34px;height:34px;border-radius:50%;background:var(--surf2);color:var(--red);border:none;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
  </div>`;}).join('');
}
function openEditNutrition(){
  const n=ST.nutrition||{};
  ['kcal','prot','gluc','lip','fibres'].forEach(k=>document.getElementById('en-'+k).value=n[k]||'');
  document.getElementById('en-eau').value=n.eau||'';
  openModal('modal-nutrition');
}
function saveNutrition(){
  const kcal=parseInt(document.getElementById('en-kcal').value)||0;
  ST.nutrition={kcal,prot:parseInt(document.getElementById('en-prot').value)||0,gluc:parseInt(document.getElementById('en-gluc').value)||0,lip:parseInt(document.getElementById('en-lip').value)||0,fibres:parseInt(document.getElementById('en-fibres').value)||0,eau:parseFloat(document.getElementById('en-eau').value)||0,kcalOff:Math.round(kcal*.9),kcalOn:Math.round(kcal*1.1)};
  saveState();renderNutrition();closeModal('modal-nutrition');toast('✓ Nutrition mise à jour','ok');
}
function renderNutrition(){
  const n=ST.nutrition||{};
  const put=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  // Hero calories
  put('nut-hero-kcal',n.kcal||'—');
  put('nut-hero-sub',P?.objectif?P.objectif:'');
  // Barres de macros (protéines / glucides / lipides) — proportion des calories.
  // La part déjà couverte par les compléments en cours s'affiche en plein,
  // le reste en transparent : les objectifs eux-mêmes ne bougent pas.
  const sup=compApportsJour();
  const bars=document.getElementById('nut-macro-bars');
  if(bars){
    const kp=(n.prot||0)*4,kg=(n.gluc||0)*4,kl=(n.lip||0)*9;
    const tot=kp+kg+kl||1;
    const rows=[
      {l:'Protéines',v:n.prot||0,k:kp,c:'#ef4444',s:sup.prot},
      {l:'Glucides',v:n.gluc||0,k:kg,c:'#f97316',s:sup.gluc},
      {l:'Lipides',v:n.lip||0,k:kl,c:'#f59e0b',s:sup.lip},
    ];
    bars.innerHTML=rows.map(r=>{
      const pct=Math.round(r.k/tot*100);
      const supPct=r.v?Math.min(100,r.s/r.v*100):0;
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;">
          <span style="font-size:14px;font-weight:600;color:var(--txt);letter-spacing:-.006em;">${r.l}</span>
          <span style="font-size:13px;color:var(--muted);"><strong style="color:${r.c};font-size:15px;">${r.v} g</strong> · ${r.s?'dont '+r.s+' g':pct+'%'}</span>
        </div>
        <div style="height:7px;background:var(--surf2);border-radius:4px;overflow:hidden;display:flex;">
          <div style="height:100%;width:${supPct}%;background:${r.c};transition:width .4s;"></div>
          <div style="height:100%;width:${100-supPct}%;background:${r.c};opacity:.28;transition:width .4s;"></div>
        </div>
      </div>`;
    }).join('');
  }
  // Ligne d'explication, affichée seulement si des valeurs sont renseignées
  const note=document.getElementById('nut-supp-note');
  if(note){
    if(sup.kcal||sup.prot){
      note.style.display='block';
      note.innerHTML=`<div style="display:flex;gap:16px;justify-content:center;margin:14px 0 12px;font-size:11.5px;color:var(--muted);">
          <span style="display:flex;align-items:center;gap:6px;"><i style="width:9px;height:9px;border-radius:3px;background:#ef4444;display:block;"></i>Compléments</span>
          <span style="display:flex;align-items:center;gap:6px;"><i style="width:9px;height:9px;border-radius:3px;background:#ef4444;opacity:.28;display:block;"></i>Assiette</span>
        </div>
        <div style="font-size:12.5px;color:var(--muted);line-height:1.55;border-top:1px solid var(--bdr);padding-top:13px;">
          Tes compléments en cours couvrent <strong style="color:var(--txt);">${sup.prot} g de protéines</strong> et <strong style="color:var(--txt);">${sup.kcal} kcal</strong>. Le reste vient de l'assiette.
        </div>`;
    }else{
      note.style.display='none';
      note.innerHTML='';
    }
  }
  put('nut-eau',(n.eau||0)+' L');
  put('nut-fibres',(n.fibres||0)+' g');
  put('nut-off',(n.kcalOff||0)+' kcal');
  put('nut-on',(n.kcalOn||0)+' kcal');
  const conseils={'Perdre du poids':'Déficit modéré. Protéines élevées (2 g/kg) pour préserver le muscle.','Prendre du muscle':'Surplus calorique. Place les glucides avant et après l\'entraînement.','Recomposition':'Calories à maintenance. Protéines très élevées pour changer la composition.','Performance':'Priorité aux glucides complexes. Bonne hydratation avant et après l\'effort.','Maintien':'Écoute ton corps. Mange varié et régulier.'};
  put('nut-conseil',conseils[P?.objectif||'']||'Reste régulier dans ton alimentation.');
  if(_mChart){try{_mChart.destroy();}catch(e){}_mChart=null;}
  const ctx=document.getElementById('macroChart');if(!ctx)return;
  const parent=ctx.parentNode;if(!parent)return;
  const newCanvas=document.createElement('canvas');
  newCanvas.id='macroChart';
  parent.replaceChild(newCanvas,ctx);
  _mChart=new Chart(newCanvas,{type:'doughnut',data:{labels:['Protéines','Glucides','Lipides'],datasets:[{data:[(n.prot||0)*4,(n.gluc||0)*4,(n.lip||0)*9],backgroundColor:['#ef4444','#f97316','#f59e0b'],borderWidth:0,borderRadius:6,spacing:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:true,position:'bottom',labels:{color:'#888',font:{size:11},boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:14}},tooltip:{enabled:false}},events:[]}});
}
