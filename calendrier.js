// ══════════════════════════════════════════════════════════════
// KeyFit — le calendrier
// Module isolé : ce fichier ne contient que le calendrier.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function changeCalMonth(dir){
  const now = new Date();
  const newOffset = _calOffset + dir;
  // Ne pas aller dans le futur
  if(newOffset > 0) return;
  _calOffset = newOffset;
  renderActivityCalendar();
  // Cacher le bouton ▶ si on est au mois actuel
  const nextBtn = document.getElementById('cal-next-btn');
  if(nextBtn) nextBtn.style.opacity = _calOffset >= 0 ? '0.3' : '1';
}
function renderActivityCalendar(){
  const el = document.getElementById('activity-calendar');
  if(!el) return;
  const trainDates = new Set();
  (ST.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>(e.sessions||[]).forEach(s=>trainDates.add(s.date))));
  // Index sommeil par date
  const sleepMap={};
  (ST.sleep||[]).forEach(s=>sleepMap[s.date]=s);
  // Autres sports (natation, foot, vélo...) : ils n'ont ni séries ni charges,
  // donc ils ne sont pas dans ST.days. On les indexe à part pour colorer
  // quand même leur journée, avec la couleur du sport pratiqué.
  const sportMap={};
  (ST.sportSessions||[]).forEach(s=>{ if(s&&s.date)(sportMap[s.date]=sportMap[s.date]||[]).push(s); });
  const couleurSport=s=>{
    const sp=(typeof sportById==='function'&&sportById(s.sport))||null;
    return sp?sp.c:'#8E8E93';
  };
  
  const today = new Date();
  // Fix timezone : utiliser les méthodes locales
  const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const displayDate = new Date(today.getFullYear(), today.getMonth() + _calOffset, 1);
  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const mlEl = document.getElementById('cal-month-label');
  if(mlEl) mlEl.textContent = monthNames[displayDate.getMonth()] + ' ' + displayDate.getFullYear();
  
  const days = ['L','M','M','J','V','S','D'];
  let html2 = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;">';
  days.forEach(d => { html2 += `<div style="text-align:center;font-size:12px;font-weight:700;color:var(--muted);padding:4px 0;">${d}</div>`; });
  html2 += '</div><div class="cal-grid">';
  
  const firstDay = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1);
  const lastDay = new Date(displayDate.getFullYear(), displayDate.getMonth()+1, 0);
  const dow = (firstDay.getDay()+6)%7;
  const startDay = new Date(firstDay);
  startDay.setDate(firstDay.getDate() - dow);
  const totalDays = Math.ceil((dow + lastDay.getDate()) / 7) * 7;
  
  for(let i=0; i<totalDays; i++){
    const d = new Date(startDay);
    d.setDate(startDay.getDate()+i);
    // Fix timezone : utiliser les méthodes locales pour éviter le décalage UTC
    const year = d.getFullYear();
    const month = String(d.getMonth()+1).padStart(2,'0');
    const day2 = String(d.getDate()).padStart(2,'0');
    const dateStr = year+'-'+month+'-'+day2;
    const isToday = dateStr === todayStr;
    // On compare des CHAINES de date, jamais des horodatages : « aujourd'hui »
    // ne doit jamais tomber côté futur selon l'heure qu'il est.
    const isFuture = dateStr > todayStr;
    const isOtherMonth = d.getMonth() !== displayDate.getMonth();
    const isTrain = trainDates.has(dateStr) && !isFuture;
    const sportsDuJour = (!isOtherMonth && !isFuture) ? (sportMap[dateStr]||[]) : [];
    const aDuSport = isTrain || sportsDuJour.length > 0;
    const plan = plannedOf(dateStr);

    let cls = 'cal-day';
    if(aDuSport) cls += ' active';
    if(plan && !aDuSport && !isOtherMonth) cls += (isFuture||isToday) ? ' planned-future' : ' planned';
    if(isToday) cls += ' today';
    if(isOtherMonth) cls += ' other-month';
    
    const dayNum = d.getDate();
    const sleepEntry = sleepMap[dateStr];
    let sleepDot = '';
    if(sleepEntry && !isFuture && !isOtherMonth){
      const sc = sleepColor(sleepEntry.hours, sleepEntry.qual);
      sleepDot = `<div class="cal-sleep-d" style="background:${sc};"></div>`;
    }
    // Passé et aujourd'hui : le bilan du jour. Futur : programmer une séance.
    const clickable = !isOtherMonth;
    // Aujourd'hui sans séance encore faite : on programme. Avec une séance
    // déjà faite, ou dans le passé : on consulte le bilan.
    // Aujourd'hui : dès qu'il y a quelque chose à voir — une séance OU une nuit
    // enregistrée — on ouvre le bilan. Sinon on propose de programmer.
    const proposePlan = isFuture;   // aujourd'hui ouvre le bilan, qui contient le bouton
    const clickAttr = !clickable ? ''
      : (proposePlan ? `onclick="openPlanDay('${dateStr}')"` : `onclick="showDaySummary('${dateStr}')"`);
    const cursorStyle = clickable ? 'cursor:pointer;' : '';
    // Un jour programmé porte l'heure si elle est connue, sinon un simple point
    const planMark = (plan && plan.time && !isOtherMonth)
      ? `<div class="cal-plan-h">${plan.time}</div>`
      : '';
    // Un jour peut cumuler plusieurs sports : la case est alors coupée en
    // autant de bandes que de couleurs, en diagonale. La muscu garde la
    // couleur du thème, les autres sports la leur.
    let sportStyle = '';
    if(sportsDuJour.length){
      const cols = [];
      if(isTrain) cols.push('var(--ac)');
      sportsDuJour.forEach(s=>{ const c=couleurSport(s); if(cols.indexOf(c)<0) cols.push(c); });
      if(cols.length){
        const pas = 100/cols.length;
        const stops = cols.map((c,k)=>`${c} ${(k*pas).toFixed(2)}% ${((k+1)*pas).toFixed(2)}%`).join(',');
        sportStyle = `background-image:linear-gradient(135deg,${stops});border-color:transparent;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.35);`;
      }
    }
    html2 += `<div class="${cls}" ${clickAttr} style="${cursorStyle}${sportStyle}">${dayNum}${planMark}${sleepDot}</div>`;
  }
  
  html2 += '</div>';
  html2 += '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:12px;font-size:10.5px;font-weight:600;color:var(--muted);">';
  html2 += `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;"><div style="width:12px;height:12px;border-radius:3px;background:var(--ac);"></div>Entraînement</div>`;
  html2 += `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;"><div style="width:12px;height:12px;border-radius:3px;background:var(--surf2);border:1px solid var(--bdr);"></div>Repos</div>`;
  html2 += `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;"><div style="width:12px;height:12px;border-radius:3px;background-image:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ac) 22%,transparent) 0 3px,transparent 3px 7px);"></div>Prévue</div>`;
  html2 += `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;"></div>Sommeil</div>`;
  html2 += '</div>';
  // Légende des autres sports, seulement ceux pratiqués dans le mois affiché :
  // inutile d'afficher dix couleurs quand on n'en a utilisé qu'une.
  const prefixe = displayDate.getFullYear()+'-'+String(displayDate.getMonth()+1).padStart(2,'0');
  const vus = [];
  Object.keys(sportMap).forEach(d=>{
    if(d.indexOf(prefixe)!==0) return;
    sportMap[d].forEach(s=>{
      if(s.sport==='muscu') return;               // déjà dans « Entraînement »
      const nom = s.nom || ((typeof sportById==='function'&&sportById(s.sport)||{}).n) || s.sport;
      if(!vus.some(v=>v.nom===nom)) vus.push({nom:nom, c:couleurSport(s)});
    });
  });
  if(vus.length){
    html2 += '<div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px;padding-top:10px;border-top:1px solid var(--bdr);font-size:10.5px;font-weight:600;color:var(--muted);">';
    vus.forEach(v=>{
      html2 += `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;"><div style="width:12px;height:12px;border-radius:3px;background:${v.c};"></div>${v.nom}</div>`;
    });
    html2 += '</div>';
  }
  el.innerHTML = html2;
}
let _daySummaryDate=null;
function showDaySummary(dateStr){
  _daySummaryDate=dateStr;
  const displayDate=dateStr.slice(8)+'/'+dateStr.slice(5,7)+'/'+dateStr.slice(0,4);
  const sleep=(ST.sleep||[]).find(s=>s.date===dateStr);
  const sportsJour=(ST.sportSessions||[]).filter(s=>s.date===dateStr);
  const trainSessions=[];
  (ST.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>(e.sessions||[]).filter(s=>s.date===dateStr).forEach(s=>{
    const charge=s.charges?'<span style="color:var(--ac);font-weight:700;">'+s.charges+' '+(e.unit||'kg')+'</span>':'';
    // Formater les reps en "X séries de X reps" si format "4×8"
    let repsTxt='';
    if(s.reps){
      const mx=String(s.reps).match(/^(\d+)\s*[×x]\s*(.+)$/);
      if(mx){repsTxt='<span style="color:#eab308;font-weight:700;">'+mx[1]+' séries de '+mx[2]+' reps</span>';}
      else{repsTxt='<span style="color:#eab308;font-weight:700;">'+s.reps+'</span>';}
    }
    const val=[charge,repsTxt].filter(Boolean).join('<br><span style="font-size:11px;color:var(--muted);">↳ </span>');
    trainSessions.push({exo:e.name,val:val||'--',unit:e.unit||''});
  })));

  let content='<div style="font-size:14px;font-weight:600;color:var(--ac);margin-bottom:12px;">'+displayDate+'</div>';

  // Entraînement
  if(trainSessions.length){
    content+='<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">💪 Entraînement</div>';
    content+='<div style="background:var(--surf2);border-radius:14px;padding:10px;margin-bottom:12px;">';
    trainSessions.forEach(s=>{
      content+='<div style="padding:8px 0;border-bottom:1px solid var(--bdr);"><div style="font-size:14px;font-weight:600;margin-bottom:3px;">'+s.exo+'</div><div style="font-size:13px;line-height:1.6;">'+s.val+'</div></div>';
    });
    content+='</div>';
  } else if(!sportsJour.length){
    content+='<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">— Jour de repos 💤</div>';
  }

  // Autres sports du jour : pas de séries ni de charges, juste un créneau.
  if(sportsJour.length){
    content+='<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">🤸 Autres activités</div>';
    content+='<div style="margin-bottom:12px;">';
    sportsJour.forEach(s=>{
      const sp=(typeof sportById==='function'&&sportById(s.sport))||{e:'✨',n:s.sport,c:'#8E8E93'};
      const detail=[s.heure,s.duree].filter(Boolean).join(' · ');
      const nom=(typeof escapeHtml==='function')?escapeHtml(s.nom||sp.n):(s.nom||sp.n);
      const det=(typeof escapeHtml==='function')?escapeHtml(detail):detail;
      const note=s.note?((typeof escapeHtml==='function')?escapeHtml(s.note):s.note):'';
      content+='<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:6px;background:var(--surf2);border-left:3px solid '+sp.c+';border-radius:12px;">'
        +'<span style="font-size:21px;flex-shrink:0;">'+sp.e+'</span>'
        +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:14.5px;font-weight:600;color:'+sp.c+';">'+nom+'</div>'
        +'<div style="font-size:12px;color:var(--muted);margin-top:2px;">'+det+(note?' · '+note:'')+'</div>'
        +'</div>'
        +'<button onclick="deleteSportSession(\''+s.id+'\')" style="flex-shrink:0;background:none;border:none;color:var(--muted);font-size:17px;padding:6px;line-height:1;font-family:inherit;">✕</button>'
        +'</div>';
    });
    content+='</div>';
  }

  // Séparateur si les deux
  // Sommeil
  if(sleep){
    const napV=sleep.nap||0;
    const totalV=(sleep.hours||0)+napV;
    const sc=sleepColor(sleep.hours,sleep.qual);
    const sl=sleepLabel(sleep.hours,sleep.qual);
    content+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
    content+='<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;">🌙 Sommeil</div>';
    content+='<span data-sleep-edit="'+dateStr+'" style="font-size:16px;letter-spacing:.01em;color:var(--muted);cursor:pointer;padding:4px 8px;">⋯</span>';
    content+='</div>';
    content+='<div style="background:var(--surf2);border-radius:14px;padding:14px;">';
    content+='<div style="display:flex;justify-content:space-between;align-items:center;">';
    content+='<div style="font-size:26px;font-weight:900;color:'+sc+';letter-spacing:-.02em;">'+(totalV?fmtSleep(totalV):'--')+'</div>';
    content+='<div style="text-align:right;"><div style="font-size:13px;font-weight:600;color:'+sc+';">'+sl+'</div>';
    if(sleep.qual)content+='<div style="font-size:11px;color:var(--muted);">'+sleep.qual+'</div>';
    content+='</div></div>';
    // Décomposition nuit + sieste (façon Apple) uniquement si sieste présente
    if(napV){
      content+='<div style="display:flex;gap:8px;margin-top:12px;">';
      content+='<div style="flex:1;background:var(--surf);border-radius:10px;padding:10px;text-align:center;"><div style="font-size:16px;">🌙</div><div style="font-size:15px;font-weight:700;color:var(--txt);margin-top:2px;">'+fmtSleep(sleep.hours||0)+'</div><div style="font-size:11px;color:var(--muted);">Nuit</div></div>';
      content+='<div style="flex:1;background:var(--surf);border-radius:10px;padding:10px;text-align:center;"><div style="font-size:16px;">🛋️</div><div style="font-size:15px;font-weight:700;color:var(--txt);margin-top:2px;">'+fmtSleep(napV)+'</div><div style="font-size:11px;color:var(--muted);">Sieste</div></div>';
      content+='</div>';
    }
    content+='</div>';
  } else {
    content+='<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">🌙 Sommeil</div>';
    content+='<div style="background:var(--surf2);border-radius:14px;padding:12px;text-align:center;font-size:12px;color:var(--muted);">Aucune nuit enregistrée</div>';
  }

  // Depuis le bilan, on peut aussi programmer ce jour — le geste devient le
  // même partout, qu'il y ait déjà une séance, une nuit, ou rien.
  const dejaFait=trainSessions.length>0||sportsJour.length>0;
  // Rattraper une activite oubliee : la date du jour touche est deja remplie.
  const aujLocal=(typeof ymdLocal==='function')?ymdLocal():new Date().toISOString().slice(0,10);
  if(dateStr<=aujLocal && typeof ouvrirActivite==='function'){
    content+=`<button onclick="closeModal('modal-day');ouvrirActivite(null,'${dateStr}')" style="width:100%;margin-top:14px;padding:13px;background:var(--surf2);border:none;border-radius:12px;color:var(--txt);font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;">🤸 Ajouter une activité</button>`;
  }
  const plan=plannedOf(dateStr);
  const todayStr2=new Date().toISOString().slice(0,10);
  if(!dejaFait && dateStr>=todayStr2){
    content+=`<button onclick="closeModal('modal-day');openPlanDay('${dateStr}')" style="width:100%;margin-top:14px;padding:13px;background:var(--surf2);border:none;border-radius:12px;color:var(--ac);font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;">${plan?'Modifier la séance prévue':'Programmer une séance'}</button>`;
  }
  document.getElementById('modal-day-content').innerHTML=content;
  // Event listener pour le bouton ⋯ sommeil
  document.querySelectorAll('[data-sleep-edit]').forEach(el=>{
    el.addEventListener('click',()=>{
      closeModal('modal-day');
      editSleep(el.dataset.sleepEdit);
    });
  });
  openModal('modal-day');
}
function sleepColor(hours, qual){
  if(!hours && !qual) return 'var(--bdr)';
  // Qualité mauvaise/moyen → orange/rouge peu importe la durée
  if(qual==='mauvais') return '#ef4444';
  if(qual==='moyen') return '#f97316';
  if(!hours) return qual==='bon'||qual==='excellent'?'#22c55e':'var(--bdr)';
  // Durée
  if(hours<6)           return '#ef4444';           // rouge : insuffisant
  if(hours<SLEEP_QUOTA) return '#f97316';            // orange : en dessous du quota
  if(hours>9.5)         return '#3b82f6';            // bleu : trop long
  return '#22c55e';                                  // vert : dans la plage idéale
}

// ══════════ SÉANCES PROGRAMMÉES ══════════
// Tu choisis un jour à venir, une heure si tu veux, et l'app te rappelle une
// heure avant. Le rappel est calculé ICI, dans ton fuseau, puis stocké en UTC :
// le serveur n'a plus qu'à comparer des instants, sans deviner ton décalage.
let _planDate=null;
function plannedOf(dateStr){ return (ST.planned||{})[dateStr]||null; }
function openPlanDay(dateStr){
  _planDate=dateStr;
  const p=plannedOf(dateStr);
  const [y,m,d]=dateStr.split('-');
  const noms=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  document.getElementById('plan-day-title').textContent=parseInt(d)+' '+noms[parseInt(m)-1];
  document.getElementById('plan-time').value=p&&p.time?p.time:'';
  // Avances cochées : 1 h par défaut pour une nouvelle séance
  const choix=(p&&p.offsets&&p.offsets.length)?p.offsets:[60];
  document.querySelectorAll('.plan-offset').forEach(b=>{
    b.classList.toggle('on',choix.includes(parseInt(b.dataset.min)));
  });
  document.getElementById('plan-remove').style.display=p?'block':'none';
  document.getElementById('modal-plan-day').classList.add('on');
}
function closePlanDay(){ document.getElementById('modal-plan-day').classList.remove('on'); }
function savePlannedDay(){
  if(!_planDate)return;
  const t=(document.getElementById('plan-time').value||'').trim();
  // Choix des avances : on peut en cocher plusieurs
  const offsets=[...document.querySelectorAll('.plan-offset.on')].map(b=>parseInt(b.dataset.min));
  if(!ST.planned)ST.planned={};
  ST.planned[_planDate]={time:t||null,offsets:t?offsets:[]};
  saveState();
  // On publie une ligne par avance choisie : le serveur ne lit que des
  // rappels imminents, au lieu de parcourir tous les états.
  syncPlannedRow(_planDate,t||null,t?offsets:[]);
  closePlanDay();
  renderActivityCalendar();
  toast(t?('📅 Séance prévue à '+t):'📅 Séance prévue','ok');
}
function removePlannedDay(){
  if(!_planDate||!ST.planned)return;
  delete ST.planned[_planDate];
  saveState();
  try{ sb.from('planned_sessions').delete().eq('user_id',U.id).eq('day',_planDate).then(()=>{}); }catch(e){}
  closePlanDay();
  renderActivityCalendar();
  toast('Séance retirée','ok');
}
// Bonus d'XP quand on tient une séance prévue : on ne récompense qu'une fois.
function claimPlannedBonus(dateStr){
  const p=plannedOf(dateStr);
  if(!p||p.done)return 0;
  p.done=true; saveState();
  return 15;
}

// Une ligne par séance prévue avec une heure. Sans heure, aucun rappel n'est
// attendu : on retire la ligne s'il en existait une.
async function syncPlannedRow(day,time,offsets){
  if(!U||!sb)return;
  try{
    // On repart de zéro pour ce jour, puis on récrit une ligne par avance
    await sb.from('planned_sessions').delete().eq('user_id',U.id).eq('day',day);
    if(!time||!offsets||!offsets.length)return;
    const [hh,mm]=time.split(':');
    const local=new Date(day+'T'+String(hh).padStart(2,'0')+':'+String(mm||'00').padStart(2,'0')+':00');
    const lignes=offsets.map(min=>({
      user_id:U.id, day, time, offset_min:min,
      remind_at:new Date(local.getTime()-min*60000).toISOString(),
      notified:false
    }));
    await sb.from('planned_sessions').insert(lignes);
  }catch(e){}   // table absente : le marquage dans le calendrier fonctionne quand même
}
// Une séance prévue mais jamais honorée n'a plus de sens le lendemain :
// on la retire au chargement, sans rien demander.
async function purgePlannedPassees(){
  if(!ST.planned)return;
  const today=new Date().toISOString().slice(0,10);
  const faits=new Set();
  (ST.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>(e.sessions||[]).forEach(s=>faits.add(s.date))));
  // Un autre sport pratique ce jour-la tient aussi la seance prevue.
  (ST.sportSessions||[]).forEach(s=>{ if(s&&s.date)faits.add(s.date); });
  const aRetirer=Object.keys(ST.planned).filter(d=>d<today&&!faits.has(d));
  if(!aRetirer.length)return;
  aRetirer.forEach(d=>delete ST.planned[d]);
  saveState();
  try{
    if(U&&sb)await sb.from('planned_sessions').delete().eq('user_id',U.id).in('day',aRetirer);
  }catch(e){}
  try{ renderActivityCalendar(); }catch(e){}
}
