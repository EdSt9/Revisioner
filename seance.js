// ══════════════════════════════════════════════════════════════
// KeyFit — les séances et le chrono
// Module isolé : ce fichier ne contient que les séances et le chrono.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function getWeekSessions(){
  // Semaine = lundi → dimanche en cours. On compte des JOURS d'activite,
  // muscu et autres sports confondus (activeDates est dans index.html).
  const now=new Date();
  const dow=(now.getDay()+6)%7; // 0=lundi, 6=dimanche
  const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow);
  const mondayStr=monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0')+'-'+String(monday.getDate()).padStart(2,'0');
  let n=0;
  activeDates().forEach(d=>{ if(d>=mondayStr) n++; });
  return n;
}
function totalCompletedSessions(){
  // Seances de muscu terminees + seances des autres sports
  return (ST.sessionsFinished||[]).length+(ST.sportSessions||[]).length;
}
function startTimer(duration){
  _timerLeft=(typeof duration==='number'&&duration>0)?duration:_timerDuration;
  if(_loopMode){ if(_loopMode==='boucle')_timerDuration=_timerLeft; _startLoop(); return; }
  _ringTotal=_timerLeft;
  // Heure de FIN absolue : le temps reel continue de s'ecouler meme si iOS
  // gele les intervalles quand l'app passe en arriere-plan.
  _timerEndAt=Date.now()+_timerLeft*1000;
  updateTimerDisplay();
  document.getElementById('timer-overlay').classList.add('on');
  clearInterval(_timerInterval);
  _timerInterval=setInterval(_timerTick,250);
  _keepAliveStart();
  // Le bip est programme des maintenant sur l'horloge audio : un setTimeout
  // gele en arriere-plan, pas la timeline de l'AudioContext.
  _scheduleEndSound(_timerLeft);
  _scheduleRestPush(_timerEndAt);
}
// Par defaut WebKit prend une session audio de type "playback", qui coupe
// la musique des autres apps des qu'on joue le moindre son. "ambient" se
// superpose a la place : Spotify continue pendant le repos.
function _audioSessionMix(){
  try{
    if(navigator.audioSession&&navigator.audioSession.type!=='ambient')
      navigator.audioSession.type='ambient';
  }catch(e){}
}
function _getAudioCtx(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)return null;
  _audioSessionMix();
  // Un seul contexte pour toute la session : en creer un a chaque fin de
  // repos reprend la session audio a zero et recoupe la musique.
  if(!_audioCtx)_audioCtx=new AudioCtx();
  if(_audioCtx.state==='suspended')_audioCtx.resume().catch(()=>{});
  return _audioCtx;
}
let _timerOsc=[], _endSoundOk=false;
function _cancelEndSound(){
  _timerOsc.forEach(o=>{try{o.stop();}catch(e){}});
  _timerOsc=[];_endSoundOk=false;
}
const _BIPS=[[880,0,.15],[880,.2,.15],[1320,.4,.3]];
// Programme une serie de bips a l'instant t0 de l'horloge audio.
// motif : [[frequence, decalage, duree], ...]
function _bipsA(ctx,t0,motif,vol){
  motif=motif||_BIPS; vol=vol||0.5;
  motif.forEach(b=>{
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.type='sine';osc.frequency.value=b[0];
    gain.gain.setValueAtTime(0,t0+b[1]);
    gain.gain.linearRampToValueAtTime(vol,t0+b[1]+0.01);
    gain.gain.linearRampToValueAtTime(0,t0+b[1]+b[2]);
    osc.start(t0+b[1]);osc.stop(t0+b[1]+b[2]+0.05);
    osc._t=t0+b[1];
    _timerOsc.push(osc);
  });
}
function _scheduleEndSound(delaiSec){
  _cancelEndSound();
  const ctx=_getAudioCtx();
  if(!ctx)return;
  _bipsA(ctx,ctx.currentTime+Math.max(0,delaiSec));
  _endSoundOk=true;
}

// ══════════ BOUCLE ET INTERVALLES (cardio) ══════════
// Deux modes, un seul moteur :
//  - « boucle » : une seule phase qui se repete (toutes les 30 s, bip, on repart)
//  - « inter »  : effort puis repos, en boucle, avec un nombre de tours optionnel
// Tout est calcule depuis l'heure de depart : si iOS gele la page, le tour, la
// phase et le temps restant sont justes au retour. Les sons sont programmes a
// l'avance sur l'horloge audio (20 min devant) pour sonner ecran verrouille.
const _SON={
  go:    _BIPS,                                              // debut d'effort : aigu
  repos: [[587,0,.18],[392,.24,.32]],                        // debut de repos : grave, descendant
  fin:   [[880,0,.14],[1108,.17,.14],[1320,.34,.14],[1760,.51,.55]],  // fin de la seance
  tic:   [[660,0,.06]]                                       // decompte 3-2-1
};
let _loopMode=false,_phases=[],_loopRounds=0,_loopStart=0,_loopPeriod=0,_loopCtxT0=0,
    _loopSchedUntil=0,_loopTour=0,_loopIdx=-1,_loopFini=false;
let _iEffort=40,_iRepos=20,_iTours=0;
try{
  const m=JSON.parse(localStorage.getItem('kf-inter')||'null');
  if(m){ _iEffort=m.e||40; _iRepos=m.r||20; _iTours=m.t||0; }
}catch(e){}
function _construirePhases(){
  if(_loopMode==='inter') return [
    {nom:'Effort',emo:'⚡',sec:_iEffort,son:'go',   coul:'#FF9F0A'},
    {nom:'Repos', emo:'😮‍💨',sec:_iRepos, son:'repos',coul:'#30D158'}];
  return [{nom:'',emo:'🔁',sec:_timerDuration,son:'go',coul:''}];
}
function _startLoop(){
  _cancelEndSound(); _cancelRestPush();       // une notif serveur n'a pas de sens ici
  _phases=_construirePhases();
  _loopRounds=(_loopMode==='inter')?(_iTours||0):0;
  _loopPeriod=_phases.reduce((a,p)=>a+p.sec,0);
  _loopStart=Date.now(); _loopTour=0; _loopIdx=-1; _loopFini=false; _loopSchedUntil=0;
  const ctx=_getAudioCtx(); _loopCtxT0=ctx?ctx.currentTime:0;
  document.getElementById('timer-overlay').classList.add('on');
  clearInterval(_timerInterval);
  _timerInterval=setInterval(_timerTick,250);
  _keepAliveStart();
  _planifierBipsBoucle();
  _tickBoucle();
}
// Ou en est-on, a t secondes du depart ?
function _positionA(t){
  const total=_loopRounds?_loopRounds*_loopPeriod:Infinity;
  if(t>=total) return {fini:true};
  const tour=Math.floor(t/_loopPeriod)+1;
  let r=t%_loopPeriod, idx=0;
  while(idx<_phases.length-1&&r>=_phases[idx].sec){ r-=_phases[idx].sec; idx++; }
  return {tour, idx, left:Math.max(1,Math.ceil(_phases[idx].sec-r))};
}
function _planifierBipsBoucle(){
  const ctx=_getAudioCtx(); if(!ctx||!_loopPeriod)return;
  const now=ctx.currentTime;
  _timerOsc=_timerOsc.filter(o=>o._t==null||o._t>now-2);   // on oublie les sons deja joues
  const ecoule=(Date.now()-_loopStart)/1000;
  const total=_loopRounds?_loopRounds*_loopPeriod:Infinity;
  const depuis=Math.max(_loopSchedUntil,ecoule);
  const jusqua=Math.min(ecoule+1200,total);
  const aT=sec=>_loopCtxT0+sec;             // secondes depuis le depart -> horloge audio
  let n=0;
  for(let k=Math.floor(depuis/_loopPeriod);n<150;k++){
    let off=k*_loopPeriod, stop=false;
    for(let i=0;i<_phases.length;i++){
      const b=off;                           // debut de la phase i du tour k
      off+=_phases[i].sec;
      if(b>jusqua){stop=true;break;}
      if(b<=depuis||b===0)continue;          // pas de son au tout debut : on vient de toucher
      if(b>=total)continue;
      _bipsA(ctx,aT(b),_SON[_phases[i].son]); n++;
      // Decompte 3-2-1 avant chaque effort, si le repos laisse le temps
      if(_loopMode==='inter'&&_phases[i].son==='go'){
        const prec=_phases[(i-1+_phases.length)%_phases.length].sec;
        if(prec>=5)for(let d=3;d>=1;d--){ if(b-d>ecoule)_bipsA(ctx,aT(b-d),_SON.tic,0.25); }
      }
    }
    if(stop||off>jusqua+_loopPeriod)break;
  }
  if(total!==Infinity&&total>depuis&&total<=ecoule+1200)_bipsA(ctx,aT(total),_SON.fin);
  _loopSchedUntil=jusqua;
}
// Au retour de l'arriere-plan, l'horloge audio a pu s'arreter un moment :
// on recale les sons a venir sur l'heure reelle, sans couper celui qui joue.
function _resyncBoucle(){
  const ctx=_getAudioCtx(); if(!ctx||!_loopPeriod)return;
  const now=ctx.currentTime;
  _timerOsc=_timerOsc.filter(o=>{ if(o._t!=null&&o._t>now+0.05){try{o.stop();}catch(e){} return false;} return true; });
  const ecoule=(Date.now()-_loopStart)/1000;
  _loopCtxT0=now-ecoule;
  _loopSchedUntil=ecoule;
  _planifierBipsBoucle();
}
// Temps restant exact dans la phase en cours (sans arrondi a la seconde).
function _positionExact(t){
  if(!_loopPeriod||!_phases.length)return null;
  let r=t%_loopPeriod, idx=0;
  while(idx<_phases.length-1&&r>=_phases[idx].sec){ r-=_phases[idx].sec; idx++; }
  return {idx, reste:Math.max(0,_phases[idx].sec-r)};
}
// Notif locale de changement de phase, uniquement quand on n'est pas dans
// l'app. Meme etiquette que le repos : un tap ramene sur les seances, et
// chaque nouvelle phase remplace la precedente au lieu de s'empiler.
async function _notifPhase(titre,corps){
  try{
    if(document.visibilityState==='visible')return;
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const reg=await navigator.serviceWorker.ready;
    await reg.showNotification(titre,{body:corps,tag:'rest-timer',renotify:true,silent:false});
  }catch(e){}
}
function _tickBoucle(){
  if(_loopFini)return;
  const ecoule=(Date.now()-_loopStart)/1000;
  const pos=_positionA(ecoule);
  const d=document.getElementById('timer-display');
  if(pos.fini){
    _loopFini=true; clearInterval(_timerInterval); _keepAliveStop();
    if(navigator.vibrate)navigator.vibrate([300,100,300,100,500]);
    if(d){ d.textContent='Terminé 🎉'; d.style.color='#30D158'; d.style.setProperty('font-size','30px','important'); }
    const l=document.getElementById('timer-lbl');
    if(l)l.textContent=`${_loopRounds} tour${_loopRounds>1?'s':''} bouclé${_loopRounds>1?'s':''}`;
    if(_loopMode==='inter'&&ecoule-_loopRounds*_loopPeriod<4)
      _notifPhase('Terminé 🎉',`${_loopRounds} tour${_loopRounds>1?'s':''} bouclé${_loopRounds>1?'s':''}. Bien joué.`);
    setTimeout(()=>{ if(_loopFini)stopTimer(); },3500);
    return;
  }
  _timerEndAt=Date.now()+pos.left*1000;       // > 0 : les handlers de retour savent qu'un chrono tourne
  _ringTotal=(_phases[pos.idx]||{}).sec||_loopPeriod;
  if(pos.tour!==_loopTour||pos.idx!==_loopIdx){
    const premier=_loopIdx<0;
    _loopTour=pos.tour; _loopIdx=pos.idx;
    _majUIBoucle();
    if(!premier){
      if(navigator.vibrate)navigator.vibrate(_phases[pos.idx].son==='go'?300:[120,80,120]);
      if(d){ d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); }
      // Hors de l'app : une notif a chaque changement de phase. Seulement si
      // la phase vient de commencer (une page reveillee en retard par iOS
      // n'envoie pas une notif perimee).
      const ph=_phases[pos.idx]||{};
      const depuis=(ph.sec||0)-((_positionExact(ecoule)||{}).reste||0);
      if(_loopMode==='inter'&&depuis<4){
        const tours=_loopRounds?`${pos.tour}/${_loopRounds}`:`${pos.tour}`;
        _notifPhase(`${ph.emo} ${ph.nom} · Tour ${tours}`, `${ph.sec} s ${ph.son==='go'?'à fond 💪':'pour souffler'}`);
      }
    }
    _planifierBipsBoucle();
  }
  if(pos.left!==_timerLeft||!d||d.textContent.indexOf(':')<0){ _timerLeft=pos.left; updateTimerDisplay(); }
}
function toggleBoucle(){
  _loopMode=(_loopMode==='boucle')?false:'boucle';
  _fermerPanneauInter();
  clearInterval(_timerInterval); _cancelEndSound(); _cancelRestPush();
  _majUIBoucle();
  startTimer(_timerDuration);   // on repart de zero avec la duree choisie
}
// Bouton « Intervalles » : ouvre le reglage, ou arrete les intervalles en cours.
function toggleIntervalles(){
  if(_loopMode==='inter'){
    _loopMode=false; _fermerPanneauInter();
    clearInterval(_timerInterval); _cancelEndSound();
    _majUIBoucle(); startTimer(_timerDuration);
    return;
  }
  const pan=document.getElementById('timer-inter'); if(!pan)return;
  const ouvert=pan.style.display!=='none';
  if(ouvert){ _fermerPanneauInter(); return; }
  document.getElementById('ti-effort').value=_iEffort;
  document.getElementById('ti-repos').value=_iRepos;
  document.getElementById('ti-tours').value=_iTours||'';
  pan.style.display='flex';
  _masquerReglagesSimples(true);
}
function _fermerPanneauInter(){
  const pan=document.getElementById('timer-inter'); if(pan)pan.style.display='none';
  _masquerReglagesSimples(_loopMode==='inter');
}
function _masquerReglagesSimples(cacher){
  document.querySelectorAll('#timer-overlay .timer-presets').forEach(el=>{ el.style.display=cacher?'none':''; });
  const cu=document.getElementById('timer-custom');
  if(cu&&cacher)cu.style.display='none';
  const adj=document.getElementById('timer-adj');
  if(adj)adj.style.display=(cacher||_loopMode)?'none':'';
  const ov=document.getElementById('timer-overlay');
  const pan=document.getElementById('timer-inter');
  if(ov)ov.classList.toggle('ti-open',!!(pan&&pan.style.display==='flex'));
}
function presetInter(e,r,t){
  document.getElementById('ti-effort').value=e;
  document.getElementById('ti-repos').value=r;
  document.getElementById('ti-tours').value=t||'';
  lancerIntervalles();
}
function lancerIntervalles(){
  const lire=(id,min,max)=>{const v=parseInt(document.getElementById(id).value,10);return isNaN(v)?0:Math.max(min,Math.min(max,v));};
  const e=lire('ti-effort',0,3600), r=lire('ti-repos',0,3600), t=lire('ti-tours',0,999);
  if(e<3){ toast('Effort : 3 secondes minimum','err'); return; }
  if(r<3){ toast('Repos : 3 secondes minimum','err'); return; }
  _iEffort=e; _iRepos=r; _iTours=t;
  try{ localStorage.setItem('kf-inter',JSON.stringify({e,r,t})); }catch(err){}
  ['ti-effort','ti-repos','ti-tours'].forEach(id=>{try{document.getElementById(id).blur();}catch(err){}});
  _loopMode='inter';
  _fermerPanneauInter();
  clearInterval(_timerInterval); _cancelEndSound();
  startTimer();
}
function _majUIBoucle(){
  const b=document.getElementById('timer-loop-btn');
  if(b){ b.classList.toggle('on',_loopMode==='boucle'); b.textContent=_loopMode==='boucle'?'🔁 Boucle activée':'🔁 Boucle'; }
  const bi=document.getElementById('timer-inter-btn');
  if(bi){ bi.classList.toggle('on',_loopMode==='inter'); bi.textContent=_loopMode==='inter'?'⚡ Arrêter':'⚡ Intervalles'; }
  const l=document.getElementById('timer-lbl');
  const d=document.getElementById('timer-display');
  const resume=document.getElementById('timer-inter-resume');
  if(_loopMode==='inter'&&_phases.length&&_loopIdx>=0){
    const ph=_phases[_loopIdx];
    const tours=_loopRounds?`${_loopTour}/${_loopRounds}`:`${_loopTour}`;
    if(l)l.textContent=`${ph.emo} ${ph.nom} · Tour ${tours}`;
    if(d)d.style.color=ph.coul;
  }else if(_loopMode==='boucle'){
    if(l)l.textContent=`🔁 Boucle · Tour ${_loopTour||1}`;
    if(d)d.style.color='';
  }else{
    if(l)l.textContent='Repos · prochaine série';
    if(d)d.style.color='';
  }
  if(resume){
    if(_loopMode==='inter'){
      resume.style.display='block';
      resume.textContent=`${_iEffort}s effort · ${_iRepos}s repos · ${_iTours?_iTours+' tours':'sans fin'}`;
    }else resume.style.display='none';
  }
  _masquerReglagesSimples(_loopMode==='inter'||(document.getElementById('timer-inter')||{style:{}}).style.display==='flex');
}
function _keepAliveStart(){
  try{
    _audioSessionMix();
    if(!_keepAlive){
      _keepAlive=document.createElement('audio');
      _keepAlive.loop=true;
      _keepAlive.setAttribute('playsinline','');
      // 0,05 s de silence, encodé directement : aucun fichier à charger
      _keepAlive.src='data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YTAAAAAA'
        +'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
      _keepAlive.volume=0.001;
    }
    _keepAlive.play().catch(()=>{});
  }catch(e){}
}
function _keepAliveStop(){
  try{ if(_keepAlive){_keepAlive.pause();} }catch(e){}
}
function _timerTick(){
  if(!_ringRAF)try{majAnneau();}catch(e){}   // relance l'animation de l'anneau si besoin
  if(_loopMode&&_loopPeriod){ _tickBoucle(); return; }
  // On RECALCULE depuis l'horloge au lieu de decrementer :
  // au retour d'arriere-plan, le temps ecoule est automatiquement rattrape.
  const left=Math.max(0,Math.ceil((_timerEndAt-Date.now())/1000));
  if(left===_timerLeft)return;
  _timerLeft=left;
  updateTimerDisplay();
  if(left<=0){
    clearInterval(_timerInterval);
    _timerFinish();
  }
}
function setCustomTimer(){
  const mi=document.getElementById('timer-min'), se=document.getElementById('timer-sec');
  const m=Math.max(0,Math.min(60,parseInt(mi.value)||0));
  const sc=Math.max(0,Math.min(59,parseInt(se.value)||0));
  const sec=m*60+sc;
  if(sec<5){toast('Minimum 5 secondes','err');return;}
  if(sec>3600){toast('Maximum 60 minutes','err');return;}
  mi.blur();se.blur();
  setTimerDuration(sec);
}
// ── Filet de secours quand l'app passe derriere ──────────────────
// Le bip local ne part pas si iOS a gele la page. On depose donc l'heure de
// fin cote serveur : le worker envoie une push a l'echeance, sauf si la ligne
// a disparu entre-temps. Toute fin, tout arret et toute relance la retirent,
// ce qui evite aussi le doublon quand le bip local a bien sonne.
// Sous 10 s on ne quitte pas l'app. Au-dela de 140 s, le worker ne peut plus
// attendre dans la meme invocation : c'est le balayage pg_cron qui prend le
// relais, a la minute pres, ce qui suffit largement sur un repos long.
const _REST_PUSH_MIN=10, _REST_PUSH_MAX=3600;
let _restPushArme=false;
async function _scheduleRestPush(endAtMs){
  try{
    if(typeof U==='undefined'||!U||!sb)return;
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const delai=(endAtMs-Date.now())/1000;
    // Trop court : on ne quitte pas l'app. Trop long : le worker ne tient pas.
    if(delai<_REST_PUSH_MIN||delai>_REST_PUSH_MAX)return;
    await sb.from('rest_timers').upsert(
      {user_id:U.id,end_at:new Date(endAtMs).toISOString()},
      {onConflict:'user_id'}
    );
    _restPushArme=true;
  }catch(e){}
}
async function _cancelRestPush(){
  _restPushArme=false;
  try{ if(typeof U!=='undefined'&&U&&sb)await sb.from('rest_timers').delete().eq('user_id',U.id); }catch(e){}
}
function _timerFinish(){
  _keepAliveStop();
  // Si une push serveur etait programmee, elle part a la meme seconde : la
  // supprimer ici arriverait trop tard, donc on renonce plutot a la notif
  // locale. Sans push programmee (repos trop court, trop long, ou pas
  // d'autorisation), la locale reste le seul filet et on la garde.
  // La page est souvent encore vivante en arriere-plan (le son muet en
  // boucle la maintient eveillee). Elle supprimait alors la ligne serveur
  // pile a l'echeance, AVANT que le serveur ne l'envoie, et renoncait a sa
  // propre notif puisqu'une push etait prevue : resultat, aucune notif.
  // Desormais, si la page tourne a l'heure, c'est ELLE qui notifie, et elle
  // retire la ligne pour eviter le doublon. Si elle se reveille en retard
  // (iOS l'avait gelee), le serveur a deja envoye : on ne fait que nettoyer.
  const aLHeure=!_timerEndAt||(Date.now()-_timerEndAt)<4000;
  _cancelRestPush();
  if(aLHeure&&document.visibilityState!=='visible'){ try{ notifyRestDone(); }catch(e){} }
  // Vibration Android
  if(navigator.vibrate)navigator.vibrate([300,100,300,100,300]);
  // Le bip a normalement ete programme au demarrage du chrono. Ce repli ne
  // sert que si l'AudioContext n'etait pas disponible a ce moment-la.
  if(!_endSoundOk)_scheduleEndSound(0);
  _timerOsc=[];_endSoundOk=false;
  document.getElementById('timer-display').textContent='GO !';
  try{majAnneau();}catch(e){}
  setTimeout(()=>stopTimer(),2000);
}
let _ringTotal=90;
function updateTimerDisplay(){
  const m=Math.floor(_timerLeft/60),s=_timerLeft%60;
  const dsp=document.getElementById('timer-display');
  dsp.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  dsp.style.removeProperty('font-size');
  majAnneau();
}
// L'anneau se vide au fil du temps restant, dans le sens des aiguilles
// d'une montre (comme le minuteur de l'iPhone). Il est redessine a chaque
// image a partir de l'heure reelle : le mouvement est continu, pas par
// saut d'une seconde. En intervalles, il prend la couleur de la phase.
let _ringRAF=0;
function _anneauEtat(){
  if(_loopMode&&_loopStart&&_phases.length&&_loopPeriod){
    if(_loopFini)return {reste:0,tot:1};
    const t=(Date.now()-_loopStart)/1000;
    const total=_loopRounds?_loopRounds*_loopPeriod:Infinity;
    if(t>=total)return {reste:0,tot:1};
    let r=t%_loopPeriod, idx=0;
    while(idx<_phases.length-1&&r>=_phases[idx].sec){ r-=_phases[idx].sec; idx++; }
    return {reste:Math.max(0,_phases[idx].sec-r), tot:_phases[idx].sec||1};
  }
  if(_timerEndAt)return {reste:Math.max(0,(_timerEndAt-Date.now())/1000), tot:Math.max(1,_ringTotal||1)};
  return {reste:_timerLeft, tot:Math.max(1,_ringTotal||1)};
}
function majAnneau(){
  const fg=document.getElementById('timer-ring-fg'); if(!fg)return;
  const e=_anneauEtat();
  const frac=Math.max(0,Math.min(1,e.reste/e.tot));
  // Decalage negatif : le vide part de midi et avance vers la droite.
  fg.style.strokeDashoffset=String(-703.7*(1-frac));
  const ph=(_loopMode==='inter'&&_phases[_loopIdx])?_phases[_loopIdx].coul:'';
  fg.style.stroke=ph||'';
  const ov=document.getElementById('timer-overlay');
  if(!_ringRAF&&ov&&ov.classList.contains('on'))_ringRAF=requestAnimationFrame(_anneauBoucle);
}
function _anneauBoucle(){
  _ringRAF=0;
  const ov=document.getElementById('timer-overlay');
  if(!ov||!ov.classList.contains('on')||document.hidden)return;
  majAnneau();
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden)try{majAnneau();}catch(e){} });
// −15 s / +15 s : on decale l'heure de fin, le bip et la notif suivent.
function ajusterChrono(d){
  if(_loopMode||!_timerEndAt)return;
  const reste=(_timerEndAt-Date.now())/1000;
  const nouveau=Math.max(1,reste+d);
  _timerEndAt=Date.now()+nouveau*1000;
  _ringTotal=Math.max(_ringTotal+(nouveau-reste),nouveau);
  _timerLeft=Math.ceil(nouveau);
  updateTimerDisplay();
  _scheduleEndSound(nouveau);
  _scheduleRestPush(_timerEndAt);
}
function toggleDureeLibre(){
  const c=document.getElementById('timer-custom'); if(!c)return;
  const ouvrir=c.style.display==='none';
  c.style.display=ouvrir?'':'none';
  const b=document.getElementById('timer-autre'); if(b)b.classList.toggle('on',ouvrir);
  if(ouvrir){ try{document.getElementById('timer-min').focus();}catch(e){} }
}
function setAutoTimer(on){
  localStorage.setItem('kf-auto-timer', on?'1':'0');
  const a=document.getElementById('tog-atimer-on'), b=document.getElementById('tog-atimer-off');
  if(a)a.classList.toggle('on',on);
  if(b)b.classList.toggle('on',!on);
  toast(on?'⏱️ Chrono auto activé':'⏱️ Chrono auto désactivé','ok');
}
function setTimerDuration(sec){
  _timerDuration=sec;_timerLeft=sec;
  document.querySelectorAll('.timer-preset').forEach(b=>{
    const t=b.textContent.trim();
    const match=(sec===15&&t==='15s')||(sec===30&&t==='30s')||(sec===60&&t==='1 min')||(sec===90&&t==='1:30')||(sec===120&&t==='2 min')||(sec===180&&t==='3 min');
    b.classList.toggle('on',match);
  });
  updateTimerDisplay();clearInterval(_timerInterval);startTimer();
}
function stopTimer(){
  clearInterval(_timerInterval);_timerEndAt=0;_cancelEndSound();_cancelRestPush();_keepAliveStop();
  // Fermer sort du mode boucle : le chrono auto lance apres une serie ne
  // doit jamais se mettre a boucler tout seul.
  _loopMode=false;_loopPeriod=0;_loopTour=0;_loopIdx=-1;_loopFini=false;_phases=[];
  _fermerPanneauInter();_majUIBoucle();
  document.getElementById('timer-overlay').classList.remove('on');
}
// Au retour au premier plan, on recale tout de suite au lieu d'attendre le
// prochain tick : si le repos s'est termine pendant que l'app etait derriere
// la musique, l'ecran ne reste pas fige sur un compte a rebours perime.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!_timerEndAt)return;
  try{_getAudioCtx();}catch(e){}
  if(_loopMode&&_loopPeriod){ try{_resyncBoucle();}catch(e){} }
  _timerTick();
});
function showExoProgress(exoName){
  openModal('modal-exo-progress');
  document.getElementById('exo-progress-ttl').textContent=exoName;
  const canvas=document.getElementById('exo-progress-canvas');
  const empty=document.getElementById('exo-progress-empty');
  const statsEl=document.getElementById('exo-progress-stats');
  const parseCharge=x=>{const v=String(x.charges).replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(n=>!isNaN(n)&&n>0);return v.length?Math.max(...v):0;};
  // Agréger la charge max par date sur toutes les séances
  const byDate={};
  let unitLabel='kg';
  (ST.days||[]).forEach(d=>{
    (d.exercises||[]).forEach(e=>{
      if(e.name!==exoName)return;
      if(e.unit)unitLabel=e.unit;
      (e.sessions||[]).forEach(s=>{
        if(!s.date)return;
        const c=parseCharge(s);
        if(c<=0)return;
        if(!byDate[s.date]||c>byDate[s.date])byDate[s.date]=c;
      });
    });
  });
  const dates=Object.keys(byDate).sort();
  if(_exoProgressChart){try{_exoProgressChart.destroy();}catch(e){}_exoProgressChart=null;}
  if(dates.length<2){
    canvas.style.display='none';
    statsEl.style.display='none';
    empty.style.display='block';
    empty.textContent=dates.length===1
      ?'Une seule séance enregistrée. Reviens après ta prochaine pour voir ta courbe de progression ! 📈'
      :'Pas encore de données pour cet exercice.';
    return;
  }
  canvas.style.display='block';
  empty.style.display='none';
  const data=dates.map(d=>byDate[d]);
  const labels=dates.map(d=>d.slice(5).split('-').reverse().join('/'));
  // Stats : départ, actuel, progression
  const first=data[0], last=data[data.length-1], max=Math.max(...data);
  const diff=last-first;
  const diffPct=first>0?Math.round((diff/first)*100):0;
  statsEl.style.display='flex';
  statsEl.innerHTML=`
    <div style="flex:1;background:var(--surf2);border-radius:14px;padding:10px;text-align:center;">
      <div style="font-size:12px;color:var(--muted);">DÉPART</div>
      <div style="font-size:18px;font-weight:800;color:var(--txt);">${first} ${unitLabel}</div>
    </div>
    <div style="flex:1;background:var(--surf2);border-radius:14px;padding:10px;text-align:center;">
      <div style="font-size:12px;color:var(--muted);">MAX</div>
      <div style="font-size:18px;font-weight:800;color:var(--ac);">${max} ${unitLabel}</div>
    </div>
    <div style="flex:1;background:var(--surf2);border-radius:14px;padding:10px;text-align:center;">
      <div style="font-size:12px;color:var(--muted);">PROGRÈS</div>
      <div style="font-size:18px;font-weight:800;color:${diff>=0?'#22c55e':'#ef4444'};">${diff>=0?'+':''}${diff} ${unitLabel}</div>
    </div>`;
  try{
    _exoProgressChart=new Chart(canvas,{
      type:'line',
      data:{labels,datasets:[{data,borderColor:getAccentColor(),backgroundColor:getAccentColorAlpha(.1),borderWidth:2,pointBackgroundColor:getAccentColor(),pointRadius:4,tension:0,fill:true}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#888',font:{size:9}}},y:{grid:{color:'rgba(128,128,128,.05)'},ticks:{color:'#888',font:{size:9},callback:v=>v+' '+unitLabel}}}}
    });
  }catch(e){}
}
async function syncExerciseRecord(exo,oldMax,newMax){
  if(!U||!sb||!newMax||newMax<=oldMax)return;
  const key=(exo.name||'').trim().toLowerCase();
  if(!key)return;
  const unit=exo.unit||'kg';
  const{error}=await sb.from('exercise_records').upsert(
    {user_id:U.id,exercise:key,best:newMax,unit,updated_at:new Date().toISOString()},
    {onConflict:'user_id,exercise'});
  if(error)return;                 // table absente ou refusée : on s'arrête là
  if(!oldMax)return;               // première saisie : on enregistre, on ne notifie pas
  try{
    const{data:rels}=await sb.from('friendships')
      .select('follower_id,followed_id').eq('status','accepted')
      .or(`follower_id.eq.${U.id},followed_id.eq.${U.id}`);
    const friends=[...new Set((rels||[]).map(r=>r.follower_id===U.id?r.followed_id:r.follower_id))]
      .filter(id=>id&&id!==U.id);
    if(!friends.length)return;
    // Ceux dont le record se situe entre mon ancien et mon nouveau : je viens de les doubler
    const{data:rows}=await sb.from('exercise_records')
      .select('user_id,best').eq('exercise',key).in('user_id',friends)
      .gte('best',oldMax).lt('best',newMax);
    (rows||[]).slice(0,5).forEach(r=>pushNotif(r.user_id,'record_beaten',
      `${myName()} vient de dépasser ton record sur ${exo.name} : ${newMax} ${unit} 💪`));
    // Amis ayant demandé à suivre l'activité : on les prévient du record battu
    const dejaPrevenus=new Set((rows||[]).slice(0,5).map(r=>r.user_id));
    const{data:optin}=await sb.from('muted_conversations').select('user_id')
      .eq('conv_key','activity_on').in('user_id',friends);
    (optin||[]).filter(o=>!dejaPrevenus.has(o.user_id)).slice(0,10).forEach(o=>
      pushNotif(o.user_id,'friend_record',
        `${myName()} a battu son record sur ${exo.name} : ${newMax} ${unit} 🔥`));
  }catch(e){}
}
function renderFriendSessions(days){
  const el=document.getElementById('friend-sessions-detail');
  if(!el)return;
  // Séances privées : on annonce clairement le masquage (le compteur, lui, reste exact)
  if(_friendSessionsPrivate){
    el.innerHTML=`<div style="background:var(--surf2);border-radius:14px;padding:16px;text-align:center;">
      <div style="font-size:22px;">🔒</div>
      <div style="font-size:14px;font-weight:600;color:var(--txt);margin-top:4px;">Séances privées</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px;">${_friendTotalSessions} séance${_friendTotalSessions>1?'s':''} enregistrée${_friendTotalSessions>1?'s':''}, mais le détail est masqué.</div>
    </div>`;
    return;
  }
  const daysWithSessions=days.filter(d=>(d.exercises||[]).some(e=>(e.sessions||[]).length>0));
  if(!daysWithSessions.length){
    el.innerHTML='<div style="font-size:12px;color:var(--muted);text-align:center;padding:10px 0;">Aucune séance enregistrée encore.</div>';
    return;
  }
  const parseCharge=s=>{const v=String(s.charges).replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(x=>!isNaN(x)&&x>0);return v.length?Math.max(...v):0;};
  el.innerHTML=`
    <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:10px;">Séances</div>
    ${daysWithSessions.map((d,i)=>{
      const exos=(d.exercises||[]).filter(e=>(e.sessions||[]).length>0);
      const totalExos=exos.length;
      return `
      <div style="margin-bottom:10px;border:1px solid var(--bdr);border-radius:14px;overflow:hidden;">
        <button onclick="toggleFriendDay(${i})" style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:14px 14px;background:linear-gradient(135deg,var(--surf2),var(--surf));border:none;color:var(--txt);font-weight:700;font-size:15px;">
          <span style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">🏋️</span>${d.name}</span>
          <span style="font-size:11px;color:var(--muted);font-weight:600;" id="friend-day-arrow-${i}">▸ ${totalExos} exo${totalExos>1?'s':''}</span>
        </button>
        <div id="friend-day-content-${i}" style="display:none;padding:6px 14px 14px;">
          ${exos.map(e=>{
            const sessions=(e.sessions||[]).slice();
            // Record = meilleure charge
            let recordMax=0,recordSess=null;
            sessions.forEach(s=>{const c=parseCharge(s);if(c>recordMax){recordMax=c;recordSess=s;}});
            const recent=sessions.slice().reverse();
            return `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--bdr);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-size:14px;font-weight:600;color:var(--txt);">${e.name}</div>
                ${recordMax>0?`<div style="display:flex;align-items:center;gap:5px;background:rgba(34,197,94,.12);border:1px solid #22c55e;border-radius:14px;padding:3px 8px;">
                  <span style="font-size:11px;">🏆</span>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;font-size:16px;color:#22c55e;line-height:1;">${recordMax} ${e.unit||'kg'}</span>
                  ${recordSess?.reps?`<span style="font-size:12px;color:var(--muted);">· ${recordSess.reps}</span>`:''}
                </div>`:''}
              </div>
              <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin:6px 0 3px;">Historique (${sessions.length})</div>
              ${recent.map(s=>{
                const isRecord=recordSess&&s.id===recordSess.id;
                return `
                <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:var(--muted);${isRecord?'font-weight:700;':''}">
                  <span>${s.date?s.date.slice(5).split('-').reverse().join('/'):''}${isRecord?' 🏆':''}</span>
                  <span style="color:${isRecord?'#22c55e':'var(--txt)'};">${s.charges||'—'} ${e.unit||'kg'}${s.reps?' × '+s.reps:''}</span>
                </div>`;
              }).join('')}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}`;
}
const ACTIVITES_ID='__activites';
function _ongletActivites(){
  return `<button class="stab stab-act${_currentDayId===ACTIVITES_ID?' on':''}" id="stab-${ACTIVITES_ID}" onclick="switchDay('${ACTIVITES_ID}')">🤸 Activités</button>`;
}
function renderWorkout(){
  const days=ST.days||[];
  const wrap=document.getElementById('seance-tabs-wrap'),cont=document.getElementById('seance-content');
  // Onglet « Activités » : les autres sports vivent ici, jamais dans un
  // programme de muscu.
  if(_currentDayId===ACTIVITES_ID){
    wrap.innerHTML=`<div class="seance-scroll">${days.map(d=>`
      <button class="stab" id="stab-${d.id}" onclick="switchDay('${d.id}')">${d.name}</button>`).join('')}${_ongletActivites()}<button class="stab-add" onclick="openModal('modal-add-seance')">+ Nouvelle</button></div>`;
    renderActivites();
    return;
  }
  if(!days.length){
    wrap.innerHTML=`<div class="seance-scroll">${_ongletActivites()}</div>`;
    cont.innerHTML=`<div class="empty-state"><div class="empty-em">💪</div><div class="empty-ttl">Aucune séance</div><div class="empty-sub">Appuie sur <strong style="color:var(--ac)">+</strong> en bas pour créer ta première séance.<br><br>Tu peux créer autant de séances que tu veux : Push, Pull, Legs, Cardio… Chacune contiendra ses propres exercices.</div><button class="empty-btn" onclick="openModal('modal-add-seance')">+ CRÉER UNE SÉANCE</button></div>`;
    return;
  }
  // Garder l'onglet actif ou prendre le premier
  if(!_currentDayId||!days.find(d=>d.id===_currentDayId))_currentDayId=days[0].id;
  // Afficher la recherche si au moins une séance avec exercices
  const hasExos = days.some(d=>(d.exercises||[]).length>0);
  const sw = document.getElementById('search-exo-wrap');
  if(sw) sw.style.display = hasExos ? 'block' : 'none';
  // Onglets de navigation — pastilles qui défilent (façon Apple Music)
  wrap.innerHTML=`<div class="seance-scroll">${days.map((d)=>`
      <button class="stab${d.id===_currentDayId?' on':''}" id="stab-${d.id}" onclick="switchDay('${d.id}')">${d.name}</button>
    `).join('')}${_ongletActivites()}<button class="stab-add" onclick="openModal('modal-add-seance')">+ Nouvelle</button></div>`;
  renderDayContent(_currentDayId);
}
function confirmDeleteSession(dayId, exoId, sessId){
  if(confirm('Supprimer cette session ?')){
    deleteSession(dayId, exoId, sessId);
  }
}
function closeExoMenu(){
  if(_activeMenu){ _activeMenu.remove(); _activeMenu=null; }
}
function showExoMenu(dayId, exoId, btn){
  closeExoMenu();
  const day=(ST.days||[]).find(d=>d.id===dayId);
  const exo=day?.exercises.find(e=>e.id===exoId);
  if(!exo)return;
  const isActive=isExoActive(exo);
  const rect=btn.getBoundingClientRect();
  const menu=document.createElement('div');
  menu.className='exo-menu';
  const day2=(ST.days||[]).find(d=>d.id===dayId);
  const exoIdx=day2?.exercises.findIndex(e=>e.id===exoId)??-1;
  const exoLen=day2?.exercises.length??0;
  menu.innerHTML=`
    <button class="exo-menu-item" onclick="closeExoMenu();moveExo('${dayId}','${exoId}',-1)" ${exoIdx<=0?'style="opacity:.4;pointer-events:none;"':''}>Monter<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
    <button class="exo-menu-item" onclick="closeExoMenu();moveExo('${dayId}','${exoId}',1)" ${exoIdx>=exoLen-1?'style="opacity:.4;pointer-events:none;"':''}>Descendre<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
    <button class="exo-menu-item" onclick="closeExoMenu();startEditExo('${dayId}','${exoId}')">Modifier<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="exo-menu-item danger" onclick="closeExoMenu();deleteExo('${dayId}','${exoId}')">Supprimer<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>`;
  // Positionner le menu
  menu.style.top=(rect.bottom+8)+'px';
  const mw=230;
  menu.style.left=Math.max(10,Math.min(rect.left,window.innerWidth-mw-10))+'px';
  document.body.appendChild(menu);
  _activeMenu=menu;
  // Fermer si on clique ailleurs
  setTimeout(()=>document.addEventListener('click', closeExoMenu, {once:true}), 10);
}
function moveExo(dayId, exoId, direction){
  const day=(ST.days||[]).find(d=>d.id===dayId);
  if(!day)return;
  const idx=day.exercises.findIndex(e=>e.id===exoId);
  if(idx<0)return;
  const newIdx=idx+direction;
  if(newIdx<0||newIdx>=day.exercises.length)return;
  const [moved]=day.exercises.splice(idx,1);
  day.exercises.splice(newIdx,0,moved);
  saveState();renderDayContent(dayId);
  toast(direction<0?'↑ Exercice monté':'↓ Exercice descendu','ok');
}
function startDaySession(dayId){
  const todayStr=new Date().toISOString().slice(0,10);
  if(!ST.sessionsStarted)ST.sessionsStarted=[];
  if(!ST.sessionsStartedAt)ST.sessionsStartedAt={};
  const key=dayId+'|'+todayStr;
  if(!ST.sessionsStarted.includes(key))ST.sessionsStarted.push(key);
  ST.sessionsStartedAt[key]=Date.now();
  saveState();
  renderDayContent(dayId);
}
function isExoCheckedToday(exo){
  const todayStr=new Date().toISOString().slice(0,10);
  // Coché manuellement ?
  const manualChecked=(ST.exoChecked||[]).includes(exo.id+'|'+todayStr);
  // Ou session saisie aujourd'hui (auto) sauf si explicitement décoché
  const hasToday=(exo.sessions||[]).some(s=>s.date===todayStr);
  const unchecked=(ST.exoUnchecked||[]).includes(exo.id+'|'+todayStr);
  return (manualChecked || hasToday) && !unchecked;
}
function toggleExoCheck(dayId,exoId){
  const todayStr=new Date().toISOString().slice(0,10);
  const day=(ST.days||[]).find(d=>d.id===dayId);
  const exo=day?.exercises.find(e=>e.id===exoId);
  const key=exoId+'|'+todayStr;
  if(!ST.exoChecked)ST.exoChecked=[];
  if(!ST.exoUnchecked)ST.exoUnchecked=[];
  const isChecked=isExoCheckedToday(exo);
  if(isChecked){
    // décocher : retirer du manuel + marquer décoché (pour annuler l'auto-session)
    const ci=ST.exoChecked.indexOf(key);if(ci>=0)ST.exoChecked.splice(ci,1);
    if(!ST.exoUnchecked.includes(key))ST.exoUnchecked.push(key);
  }else{
    // cocher : ajouter au manuel + retirer le décochage
    if(!ST.exoChecked.includes(key))ST.exoChecked.push(key);
    const ui=ST.exoUnchecked.indexOf(key);if(ui>=0)ST.exoUnchecked.splice(ui,1);
  }
  saveState();
  renderDayContent(dayId);
}
function renderCheckedExo(dayId,exo){
  const todayStr=new Date().toISOString().slice(0,10);
  const todaySess=(exo.sessions||[]).filter(s=>s.date===todayStr);
  const last=todaySess[todaySess.length-1];
  const val=last?escapeHtml(String(last.charges||'')):'';
  const unitLabel=exo.unit==='kg'?'kg':(exo.unit==='reps'?'reps':exo.unit||'');
  return `<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--surf);border-radius:14px;margin-bottom:8px;opacity:.55;">
    <button onclick="toggleExoCheck('${dayId}','${exo.id}')" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;background:var(--green);border:none;display:flex;align-items:center;justify-content:center;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <div style="flex:1;min-width:0;">
      <div style="font-size:16px;font-weight:600;letter-spacing:-.01em;text-decoration:line-through;text-decoration-color:var(--muted);">${exo.name}</div>
      ${val?`<div style="font-size:13px;color:var(--muted);margin-top:2px;">${val} ${unitLabel}</div>`:''}
    </div>
  </div>`;
}
function renderExoCard(dayId,exo,showCheck){
  // Exercice lié : la carte montre l'historique de TOUTES les séances, donc
  // le record affiché est le vrai record, pas celui de cette séance seule.
  const sessions=exo.lie?historiqueGlobal(exo.name):(exo.sessions||[]);
  const maxVal=sessions.length?Math.max(...sessions.map(s=>{const n=String(s.charges).replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);return n.length?Math.max(...n):0;})):0;
  const dispMax=unit==='imperial'&&exo.unit==='kg'?Math.round(maxVal*2.2046*10)/10:maxVal;
  const dispUnit=unit==='imperial'&&exo.unit==='kg'?'lbs':exo.unit;
  const hint=getProgressionHint(exo);
  const activePhase=getActivePhase(exo);
  // Priorité au rappel de phase en cours : pas la peine de re-signaler une
  // stagnation qu'on a déjà choisi de traiter.
  const hintIcon=(!activePhase&&hint)
    ? `<span onclick="event.stopPropagation();openPlateauSheet('${dayId}','${exo.id}')" style="cursor:pointer;margin-left:8px;font-size:17px;" title="Conseil de progression">${hint.icon}</span>`
    : '';
  // Rappel discret : juste la phase et où on en est. Le détail complet
  // reste à un tap, dans la feuille — la carte est déjà bien chargée.
  const phaseBadge=activePhase?`<span onclick="event.stopPropagation();openPlateauSheet('${dayId}','${exo.id}')" style="display:inline-flex;align-items:center;gap:4px;background:color-mix(in srgb, ${activePhase.c} 16%, transparent);border-radius:8px;padding:3px 9px;font-size:12px;font-weight:600;color:${activePhase.c};cursor:pointer;">${activePhase.ic} ${activePhase.nom} ${activePhase.seance}/${activePhase.total}</span>`:'';
  const active=isExoActive(exo);
  const nbSessions=sessions.length;
  // Meilleur 1RM estimé (si option activée et unité kg)
  let best1RM=null;
  if(exo.show1RM&&exo.unit==='kg'){
    sessions.forEach(s=>{
      const charges=String(s.charges).replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);
      const repsM=String(s.reps||'').match(/(\d+)\s*$/)||String(s.reps||'').match(/×\s*(\d+)/)||String(s.reps||'').match(/(\d+)/);
      const reps=repsM?parseInt(repsM[1]):null;
      if(reps&&charges.length){
        const maxC=Math.max(...charges);
        const est=Math.round(maxC*(1+reps/30));
        if(est&&(!best1RM||est>best1RM))best1RM=est;
      }
    });
  }
  // En-tête : checkbox ronde (si séance commencée) + nom + progression, badge Actif
  const checkedToday=isExoCheckedToday(exo);
  const checkboxHtml=showCheck?`<button onclick="event.stopPropagation();toggleExoCheck('${dayId}','${exo.id}')" style="flex-shrink:0;width:26px;height:26px;border-radius:50%;margin-top:2px;${checkedToday?'background:var(--green);border:none;':'background:transparent;border:2px solid var(--bdr);'}display:flex;align-items:center;justify-content:center;">${checkedToday?'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':''}</button>`:'';
  let html=`<div class="a-exo" data-exo-id="${exo.id}" data-day-id="${dayId}">
    <div class="a-exo-top">
      <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;">
        ${checkboxHtml}
        <div style="min-width:0;">
          <div class="a-exo-name">${exo.name}${hintIcon}<button onclick="event.stopPropagation();openExoDetails('${exo.name.replace(/'/g,"\\'")}')" title="Muscles travaillés" style="margin-left:7px;width:19px;height:19px;border-radius:50%;border:1.5px solid var(--ac);background:none;color:var(--ac);font-size:12px;font-weight:700;font-family:inherit;line-height:1;padding:0;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;cursor:pointer;">i</button></div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
            <span style="font-size:13px;color:var(--muted);">${exo.group?escapeHtml(exo.group):'Exercice'}</span>
            ${phaseBadge}
          </div>
        </div>
      </div>
      <button class="a-exo-badge ${active?'on':'off'}" onclick="event.stopPropagation();toggleExoActive('${dayId}','${exo.id}')" title="Basculer actif/inactif">${active?'Actif':'Inactif'}</button>
    </div>`;

  // Grand chiffre record (signature démo)
  if(maxVal>0){
    html+=`<div class="a-exo-pr"><span class="n">${dispMax}</span><span class="u">${dispUnit} record</span></div>`;
    if(best1RM){
      html+=`<div style="font-size:14px;color:var(--ac);font-weight:600;margin-top:6px;letter-spacing:-.008em;">≈ ${best1RM} kg de max estimé (1RM)</div>`;
    }
  }else{
    html+=`<div style="font-size:15px;color:var(--muted);">Aucune donnée · ajoute ta première session</div>`;
  }

  // Méta : réglage / repos / séries (ligne façon démo)
  const metaItems=[];
  if(exo.reglage)metaItems.push({k:'Réglage',v:escapeHtml(exo.reglage)});
  if(exo.rest)metaItems.push({k:'Repos',v:fmtRest(exo.rest)});
  metaItems.push({k:'Sessions',v:nbSessions});
  html+=`<div class="a-exo-meta">${metaItems.map(m=>`<div class="item"><div class="k">${m.k}</div><div class="v">${m.v}</div></div>`).join('')}</div>`;

  // Actions — le bouton +Session n'apparaît que si la séance est commencée
  html+=`<div class="a-exo-acts" style="margin-top:18px;">
      ${(exo.active!==false && showCheck)?`<button class="eb" onclick="startAddSession('${dayId}','${exo.id}')">+ Session</button>`:''}
      <button class="eb dots" onclick="showExoMenu('${dayId}','${exo.id}',this)">⋯</button>
    </div>`;

  // Graphique Chart.js (conservé)
  if(sessions.length){
    const allSess=sessions.slice().sort((a,b)=>b.date.localeCompare(a.date));
    const dispSess=allSess.slice(0,5);
    const extraSess=allSess.length-5;
    const histId=`hist-${dayId}-${exo.id}`;
    let histOpen=false;
    try{const states={...JSON.parse(localStorage.getItem('kf-hist-state')||'{}'),...(ST.uiState||{})};if(states[histId]===true)histOpen=true;}catch(e){}
    if(sessions.length>=2)html+=`<div class="chart-wrap" style="margin-top:18px;"><canvas id="chart-${dayId}-${exo.id}"></canvas></div>`;
    html+=`<button onclick="toggleHist('${histId}')" style="font-size:13px;font-weight:600;color:var(--muted);background:none;border:none;padding:12px 0 4px;cursor:pointer;display:flex;align-items:center;gap:5px;" id="btn-${histId}">${histOpen?'▾':'▸'} Historique · ${sessions.length} session${sessions.length>1?'s':''}</button>`;
    html+=`<div id="${histId}" style="display:${histOpen?'block':'none'};"><div class="sess-list">`;
    if(extraSess>0) html+=`<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-style:italic;">5 dernières sur ${allSess.length}</div>`;
    html+=dispSess.map(s=>{
      let sc=s.charges;
      if(exo.unit==='kg'&&unit==='imperial')sc=String(s.charges).replace(/([0-9]+\.?[0-9]*)/g,m=>Math.round(parseFloat(m)*2.2046*10)/10);
      return `<div class="srow"><span class="srow-date">${s.date.slice(5).split('-').reverse().join('/')}</span><span class="srow-val">${sc} ${dispUnit}</span>${s.reps?`<span class="srow-reps">${s.reps}</span>`:''}<button class="srow-edit" onclick="showSessMenu('${dayId}','${exo.id}','${s.id}',this)" style="font-size:16px;padding:4px 8px;color:var(--muted);">⋯</button></div>`;
    }).join('')+`</div></div>`;
  }
  return html+`</div>`;
}
function renderExoCharts(dayId){
  const day=(ST.days||[]).find(d=>d.id===dayId);if(!day)return;
  (day.exercises||[]).forEach(exo=>{
    // Exercice lié : une courbe par séance, chacune sa couleur, pour voir
    // où l'on progresse le mieux. Sinon, la courbe de cette séance seule.
    if(exo.lie){ renderExoChartLie(dayId,exo); return; }
    const s=exo.sessions||[];if(s.length<2)return;
    const canvasId=`chart-${dayId}-${exo.id}`;
    const ctx=document.getElementById(canvasId);if(!ctx)return;
    const sorted=s.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const labels=sorted.map(s=>s.date.slice(5).split('-').reverse().join('/'));
    const fullDates=sorted.map(s=>{const[y,m,d]=s.date.split('-');return d+'/'+m+'/'+y;});
    const unitLabel=exo.unit==='kg'?(unit==='imperial'?'lbs':'kg'):(exo.unit||'');
    const data=sorted.map(s=>{const n=String(s.charges).replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);const v=n.length?Math.max(...n):0;return unit==='imperial'&&exo.unit==='kg'?Math.round(v*2.2046*10)/10:v;});
    // Espacement des dates : on laisse Chart.js gerer l'auto-skip avec une
    // rotation nulle. maxTicksLimit borne le nombre d'etiquettes, et
    // autoSkip evite tout chevauchement quel que soit le nombre de points.
    try{
      const chart=new Chart(ctx,{type:'line',data:{labels,datasets:[{data,borderColor:getAccentColor(),backgroundColor:getAccentColorAlpha(.1),borderWidth:2,pointBackgroundColor:getAccentColor(),pointRadius:3,pointHoverRadius:5,tension:0,fill:true}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{left:6,right:14}},plugins:{legend:{display:false},tooltip:{callbacks:{title:(items)=>fullDates[items[0].dataIndex],label:(item)=>item.parsed.y+' '+unitLabel}}},scales:{x:{grid:{display:false},ticks:{color:'#888',font:{size:9},maxRotation:0,minRotation:0,autoSkip:true,maxTicksLimit:5}},y:{grid:{color:'rgba(128,128,128,.05)'},ticks:{color:'#888',font:{size:9}}}}}});
      _chartInstances[canvasId]=chart;
    }catch(e){}
  });
}
function dropExo(targetCard){
  if(!_dragSrc||!_dragDayId)return;
  const day=(ST.days||[]).find(d=>d.id===_dragDayId);
  if(!day)return;
  const srcId=_dragSrc.getAttribute('data-exo-id');
  const tgtId=targetCard.getAttribute('data-exo-id');
  if(!srcId||!tgtId||srcId===tgtId)return;
  const exos=day.exercises;
  const si=exos.findIndex(e=>e.id===srcId);
  const ti=exos.findIndex(e=>e.id===tgtId);
  if(si<0||ti<0)return;
  const [moved]=exos.splice(si,1);
  exos.splice(ti,0,moved);
  saveState();renderDayContent(_dragDayId);
  toast('✓ Ordre mis à jour','ok');
}
function useSessionTemplate(tab,idx){
  const list=tab==='preset'?PRESET_TEMPLATES:(ST.templates||[]);
  const t=list[idx];
  if(!t){toast('Template introuvable','err');return;}
  if(!ST.days)ST.days=[];
  const today=new Date().toISOString().slice(0,10);
  const base=Date.now();
  const day={id:base+'',name:t.name,exercises:(t.exercises||[]).map((e,j)=>{
    const exo={id:(base+j+1)+'',name:e.name,unit:e.unit||'kg',group:e.group||'',sessions:[],active:true};
    // Note : on ne pré-remplit PAS de session. L'utilisateur saisit ses vraies perfs
    // manuellement, sinon l'exo serait compté comme "fait aujourd'hui" par erreur.
    if(e.charge&&e.reps){
      exo.suggested={charge:e.charge,reps:e.reps,sets:e.sets||3};
    }
    return exo;
  })};
  ST.days.push(day);
  _currentDayId=day.id;
  saveState();
  // Fermer tous les modals liés
  closeModal('modal-templates');
  closeModal('modal-add-seance');
  toast('✓ Séance "'+t.name+'" créée !','ok');
  // Basculer vers la page séances et forcer le rendu
  goPage('workout');
  setTimeout(()=>{try{renderWorkout();}catch(e){}},250);
}
function addSeance(){
  const name=document.getElementById('new-seance-name').value.trim();
  if(!name){toast('Donne un nom à ta séance','err');return;}
  if(!ST.days)ST.days=[];
  const day={id:Date.now()+'',name,exercises:[]};
  ST.days.push(day);
  _currentDayId=day.id; // Switcher vers la nouvelle séance
  document.getElementById('new-seance-name').value='';
  saveState();closeModal('modal-add-seance');
  goPage('workout');
  toast('✓ Séance "'+name+'" créée','ok');
}
function pickExo(name, unit, group){
  document.getElementById('new-exo-name').value = name;
  const grpEl=document.getElementById('new-exo-group');
  if(grpEl&&group)grpEl.value=group;
  OB['exo-unit'] = unit;
  document.querySelectorAll('#chips-exo-unit .chip').forEach(c => {
    c.classList.toggle('on', c.textContent.trim() === unit);
  });
  // Passer directement à l'étape 2 (réglages)
  goExoStep2();
}
function getExoMuscles(name){
  const s=(name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const has=(...k)=>k.some(x=>s.includes(x));
  let P=[],S=[]; // primaires, secondaires
  // ── ISCHIOS (AVANT le curl générique : "leg curl" contient "curl") ──
  if(has('leg curl','leg-curl','curl allonge','curl assis','curl ischio','roumain','good morning','nordic','souleve de terre jambes tendues')){
    P=['ischios']; S=['fessiers','lombaires'];
  }
  // ── LOMBAIRES (aussi AVANT le curl générique : "lower back curl") ──
  else if(has('lower back','lombaire','extension lombaire','hyperextension','banc a lombaires','back extension','superman')){
    P=['lombaires']; S=['fessiers','ischios'];
  }
  // ── PECTORAUX ──
  else if(has('developpe couche','developpe incline','developpe decline','developpe machine','chest press','ecarte','butterfly','pec deck','pompe','push up','push-up','vis-a-vis','cable cross','dips (pecto)','dips pecto')){
    P=['pecs']; S=['deltoides-ant','triceps'];
  }
  // ── DOS (grand dorsal) ──
  else if(has('traction','pull up','pull-up','tirage vertical','tirage nuque','tirage horizontal','tirage diagonal','tirage poulie','lat pulldown','rowing','pull-over','pull over')){
    P=['dorsaux']; S=['biceps','deltoides-post','trapezes'];
    if(has('pull-over','pull over')){P=['dorsaux'];S=['pecs','triceps'];}
  }
  // ── TRAPÈZES / LOMBAIRES ──
  else if(has('soulevé de terre','souleve de terre','rack pull')){
    P=['dorsaux','lombaires']; S=['fessiers','ischios','trapezes','avant-bras'];
  }
  else if(has('shrug','haussement')){ P=['trapezes']; S=['avant-bras']; }
  else if(has('face pull')){ P=['deltoides-post','trapezes']; S=['biceps']; }
  // ── ÉPAULES ──
  else if(has('developpe militaire','developpe haltere','arnold','developpe epaule','shoulder press','landmine')){
    P=['deltoides-ant']; S=['triceps','trapezes'];
  }
  else if(has('elevation laterale','elevations laterale','elevation poulie','elevation halteres')){ P=['deltoides-lat']; S=['trapezes']; }
  else if(has('elevation frontale','elevations frontale')){ P=['deltoides-ant']; S=['deltoides-lat']; }
  else if(has('oiseau','rear delt','rear-delt','reverse fly','delto post','deltoide post','delt post','peck deck inverse')){ P=['deltoides-post']; S=['trapezes']; }
  else if(has('upright row','tirage menton','rowing menton')){ P=['deltoides-lat','trapezes']; S=['biceps']; }
  // ── BICEPS (curl de BRAS uniquement — jambes/dos traités plus haut) ──
  else if(has('preacher','larry scott') || (has('biceps')&&!has('extension')) || (has('curl') && !has('leg','jambe','ischio','allonge','assis','back','dos','lombaire'))){
    P=['biceps']; S=['avant-bras']; if(has('marteau'))S=['avant-bras','brachial'];
  }
  // ── TRICEPS ──
  else if(has('extension triceps','extension triche','extension tricep','barre au front','skull','extension nuque','extension corde','pushdown','poulie triceps','developpe couche serre','dips') || (has('kickback')&&!has('fessier'))){
    P=['triceps']; S=['deltoides-ant'];
  }
  // ── QUADRICEPS ──
  else if(has('squat','presse','leg extension','fente','hack','leg-extension','bulgare','bulgarian','sissy','goblet')){
    P=['quadriceps']; S=['fessiers','ischios'];
    if(has('sumo','avant','front'))S=['fessiers','adducteurs'];
    if(has('presse'))P=['quadriceps'],S=['fessiers'];
  }
  // ── FESSIERS ──
  else if(has('hip thrust','glute bridge','pont fessier','donkey kick','glutes kick','glute kick','abduction','abducteur','kickback fessier','fentes marchee')){
    P=['fessiers']; S=['ischios','quadriceps'];
  }
  // ── MOLLETS ──
  else if(has('mollet','calf')){ P=['mollets']; S=[]; }
  // ── ABDOS ──
  else if(has('gainage','releve de jambe','releves de jambe','releve de genoux','crunch','sit-up','situp','dead bug','v-up','hollow','russian twist','twister','rotation buste','ab wheel','roulette','mountain climber','plank','planche')){
    P=['abdos']; S=['obliques'];
    if(has('twist','oblique','rotation'))P=['obliques'],S=['abdos'];
  }
  // ── ADDUCTEURS / ABDUCTEURS ──
  else if(has('farmer','wrist curl','poigne')){ P=['avant-bras']; S=['trapezes']; }
  else if(has('adducteur','adduction')){ P=['adducteurs']; S=['quadriceps']; }
  else if(has('abducteur')){ P=['fessiers']; S=['quadriceps']; }
  // ── CARDIO (pas de muscle isolé) ──
  else if(has('course','velo','elliptique','rameur','tapis','corde a sauter','stairmaster','burpee')){
    P=['cardio']; S=[];
  }
  return {primary:P,secondary:S};
}
function getExoGuide(name){
  const s=(name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return EXO_GUIDES.find(g=>g.k.some(k=>s.includes(k)))||null;
}
function openExoDetails(name){
  const {primary,secondary}=getExoMuscles(name);
  const primC=getAccentColor?getAccentColor():'#7c3aed';
  const secC=getAccentColorAlpha?getAccentColorAlpha(.4):'rgba(124,58,237,.4)';
  // Injecter les silhouettes
  const front=document.getElementById('exo-body-front');
  const back=document.getElementById('exo-body-back');
  if(front)front.innerHTML=bodySVG('front');
  if(back)back.innerHTML=bodySVG('back');
  // Colorer les muscles (avant + arrière, gauche + droite) avec animation
  const paint=(muscle,color,cls)=>{
    ['m-'+muscle,'m-'+muscle+'-l','m-'+muscle+'-r'].forEach(id=>{
      // querySelectorAll : certains ids existent dans les DEUX silhouettes (ex. mollets)
      document.querySelectorAll('#exo-body-front [id="'+id+'"], #exo-body-back [id="'+id+'"]').forEach(el=>{
        el.style.fill=color;
        el.style.color=color; // pour le halo (drop-shadow currentColor)
        el.classList.add(cls);
      });
    });
  };
  primary.forEach(m=>paint(m,primC,'muscle-pri'));
  secondary.forEach(m=>paint(m,secC,'muscle-sec'));
  // Titre + légende texte
  const t=document.getElementById('exo-details-title');if(t)t.textContent=name;
  const muscleNames={pecs:'Pectoraux','deltoides-ant':'Deltoïdes antérieurs','deltoides-lat':'Deltoïdes latéraux','deltoides-post':'Deltoïdes postérieurs',dorsaux:'Grand dorsal',trapezes:'Trapèzes',lombaires:'Lombaires',biceps:'Biceps',triceps:'Triceps','avant-bras':'Avant-bras',brachial:'Brachial',abdos:'Abdominaux',obliques:'Obliques',quadriceps:'Quadriceps',ischios:'Ischio-jambiers',fessiers:'Fessiers',mollets:'Mollets',adducteurs:'Adducteurs',cardio:'Système cardio'};
  const legend=document.getElementById('exo-muscles-legend');
  if(legend){
    if(primary[0]==='cardio'){
      legend.innerHTML='<div style="font-size:14px;color:var(--muted);text-align:center;padding:8px;">Exercice cardio — sollicite le système cardiovasculaire global.</div>';
    }else{
      let h='';
      if(primary.length)h+=`<div style="margin-bottom:10px;"><div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">Muscles principaux</div>${primary.map(m=>`<span style="display:inline-block;background:${primC};color:#fff;font-size:13px;font-weight:600;padding:5px 12px;border-radius:20px;margin:0 6px 6px 0;">${muscleNames[m]||m}</span>`).join('')}</div>`;
      if(secondary.length)h+=`<div><div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">Muscles secondaires</div>${secondary.map(m=>`<span style="display:inline-block;background:var(--surf2);color:var(--txt);font-size:13px;padding:5px 12px;border-radius:20px;margin:0 6px 6px 0;">${muscleNames[m]||m}</span>`).join('')}</div>`;
      legend.innerHTML=h||'<div style="font-size:14px;color:var(--muted);text-align:center;padding:8px;">Muscles non répertoriés pour cet exercice.</div>';
    }
  }
  // Guide d'exécution (étapes numérotées + conseils de forme)
  const guide=getExoGuide(name);
  const gEl=document.getElementById('exo-guide');
  if(gEl){
    if(guide){
      gEl.innerHTML=`
      <div style="text-align:left;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:8px;">Exécution</div>
        <div style="background:var(--surf2);border-radius:16px;padding:14px;">
          ${guide.s.map((st,i)=>`<div style="display:flex;gap:12px;align-items:flex-start;${i<guide.s.length-1?'margin-bottom:12px;':''}">
            <span style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--ac);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;">${i+1}</span>
            <span style="font-size:14px;line-height:1.5;color:var(--txt);letter-spacing:-.006em;">${st}</span>
          </div>`).join('')}
        </div>
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;margin:14px 0 8px;">💡 Conseils</div>
        ${guide.t.map(t=>`<div style="background:var(--surf2);border-left:3px solid var(--ac);border-radius:12px;padding:11px 14px;margin-bottom:8px;font-size:14px;line-height:1.5;color:var(--txt);letter-spacing:-.006em;">${t}</div>`).join('')}
      </div>`;
    }else{
      gEl.innerHTML='';
    }
  }
  openModal('modal-exo-details');
}
// toggleExoCat supprimee : les accordeons ont laisse place aux filtres
// horizontaux (voir setExoCat dans index.html).
function startAddExo(dayId){
  _dayId=dayId;
  document.getElementById('new-exo-name').value='';
  const grpEl=document.getElementById('new-exo-group');if(grpEl)grpEl.value='';
  const regEl=document.getElementById('new-exo-reglage');if(regEl)regEl.value='';
  const restEl=document.getElementById('new-exo-rest');if(restEl)restEl.value='';
  document.querySelectorAll('#exo-rest-presets .rest-chip').forEach(c=>c.classList.remove('on'));
  OB['exo-unit']='kg';
  document.querySelectorAll('#chips-exo-unit .chip').forEach((c,i)=>c.classList.toggle('on',i===0));
  _exoCat='Tous';
  _exoFilter='';
  _customMode=false;
  renderExoCategories();
  // Dans un programme de muscu, on ajoute un exercice de muscu : directement
  // la liste. Les autres sports passent par l'onglet « Activités ».
  document.getElementById('addexo-step0').style.display='none';
  document.getElementById('addexo-step1').style.display='block';
  document.getElementById('addexo-step2').style.display='none';
  document.getElementById('addexo-creneau').style.display='none';
  const t=document.getElementById('addexo-ttl'); if(t)t.textContent='+ Ajouter un exercice';
  _sportChoisi='muscu';
  _nomPerso='';
  _dateActivite=null;
  openModal('modal-add-exo');
}
// ── Sports ──────────────────────────────────────────────────────────
// La musculation garde la couleur du theme (elle suit donc les changements
// de theme) ; les autres sports ont une couleur fixe, pour qu'un jour a deux
// sports se lise d'un coup d'oeil dans le calendrier.
const SPORTS=[
  {k:'muscu', e:'🏋️', n:'Musculation', c:'var(--ac)'},
  {k:'course',e:'🏃', n:'Course',      c:'#FF9500'},
  {k:'nat',   e:'🏊', n:'Natation',    c:'#0A84FF'},
  {k:'velo',  e:'🚴', n:'Vélo',        c:'#30D158'},
  {k:'foot',  e:'⚽', n:'Football',    c:'#64D2FF'},
  {k:'basket',e:'🏀', n:'Basket',      c:'#FF453A'},
  {k:'boxe',  e:'🥊', n:'Boxe',        c:'#FF375F'},
  {k:'yoga',  e:'🧘', n:'Yoga',        c:'#BF5AF2'},
  {k:'tennis',e:'🎾', n:'Tennis',      c:'#FFD60A'},
  // Apple Sante et Fitbit la comptent comme une activite physique : on fait
  // pareil, avec des durees plus courtes que pour une seance de sport.
  {k:'sexe',  e:'❤️‍🔥', n:'Sexe',      c:'#FF2D55', durs:['10 min','15 min','20 min','30 min','45 min','1 h']},
  {k:'autre', e:'✨', n:'Autre',       c:'#8E8E93'},
];
const CRENEAU_DURS=['30 min','45 min','1 h','1 h 30','2 h'];
let _sportChoisi=null,_creneauDur='1 h',_nomPerso='',_dateActivite=null;
function sportById(k){ return SPORTS.find(s=>s.k===k)||null; }
function escSport(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// Nom affiche d'une seance : le nom personnalise s'il existe, sinon le sport.
function sportNom(sess){
  if(sess&&sess.nom)return sess.nom;
  const s=sportById(sess&&sess.sport);
  return s?s.n:((sess&&sess.sport)||'Activité');
}
// Activites nommees a la main : on les repropose en raccourci la fois suivante.
function sportsPerso(){ return (typeof ST!=='undefined'&&ST.sportsPerso)||[]; }
function memoriserPerso(nom){
  if(!nom)return;
  if(!ST.sportsPerso)ST.sportsPerso=[];
  const i=ST.sportsPerso.findIndex(n=>n.toLowerCase()===nom.toLowerCase());
  if(i>=0)ST.sportsPerso.splice(i,1);
  ST.sportsPerso.unshift(nom);
  if(ST.sportsPerso.length>8)ST.sportsPerso.length=8;
}
function oublierPerso(i){
  const l=sportsPerso(); if(!l[i])return;
  if(!confirm(`Retirer « ${l[i]} » de tes activités ?`))return;
  ST.sportsPerso.splice(i,1);
  saveState();
  renderSportsGrid();
}
function _tuileSport(emo,nom,coul,on,clic,extra){
  return `<button onclick="${clic}" style="position:relative;padding:16px 12px;border-radius:15px;display:flex;flex-direction:column;align-items:center;gap:7px;font-family:inherit;border:1.5px solid ${on?coul:'transparent'};background:${on?`color-mix(in srgb, ${coul} 14%, var(--surf2))`:'var(--surf2)'};">
      <span style="font-size:26px;">${emo}</span>
      <span style="font-size:13.5px;font-weight:600;color:${on?coul:'var(--txt)'};text-align:center;line-height:1.2;">${nom}</span>${extra||''}
    </button>`;
}
function renderSportsGrid(){
  const el=document.getElementById('sports-grid'); if(!el)return;
  let html=SPORTS.filter(s=>s.k!=='muscu').map(s=>_tuileSport(s.e,escSport(s.n),s.c,_sportChoisi===s.k&&!_nomPerso,`pickSport('${s.k}')`)).join('');
  html+=sportsPerso().map((n,i)=>{
    const on=_sportChoisi==='autre'&&_nomPerso.toLowerCase()===String(n).toLowerCase();
    const croix=`<span onclick="event.stopPropagation();oublierPerso(${i})" style="position:absolute;top:3px;right:5px;font-size:12px;color:var(--muted);padding:4px;line-height:1;">✕</span>`;
    return _tuileSport('✨',escSport(n),'#8E8E93',on,`pickPerso(${i})`,croix);
  }).join('');
  el.innerHTML=html;
  const b=document.getElementById('sport-continue');
  const s=sportById(_sportChoisi);
  const label=_nomPerso||(s?s.n:'');
  if(b){
    b.textContent=s?`Continuer avec ${label}`:'Choisis un sport';
    b.style.background=s?s.c:'var(--ac)';
    b.style.opacity=s?'1':'.45';
  }
}
function pickSport(k){ _sportChoisi=k; _nomPerso=''; renderSportsGrid(); }
function pickPerso(i){
  const n=sportsPerso()[i]; if(!n)return;
  _sportChoisi='autre'; _nomPerso=n; renderSportsGrid();
}
function backToSports(){
  document.getElementById('addexo-step0').style.display='block';
  document.getElementById('addexo-step1').style.display='none';
  document.getElementById('addexo-step2').style.display='none';
  document.getElementById('addexo-creneau').style.display='none';
  const t=document.getElementById('addexo-ttl');
  if(t)t.textContent='+ Ajouter une activité';
}
function goSportStep(){
  const s=sportById(_sportChoisi);
  if(!s){toast('Choisis un sport','err');return;}
  document.getElementById('addexo-step0').style.display='none';
  const t=document.getElementById('addexo-ttl');
  if(_sportChoisi==='muscu'){
    if(t)t.textContent='+ Ajouter un exercice';
    document.getElementById('addexo-step1').style.display='block';
    renderExoCategories();
  }else{
    if(t)t.textContent=s.e+' '+(_nomPerso||s.n);
    document.getElementById('addexo-creneau').style.display='block';
    // "Autre" : l'activite porte le nom qu'on lui donne.
    const nw=document.getElementById('creneau-nom-wrap');
    const ni=document.getElementById('creneau-nom');
    if(nw)nw.style.display=(_sportChoisi==='autre')?'block':'none';
    if(ni&&_sportChoisi==='autre')ni.value=_nomPerso||'';
    const sv=document.getElementById('creneau-save'); if(sv)sv.style.background=s.c;
    // Date : aujourd'hui par defaut, mais on peut rattraper une seance oubliee.
    // Jamais dans le futur : pour ca, il y a « Programmer une seance ».
    const di=document.getElementById('creneau-date');
    if(di){ const auj=ymdLocal(); di.value=(_dateActivite&&_dateActivite<=auj)?_dateActivite:auj; di.max=auj; }
    // Chaque sport peut avoir ses propres durees (le sexe se compte en minutes,
    // pas en heures). On recale la duree choisie si elle n'existe pas dans la liste.
    const durs=s.durs||CRENEAU_DURS;
    if(durs.indexOf(_creneauDur)<0)_creneauDur=durs[Math.min(2,durs.length-1)];
    renderCreneauDurs(s.c);
  }
}
function renderCreneauDurs(c){
  const el=document.getElementById('creneau-durs'); if(!el)return;
  const s=sportById(_sportChoisi);
  const durs=(s&&s.durs)||CRENEAU_DURS;
  el.innerHTML=durs.map(d=>{
    const on=d===_creneauDur;
    return `<button onclick="_creneauDur='${d}';renderCreneauDurs('${c}')" style="padding:9px 14px;border-radius:12px;font-size:13.5px;font-weight:600;font-family:inherit;border:1.5px solid ${on?c:'transparent'};background:${on?`color-mix(in srgb, ${c} 16%, var(--surf2))`:'var(--surf2)'};color:${on?c:'var(--muted)'};">${d}</button>`;
  }).join('');
}
// Une seance d'un autre sport n'a ni series ni charges : on la stocke a part,
// dans une liste simple, pour qu'elle apparaisse quand meme au calendrier.
const SPORT_XP=30;   // autant qu'une seance de muscu terminee
function saveCreneauSport(){
  const s=sportById(_sportChoisi); if(!s)return;
  const heure=(document.getElementById('creneau-heure')||{}).value||'';
  const note=((document.getElementById('creneau-note')||{}).value||'').trim();
  const auj=ymdLocal();
  let date=((document.getElementById('creneau-date')||{}).value||'').trim()||auj;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))date=auj;
  if(date>auj){ toast('Pas de séance dans le futur : utilise « Programmer une séance »','err'); return; }
  let nom='';
  if(_sportChoisi==='autre'){
    nom=((document.getElementById('creneau-nom')||{}).value||'').trim();
    if(!nom){ toast('Donne un nom à ton activité','err'); const ni=document.getElementById('creneau-nom'); if(ni)ni.focus(); return; }
    if(nom.length>28)nom=nom.slice(0,28);
    memoriserPerso(nom);
    _nomPerso=nom;
  }
  if(!ST.sportSessions)ST.sportSessions=[];
  const id=Date.now()+'';
  // XP : comme une seance de muscu, plus le bonus si ce jour etait programme.
  // On garde le montant sur la seance pour le reprendre si on la supprime :
  // sinon ajouter puis supprimer en boucle ferait monter l'XP a l'infini.
  let bonusPrevu=0;
  try{ bonusPrevu=claimPlannedBonus(date)||0; }catch(e){}
  const xp=SPORT_XP+bonusPrevu;
  ST.sportSessions.push({ id, sport:s.k, date, heure, duree:_creneauDur, note, nom, xp, bonusPrevu });
  if(!ST.sessions_log)ST.sessions_log=[];
  ST.sessions_log.push({date, xp, pr:0, sid:id});
  saveState();
  closeModal('modal-add-exo');
  try{ addXp(xp); }catch(e){}          // rafraichit aussi le streak et l'objectif hebdo
  try{renderDayContent(_dayId);}catch(e){}
  try{renderActivityCalendar();}catch(e){}
  try{renderMonthly();}catch(e){}
  try{ if(_currentDayId===ACTIVITES_ID)renderActivites(); }catch(e){}
  _dateActivite=null;
  const quand=(date===auj)?'':' ('+date.slice(8)+'/'+date.slice(5,7)+')';
  toast(`${s.e} ${nom||s.n} enregistré${quand} · +${xp} XP`,'ok');
  try{ checkAchievements(); }catch(e){}
}
function deleteSportSession(id){
  if(!confirm('Supprimer cette séance ?'))return;
  const sess=(ST.sportSessions||[]).find(x=>x.id===id);
  ST.sportSessions=(ST.sportSessions||[]).filter(x=>x.id!==id);
  if(ST.sessions_log)ST.sessions_log=ST.sessions_log.filter(l=>l.sid!==id);
  // On reprend l'XP donne pour cette seance (les anciennes, d'avant ce
  // systeme, n'en avaient pas : rien a reprendre).
  const rendu=(sess&&sess.xp)||0;
  if(sess&&sess.bonusPrevu){ try{ const p=plannedOf(sess.date); if(p)p.done=false; }catch(e){} }
  saveState();
  if(rendu){
    try{
      addXp(-rendu);
      if(ST.xp<0)ST.xp=0;
      if(ST.seasonXp<0)ST.seasonXp=0;
    }catch(e){}
  }else{
    try{updateGamification();}catch(e){}
  }
  saveState();
  try{renderDayContent(_currentDayId);}catch(e){}
  try{renderDayContent(_dayId);}catch(e){}
  try{renderActivityCalendar();}catch(e){}
  try{renderMonthly();}catch(e){}
  try{ if(_currentDayId===ACTIVITES_ID)renderActivites(); }catch(e){}
  // Si le bilan du jour est ouvert, on le redessine : la ligne supprimee doit
  // disparaitre sous les yeux, pas au prochain clic.
  try{
    const md=document.getElementById('modal-day');
    if(md&&md.classList.contains('on')&&typeof _daySummaryDate!=='undefined'&&_daySummaryDate){
      showDaySummary(_daySummaryDate);
    }
  }catch(e){}
  toast(rendu?`Séance supprimée · −${rendu} XP`:'Séance supprimée','ok');
}
// ══════════ ONGLET ACTIVITÉS ══════════
// Ajout en un toucher (une pastille par sport), puis les activités des
// 4 dernières semaines, regroupées par semaine. Les plus anciennes restent
// consultables dans le calendrier de l'accueil : la liste ne grossit jamais.
function _minutesDuree(d){
  const s=String(d||'');
  let m=s.match(/(\d+)\s*h\s*(\d+)?/);
  if(m)return parseInt(m[1],10)*60+(m[2]?parseInt(m[2],10):0);
  m=s.match(/(\d+)\s*min/);
  return m?parseInt(m[1],10):0;
}
function _fmtMinutes(t){
  if(!t)return '';
  const h=Math.floor(t/60), m=t%60;
  return h?(h+' h'+(m?' '+String(m).padStart(2,'0'):'')):(m+' min');
}
// Ouvre directement le creneau d'un sport (k), ou la grille (k vide).
// dateStr : jour pre-rempli (depuis le calendrier), aujourd'hui sinon.
function ouvrirActivite(k,dateStr,nomPerso){
  _dateActivite=dateStr||null;
  _sportChoisi=k||null; _nomPerso=nomPerso||'';
  ['addexo-step1','addexo-step2','addexo-creneau'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  const s0=document.getElementById('addexo-step0'); if(s0)s0.style.display='block';
  const t=document.getElementById('addexo-ttl'); if(t)t.textContent='+ Ajouter une activité';
  renderSportsGrid();
  openModal('modal-add-exo');
  if(k)goSportStep();
}
function ouvrirActivitePerso(i){ const n=sportsPerso()[i]; if(n)ouvrirActivite('autre',null,n); }
function renderActivites(){
  const cont=document.getElementById('seance-content'); if(!cont)return;
  const sw=document.getElementById('search-exo-wrap'); if(sw)sw.style.display='none';
  const puce=(emo,nom,c,clic)=>`<button onclick="${clic}" class="act-puce" style="--pc:${c};"><span>${emo}</span>${nom}</button>`;
  const puces=SPORTS.filter(s=>s.k!=='muscu'&&s.k!=='autre').map(s=>puce(s.e,escSport(s.n),s.c,`ouvrirActivite('${s.k}')`)).join('')
    + sportsPerso().map((n,i)=>puce('✨',escSport(n),'#8E8E93',`ouvrirActivitePerso(${i})`)).join('')
    + puce('✨','Autre…','#8E8E93',`ouvrirActivite('autre')`);
  // Regroupement par semaine, 4 semaines max
  const cette=lundiDe(ymdLocal());
  const semaines=[cette];
  for(let i=1;i<4;i++)semaines.push(lundiPrecedent(semaines[i-1]));
  const par={};
  (ST.sportSessions||[]).forEach(x=>{ if(!x||!x.date)return; const m=lundiDe(x.date); if(semaines.indexOf(m)>=0)(par[m]=par[m]||[]).push(x); });
  const titreSem=(m,i)=>{
    if(i===0)return 'Cette semaine';
    if(i===1)return 'Semaine dernière';
    const p=m.split('-').map(Number);
    return 'Semaine du '+new Date(p[0],p[1]-1,p[2]).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
  };
  const jourLib=ds=>{
    const p=ds.split('-').map(Number);
    let l=new Date(p[0],p[1]-1,p[2]).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'}).replace('.','');
    return l.charAt(0).toUpperCase()+l.slice(1);
  };
  let liste='';
  semaines.forEach((m,i)=>{
    const l=(par[m]||[]).slice().sort((a,b)=>(b.date+(b.heure||'')).localeCompare(a.date+(a.heure||'')));
    if(!l.length&&i>0)return;                 // semaine vide : on ne l'affiche pas (sauf la courante)
    const tot=l.reduce((a,x)=>a+_minutesDuree(x.duree),0);
    liste+=`<div class="act-sem"><span>${titreSem(m,i)}</span><span>${l.length?`${l.length} activité${l.length>1?'s':''}${tot?' · '+_fmtMinutes(tot):''}`:''}</span></div>`;
    if(!l.length){ liste+=`<div class="act-vide">Rien pour l'instant. Choisis un sport au-dessus 👆</div>`; return; }
    liste+=l.map(x=>{
      const sp=sportById(x.sport)||{e:'✨',n:x.sport,c:'#8E8E93'};
      const det=[jourLib(x.date),x.heure,x.duree].filter(Boolean).join(' · ');
      return `<div class="act-ligne" style="border-left-color:${sp.c};">
        <span class="act-emo">${sp.e}</span>
        <div class="act-txt"><div style="color:${sp.c};">${escSport(x.nom||sp.n)}</div><small>${escSport(det)}${x.note?' · '+escSport(x.note):''}</small></div>
        <button onclick="deleteSportSession('${x.id}')" aria-label="Supprimer">✕</button>
      </div>`;
    }).join('');
  });
  cont.innerHTML=`
    <div class="act-ajout"><div class="act-h">Ajouter une activité</div><div class="act-puces">${puces}</div></div>
    ${liste}
    <div class="act-pied">Les activités plus anciennes sont dans le calendrier de l'accueil.</div>`;
}
function goExoStep2(){
  _customMode=false;
  const name=document.getElementById('new-exo-name').value.trim();
  if(!name){toast('Choisis un exercice ou tape un nom','err');return;}
  document.getElementById('addexo-chosen').textContent=name;
  document.getElementById('addexo-step1').style.display='none';
  document.getElementById('addexo-step2').style.display='block';
}
function backExoStep1(){
  document.getElementById('addexo-step2').style.display='none';
  document.getElementById('addexo-step1').style.display='block';
}
function filterExoCatalog(q){
  _exoFilter=(q||'').toLowerCase().trim();
  renderExoCategories();
}
function createCustomExo(){
  // Aller à l'étape 2 en mode création manuelle (nom à saisir dans l'étape 2)
  _customMode=true;
  document.getElementById('addexo-step1').style.display='none';
  document.getElementById('addexo-step2').style.display='block';
  // Afficher un champ nom éditable au lieu du nom figé
  const chosen=document.getElementById('addexo-chosen');
  const typed=document.getElementById('new-exo-name').value.trim();
  chosen.innerHTML=`<input class="finp" type="text" id="custom-exo-name" placeholder="Nom de ton exercice…" value="${typed.replace(/"/g,'&quot;')}" style="text-align:center;font-weight:700;color:var(--ac);">`;
  setTimeout(()=>document.getElementById('custom-exo-name')?.focus(),100);
}
function addExo(){
  let name;
  if(_customMode){name=document.getElementById('custom-exo-name')?.value.trim()||'';}
  else{name=document.getElementById('new-exo-name').value.trim();}
  if(!name){toast('Donne un nom à l\'exercice','err');return;}
  const day=(ST.days||[]).find(d=>d.id===_dayId);if(!day)return;
  if(!day.exercises)day.exercises=[];
  const group=document.getElementById('new-exo-group')?.value.trim()||'';
  const reglage=document.getElementById('new-exo-reglage')?.value.trim()||'';
  const rest=parseInt(document.getElementById('new-exo-rest')?.value)||null;
  // Cet exercice existe-t-il deja dans une autre seance ?
  const jumeau=trouverJumeau(name,day.id);
  if(jumeau){
    _ajoutEnAttente={dayId:day.id,name,unit:OB['exo-unit']||'kg',group,reglage,rest,jumeau};
    closeModal('modal-add-exo');
    ouvrirChoixReprise(jumeau,name);
    return;
  }
  day.exercises.push({id:Date.now()+'',name,unit:OB['exo-unit']||'kg',sessions:[],group,reglage,rest,active:true});
  saveState();closeModal('modal-add-exo');renderDayContent(_dayId);toast('✓ '+name+' ajouté','ok');
}

// ══════════ EXERCICES PARTAGES ENTRE SEANCES ══════════
// Deux exercices sont « le meme » s'ils portent le meme nom, accents et casse
// mis a part. On ne devine rien de plus : « DC » restera distinct de
// « Developpe couche », c'est volontaire.
function exoKey(nom){
  return String(nom||'').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
// Le meme exercice ailleurs, avec le plus d'historique
function trouverJumeau(nom,dayIdExclu){
  const k=exoKey(nom);
  let best=null;
  (ST.days||[]).forEach(d=>{
    if(d.id===dayIdExclu)return;
    (d.exercises||[]).forEach(e=>{
      if(exoKey(e.name)!==k)return;
      const n=(e.sessions||[]).length;
      if(!best||n>(best.exo.sessions||[]).length)best={exo:e,day:d};
    });
  });
  return best;
}
// Toutes les series de cet exercice, toutes seances confondues
function historiqueGlobal(nom){
  const k=exoKey(nom); const out=[];
  (ST.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>{
    if(exoKey(e.name)!==k)return;
    (e.sessions||[]).forEach(s=>out.push(Object.assign({},s,{_seance:d.name,_dayId:d.id})));
  }));
  return out.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function recordGlobal(nom){
  let best=0;
  historiqueGlobal(nom).forEach(s=>{
    const n=String(s.charges||'').replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);
    if(n.length)best=Math.max(best,Math.max(...n));
  });
  return best;
}

let _ajoutEnAttente=null, _choixReprise=1;
function ouvrirChoixReprise(jumeau,nom){
  _choixReprise=1;
  const rec=recordGlobal(nom);
  const nb=historiqueGlobal(nom).length;
  document.getElementById('reprise-titre').textContent=nom;
  document.getElementById('reprise-sous').innerHTML=
    `Tu pratiques déjà cet exercice dans <b>${escapeHtml(jumeau.day.name||'une autre séance')}</b>. Que veux-tu reprendre ?`;
  document.getElementById('reprise-detail').dataset.rec=rec;
  document.getElementById('reprise-detail').dataset.nb=nb;
  majChoixReprise();
  document.getElementById('modal-reprise').classList.add('on');
}
function setChoixReprise(n){_choixReprise=n;majChoixReprise();}
function majChoixReprise(){
  document.querySelectorAll('#modal-reprise .rp-opt').forEach(o=>
    o.classList.toggle('on',parseInt(o.dataset.n)===_choixReprise));
  const d=document.getElementById('reprise-detail');
  const j=_ajoutEnAttente&&_ajoutEnAttente.jumeau?_ajoutEnAttente.jumeau.exo:{};
  const vide=_choixReprise===3;
  d.innerHTML=`
    <div class="rp-l"><span>Réglage</span><span>${vide?'à définir':(escapeHtml(j.reglage||'—'))}</span></div>
    <div class="rp-l"><span>Repos</span><span>${vide?'par défaut':(j.rest?fmtRest(j.rest):'—')}</span></div>
    <div class="rp-l"><span>Record</span><span>${vide?'aucun':((d.dataset.rec>0?d.dataset.rec+' '+(j.unit||'kg'):'—'))}</span></div>
    <div class="rp-l"><span>Historique</span><span>${_choixReprise===2?(d.dataset.nb+' séries reprises'):'vierge'}</span></div>`;
}
function fermerChoixReprise(){
  document.getElementById('modal-reprise').classList.remove('on');
  _ajoutEnAttente=null;
}
function validerChoixReprise(){
  const a=_ajoutEnAttente; if(!a)return;
  const day=(ST.days||[]).find(d=>d.id===a.dayId); if(!day)return;
  const j=a.jumeau.exo;
  const exo={id:Date.now()+'',name:a.name,sessions:[],active:true};
  if(_choixReprise===3){
    exo.unit=a.unit; exo.group=a.group; exo.reglage=a.reglage; exo.rest=a.rest;
  }else{
    // Les reglages decrivent la machine, pas la seance : ils suivent toujours
    exo.unit=j.unit||a.unit;
    exo.group=a.group||j.group||'';
    exo.reglage=a.reglage||j.reglage||'';
    exo.rest=a.rest||j.rest||null;
    if(_choixReprise===2){
      exo.lie=true;
      // Le lien vaut dans les deux sens : on marque tous les jumeaux, sinon
      // l'exercice d'origine gardait sa courbe unique.
      const k=exoKey(a.name);
      (ST.days||[]).forEach(d=>(d.exercises||[]).forEach(e=>{
        if(exoKey(e.name)===k)e.lie=true;
      }));
    }
  }
  if(!day.exercises)day.exercises=[];
  day.exercises.push(exo);
  saveState();
  fermerChoixReprise();
  renderDayContent(a.dayId);
  toast('✓ '+a.name+' ajouté','ok');
}
function setExoRest(sec){
  document.getElementById('new-exo-rest').value=sec;
  document.querySelectorAll('#exo-rest-presets .rest-chip').forEach(c=>c.classList.toggle('on',c.textContent.trim()===fmtRest(sec)));
}
function isExoActive(exo){
  // Override manuel (badge cliquable) : il prime sur la regle automatique.
  if(exo.activeOverride===true) return true;
  if(exo.activeOverride===false) return false;
  const sessions=exo.sessions||[];
  if(!sessions.length) return true; // Nouveau = actif par défaut
  const lastDate=sessions.reduce((a,b)=>a.date>b.date?a:b).date;
  const daysSince=Math.round((Date.now()-new Date(lastDate))/86400000);
  return daysSince<=21;
}
function toggleExoActive(dayId,exoId){
  const day=(ST.days||[]).find(d=>d.id===dayId);
  const exo=day?.exercises.find(e=>e.id===exoId);
  if(!exo)return;
  const nowActive=!isExoActive(exo);
  exo.activeOverride=nowActive;
  saveState();
  renderDayContent(dayId);
  toast(nowActive?'✓ '+exo.name+' remonté dans les actifs':'💤 '+exo.name+' passé en inactifs','ok');
}
function startEditExo(dayId,exoId){
  const day=(ST.days||[]).find(d=>d.id===dayId);
  const exo=day?.exercises.find(e=>e.id===exoId);
  if(!exo)return;
  _editExoDayId=dayId;_editExoId=exoId;
  document.getElementById('edit-exo-name').value=exo.name||'';
  document.getElementById('edit-exo-group').value=exo.group||'';
  document.getElementById('edit-exo-reglage').value=exo.reglage||'';
  document.getElementById('edit-exo-rest').value=exo.rest||'';
  OB['edit-exo-unit']=exo.unit||'kg';
  document.querySelectorAll('#chips-edit-exo-unit .chip').forEach(c=>{
    c.classList.toggle('on',c.textContent.trim()===(exo.unit||'kg'));
  });
  openModal('modal-edit-exo');
}
function saveEditExo(){
  const day=(ST.days||[]).find(d=>d.id===_editExoDayId);
  const exo=day?.exercises.find(e=>e.id===_editExoId);
  if(!exo)return;
  const name=document.getElementById('edit-exo-name').value.trim();
  if(!name){toast('Le nom est obligatoire','err');return;}
  // On retient l'ANCIEN nom : c'est lui qui identifie les jumeaux. Chercher
  // avec le nouveau nom ne trouvait rien dès que l'exercice était renommé.
  const ancienNom=exo.name;
  exo.name=name;
  exo.group=document.getElementById('edit-exo-group').value.trim();
  exo.reglage=document.getElementById('edit-exo-reglage').value.trim();
  exo.rest=parseInt(document.getElementById('edit-exo-rest').value)||null;
  exo.unit=OB['edit-exo-unit']||exo.unit;

  // Le réglage décrit la machine, pas la séance. Mais on ne l'impose pas :
  // on demande, parce qu'une même machine peut être réglée autrement ailleurs.
  const jumeaux=compterJumeaux(ancienNom,_editExoDayId);
  const finir=(propage)=>{
    const n=propage?propagerReglages(exo,ancienNom,_editExoDayId):0;
    saveState();closeModal('modal-edit-exo');renderDayContent(_editExoDayId);
    toast(n?`✓ Appliqué à ${n+1} séances`:'✓ Exercice mis à jour','ok');
  };
  if(jumeaux>0){
    const autres=jumeaux===1?'1 autre séance':jumeaux+' autres séances';
    finir(confirm(`Cet exercice est aussi dans ${autres}.\n\nAppliquer ce réglage partout ?`));
  }else finir(false);
}
// Combien de fois cet exercice figure-t-il ailleurs ?
function compterJumeaux(nom,dayIdExclu){
  const k=exoKey(nom); let n=0;
  (ST.days||[]).forEach(d=>{
    if(d.id===dayIdExclu)return;
    (d.exercises||[]).forEach(e=>{ if(exoKey(e.name)===k)n++; });
  });
  return n;
}
// Répercute réglage, repos, unité, groupe ET le nouveau nom sur les jumeaux.
// On les identifie par l'ancien nom, puisque le nouveau vient d'être appliqué.
function propagerReglages(exo,ancienNom,dayIdSource){
  const k=exoKey(ancienNom);
  let n=0;
  (ST.days||[]).forEach(d=>{
    if(d.id===dayIdSource)return;
    (d.exercises||[]).forEach(e=>{
      if(exoKey(e.name)!==k)return;
      e.name=exo.name; e.reglage=exo.reglage; e.rest=exo.rest;
      e.unit=exo.unit; e.group=exo.group;
      n++;
    });
  });
  return n;
}
function deleteExo(dayId,exoId){
  const day=(ST.days||[]).find(d=>d.id===dayId);if(!day)return;
  const exo=day.exercises.find(e=>e.id===exoId);
  if(!confirm('Supprimer "'+exo?.name+'" et tout son historique ?'))return;
  day.exercises=day.exercises.filter(e=>e.id!==exoId);
  saveState();renderDayContent(dayId);
}
function startAddSession(dayId,exoId){
  _editSessionId=null;
  const delBtn = document.getElementById('sess-delete-btn');
  if(delBtn) delBtn.style.display = 'none';
  _dayId=dayId;_exoId=exoId;
  const day=(ST.days||[]).find(d=>d.id===dayId);
  const exo=day?.exercises.find(e=>e.id===exoId);
  _curExoRest=exo?.rest||null;
  document.getElementById('sess-ttl').textContent=exo?.name||'Enregistrer';
  document.getElementById('sess-date').value=new Date().toISOString().slice(0,10);
  const sortedSess=(exo?.sessions||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const lastS=sortedSess[0];
  // Pré-remplir avec la dernière séance (gain de temps, on ajuste ce qui change)
  document.getElementById('sess-val').value=lastS?.charges||'';
  // Décomposer "4×8" en séries + reps pour pré-remplir
  const rp=String(lastS?.reps||'');
  const mx=rp.match(/^(\d+)\s*[×x]\s*(.+)$/);
  if(mx){document.getElementById('sess-series').value=mx[1];document.getElementById('sess-reps').value=mx[2];}
  else{document.getElementById('sess-series').value='';document.getElementById('sess-reps').value=rp.replace(/\s*séries?$/,'');}
  var _n=document.getElementById('sess-notes');if(_n)_n.value='';
  document.getElementById('sess-nextgoal').value='';
  // Chercher le dernier objectif noté (dans n'importe quelle session récente)
  const lastGoal=sortedSess.find(s=>s.nextGoal&&s.nextGoal.trim());
  // Rappel du réglage machine (fixe sur l'exo)
  const regNote=document.getElementById('sess-reglage-reminder');
  if(regNote){
    if(exo?.reglage){regNote.style.display='block';regNote.innerHTML='⚙️ Réglage : <strong>'+escapeHtml(exo.reglage)+'</strong>';}
    else regNote.style.display='none';
  }
  // Bouton repos : afficher le temps de l'exo s'il existe
  const tbtn=document.getElementById('sess-timer-btn');
  if(tbtn)tbtn.textContent=_curExoRest?('⏱ Repos '+fmtRest(_curExoRest)):'⏱ Lancer repos';
  // Rappel de l'objectif noté la fois précédente
  const goalNote=document.getElementById('sess-goal-reminder');
  if(goalNote){
    if(lastGoal){goalNote.style.display='block';goalNote.innerHTML='🎯 Objectif que tu t\'étais fixé : <strong>'+escapeHtml(lastGoal.nextGoal)+'</strong>';}
    else goalNote.style.display='none';
  }
  apply1RMToggleUI();
  update1RMPreview();
  openModal('modal-session');
}
function fmtRest(sec){const m=Math.floor(sec/60),s=sec%60;return s===0?m+':00':m+':'+String(s).padStart(2,'0');}
function startExoRestTimer(){
  startTimer(_curExoRest||90);
}
function editSession(dayId, exoId, sessId){
  const day = (ST.days||[]).find(d=>d.id===dayId);
  const exo = day?.exercises.find(e=>e.id===exoId);
  const sess = exo?.sessions.find(s=>s.id===sessId);
  if(!sess) return;
  _dayId=dayId; _exoId=exoId; _editSessionId=sessId;
  document.getElementById('sess-ttl').textContent = '✏️ Modifier — '+(exo?.name||'');
  document.getElementById('sess-date').value = sess.date;
  document.getElementById('sess-val').value = sess.charges;
  // Décomposer "4×8" en séries + reps
  const rp=String(sess.reps||'');
  const mx=rp.match(/^(\d+)\s*[×x]\s*(.+)$/);
  if(mx){document.getElementById('sess-series').value=mx[1];document.getElementById('sess-reps').value=mx[2];}
  else{document.getElementById('sess-series').value='';document.getElementById('sess-reps').value=rp.replace(/\s*séries?$/,'');}
  var _ne=document.getElementById('sess-notes');if(_ne)_ne.value=sess.notes||'';
  document.getElementById('sess-nextgoal').value = sess.nextGoal||'';
  const gr=document.getElementById('sess-goal-reminder');if(gr)gr.style.display='none';
  const rr=document.getElementById('sess-reglage-reminder');if(rr)rr.style.display='none';
  // Afficher le bouton supprimer en mode édition
  const delBtn = document.getElementById('sess-delete-btn');
  if(delBtn) delBtn.style.display = 'block';
  openModal('modal-session');
}
function confirmDeleteCurrentSession(){
  if(confirm('Supprimer cette session ? Cette action est irréversible.')){
    deleteSession(_dayId, _exoId, _editSessionId);
    _editSessionId=null;
    closeModal('modal-session');
  }
}
function finishSession(dayId){
  const day=(ST.days||[]).find(d=>d.id===dayId);
  if(!day){toast('Séance introuvable','err');return;}
  const todayStr=new Date().toISOString().slice(0,10);
  const key=dayId+'|'+todayStr;
  if(!ST.sessionsFinished)ST.sessionsFinished=[];
  // Déjà validée aujourd'hui ? (séance distincte par jour)
  if(ST.sessionsFinished.includes(key)){
    toast('Séance déjà terminée aujourd\'hui','err');return;
  }
  const exosLoggedToday=(day.exercises||[]).filter(e=>(e.sessions||[]).some(s=>s.date===todayStr)).length;
  // On autorise à terminer même sans exercice (permet d'annuler une séance commencée par erreur)
  const hasActivity=exosLoggedToday>=1;
  // Réinitialiser l'état "commencée" et les coches → tout revient à la normale
  if(ST.sessionsStarted)ST.sessionsStarted=ST.sessionsStarted.filter(k=>k!==key);
  if(ST.exoChecked)ST.exoChecked=ST.exoChecked.filter(k=>!k.endsWith('|'+todayStr));
  if(ST.exoUnchecked)ST.exoUnchecked=ST.exoUnchecked.filter(k=>!k.endsWith('|'+todayStr));
  if(ST.sessionsStartedAt)delete ST.sessionsStartedAt[key];
  if(!hasActivity){
    // Rien de rentré → on annule juste la séance sans la marquer terminée ni donner d'XP
    closeAutoOpenedHist();
    saveState();renderDayContent(dayId);
    toast('Séance annulée','ok');
    return;
  }
  closeAutoOpenedHist();   // seance terminee : on remet les historiques au propre
  ST.sessionsFinished.push(key);
  if(exosLoggedToday>=3)ST._perfectionist=true; // séance de 3+ exos terminée
  // Bonus de séance complète
  const SESSION_BONUS=30;
  addXp(SESSION_BONUS);
  saveState();
  updateGamification();renderRankBadge();renderDayContent(dayId);
  setTimeout(()=>{toast(`🏁 Séance terminée ! +${SESSION_BONUS} XP`,'ok');},300);
  checkAchievements();
}
function saveSession(keepOpen){
  const date=document.getElementById('sess-date').value;
  const charges=document.getElementById('sess-val').value.trim();
  if(!date||!charges){toast('La date et la charge sont obligatoires','err');return;}
  const series=document.getElementById('sess-series').value.trim();
  const repsRaw=document.getElementById('sess-reps').value.trim();
  // Combiner en "4×8" si les deux sont fournis, sinon garder ce qu'il y a
  let reps=repsRaw;
  if(series&&repsRaw)reps=series+'×'+repsRaw;
  else if(series&&!repsRaw)reps=series+' séries';
  const notes=(document.getElementById('sess-notes')?.value||'').trim();
  const nextGoal=document.getElementById('sess-nextgoal').value.trim();
  let day=(ST.days||[]).find(d=>d.id===_dayId);
  let exo=day?.exercises.find(e=>e.id===_exoId);
  // Fallback : si _dayId perdu, retrouver l'exo via _exoId dans toutes les séances
  if(!exo && _exoId){
    for(const d of (ST.days||[])){
      const found=(d.exercises||[]).find(e=>e.id===_exoId);
      if(found){day=d;exo=found;_dayId=d.id;break;}
    }
  }
  if(!exo){toast('Erreur : exercice introuvable','err');return;}
  if(!exo.sessions)exo.sessions=[];

  // Mode édition d'une session existante
  if(_editSessionId){
    const sess=exo.sessions.find(s=>s.id===_editSessionId);
    if(sess){sess.date=date;sess.charges=charges;sess.reps=reps;sess.notes=notes;sess.nextGoal=nextGoal;}
    _editSessionId=null;
    saveState();closeModal('modal-session');
    if((ST.days||[]).find(d=>d.id===_dayId))_currentDayId=_dayId;
    try{_doRenderAll();}catch(e){}
    toast('✓ Session modifiée','ok');
    return;
  }

  // Nouvelle session — vérification PR
  const oldMax=exo.sessions.length?Math.max(...exo.sessions.map(s=>{const n=String(s.charges).replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);return n.length?Math.max(...n):0;})):0;
  const newN=charges.replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);
  const newMax=newN.length?Math.max(...newN):0;
  const isPR=newMax>oldMax&&oldMax>0;
  const isFirstEntry=oldMax===0&&newMax>0&&(exo.sessions||[]).length===0;
  exo.sessions.push({id:Date.now()+'',date,charges,reps,notes,nextGoal});
  delete exo.activeOverride; // nouvelle activite -> la regle automatique reprend
  // Records partagés : on n'attend pas la réponse, l'enregistrement reste instantané
  try{ syncExerciseRecord(exo,oldMax,newMax); }catch(e){}
  // Les défis auxquels je participe doivent voir mon avance tout de suite
  try{ publishMyChallengeProgress(); }catch(e){}
  // Séance tenue un jour prévu : petit bonus, une seule fois
  let bonusPrevu=0;
  try{ bonusPrevu=claimPlannedBonus(date)||0; }catch(e){}
  if(bonusPrevu){ try{ addXp(bonusPrevu); toast('+'+bonusPrevu+' XP — séance prévue tenue !','ok'); }catch(e){} }
  // La case hachurée cède aussitôt la place au résumé de séance
  try{ renderActivityCalendar(); }catch(e){}
  // La hachure du jour prévu doit disparaître tout de suite, remplacée par le
  // marquage d'entraînement, sans attendre un changement d'onglet.
  try{ renderActivityCalendar(); }catch(e){}
  // Fermer le formulaire tout de suite (garanti même si un rendu échoue ensuite)
  closeModal('modal-session');
  // ── Gamification : ENTIÈREMENT blindée. Un crash ici ne doit JAMAIS
  // empêcher le rafraîchissement de l'écran (c'était la cause du bug de gel).
  let sessionXpGain=10;
  const todayStr=new Date().toISOString().slice(0,10);
  try{
    if(ST.seasonXp==null)ST.seasonXp=ST.xp||0;
    addXp(10);
    if(isPR||isFirstEntry){addXp(25);sessionXpGain+=25;ST.totalPRs=(ST.totalPRs||0)+1;}
  }catch(e){console.error('gamification:',e);}
  // Enregistrer dans sessions_log pour les stats de la semaine
  if(!ST.sessions_log)ST.sessions_log=[];
  ST.sessions_log.push({date,xp:(isPR||isFirstEntry)?35:10,pr:(isPR||isFirstEntry)?1:0});
  // Drapeaux pour les succès spéciaux liés à l'heure
  if(date===todayStr){
    const h=new Date().getHours();
    if(h<7)ST._earlyBird=true;
    if(h>=22)ST._nightOwl=true;
  }
  saveState(); // Persister l'état (local + cloud)
  // Garder l'historique de cet exercice ouvert pour voir la nouvelle saisie.
  // Marque "auto" : il sera referme a la fin de la seance (les historiques
  // ouverts a la main par l'utilisateur, eux, ne sont pas touches).
  if(!ST.uiState)ST.uiState={};
  ST.uiState['hist-'+_dayId+'-'+_exoId]=true;
  if(!ST.uiAutoOpen)ST.uiAutoOpen=[];
  if(!ST.uiAutoOpen.includes('hist-'+_dayId+'-'+_exoId))ST.uiAutoOpen.push('hist-'+_dayId+'-'+_exoId);
  // Cocher automatiquement l'exo si la séance est commencée (saisie = pré-coché)
  if(date===todayStr && isDayStarted(_dayId)){
    if(!ST.exoChecked)ST.exoChecked=[];
    const ck=_exoId+'|'+todayStr;
    if(!ST.exoChecked.includes(ck))ST.exoChecked.push(ck);
    if(ST.exoUnchecked){const ui=ST.exoUnchecked.indexOf(ck);if(ui>=0)ST.exoUnchecked.splice(ui,1);}
  }
  // Fermer le formulaire
  if(!keepOpen){try{closeModal('modal-session');}catch(e){}}
  _currentDayId=_dayId;
  // ── RAFRAÎCHISSEMENT : on refait tout l'onglet séances de zéro, comme un
  // changement d'onglet manuel (méthode 100% fiable). Pas de popup qui masque.
  const _render=()=>{
    try{renderWorkout();}catch(e){}
    try{switchDay(_currentDayId);}catch(e){}
    try{renderHome();updateGamification();renderRankBadge();}catch(e){}
    try{renderActivityCalendar();}catch(e){}
  };
  _render();
  requestAnimationFrame(_render);
  try{checkAchievements();}catch(e){}
  // Message discret (toast), pas de popup bloquant
  if(isPR||isFirstEntry){
    const xpGain=sessionXpGain;
    toast(`🔥 Nouveau record : ${newMax} ${exo.unit} · +${xpGain} XP`,'ok');
  }else{
    toast('✓ Session enregistrée · +10 XP 💪','ok');
  }
}
function deleteSession(dayId,exoId,sessId){
  const day=(ST.days||[]).find(d=>d.id===dayId);
  const exo=day?.exercises.find(e=>e.id===exoId);if(!exo)return;
  exo.sessions=exo.sessions.filter(s=>s.id!==sessId);
  if((ST.days||[]).find(d=>d.id===dayId))_currentDayId=dayId;
  saveState();try{_doRenderAll();}catch(e){}
}

// ── Courbes d'un exercice partagé entre plusieurs séances ─────────
const COULEURS_SEANCE=['#7C5CFC','#FF9F0A','#30D158','#FF375F','#5AC8FA','#FFD60A'];
function renderExoChartLie(dayId,exo){
  const canvasId=`chart-${dayId}-${exo.id}`;
  const ctx=document.getElementById(canvasId);if(!ctx)return;
  const tout=historiqueGlobal(exo.name);
  if(tout.length<2)return;
  // Une série par séance, alignées sur les mêmes dates
  const dates=[...new Set(tout.map(s=>s.date))].sort();
  const parSeance={};
  tout.forEach(s=>{
    (parSeance[s._seance||'Séance']=parSeance[s._seance||'Séance']||{})[s.date]=s.charges;
  });
  const unitLabel=exo.unit==='kg'?(unit==='imperial'?'lbs':'kg'):(exo.unit||'');
  const val=(c)=>{
    const n=String(c||'').replace(/,/g,'.').split(/[\s\/;]+/).map(Number).filter(v=>!isNaN(v)&&v>0);
    const v=n.length?Math.max(...n):null;
    return (v!=null&&unit==='imperial'&&exo.unit==='kg')?Math.round(v*2.2046*10)/10:v;
  };
  const datasets=Object.keys(parSeance).map((nom,i)=>({
    label:nom,
    data:dates.map(d=>parSeance[nom][d]!==undefined?val(parSeance[nom][d]):null),
    borderColor:COULEURS_SEANCE[i%COULEURS_SEANCE.length],
    pointBackgroundColor:COULEURS_SEANCE[i%COULEURS_SEANCE.length],
    borderWidth:2,pointRadius:3,pointHoverRadius:5,tension:0,fill:false,spanGaps:true
  }));
  const labels=dates.map(d=>d.slice(5).split('-').reverse().join('/'));
  const fullDates=dates.map(d=>{const[y,m,j]=d.split('-');return j+'/'+m+'/'+y;});
  try{
    if(_chartInstances[canvasId]){try{_chartInstances[canvasId].destroy();}catch(e){}}
    _chartInstances[canvasId]=new Chart(ctx,{type:'line',data:{labels,datasets},options:{
      responsive:true,maintainAspectRatio:false,layout:{padding:{left:6,right:14}},
      plugins:{
        legend:{display:datasets.length>1,position:'bottom',
          labels:{color:'#888',boxWidth:10,boxHeight:3,font:{size:10},usePointStyle:false}},
        tooltip:{callbacks:{
          title:(items)=>fullDates[items[0].dataIndex],
          label:(item)=>item.dataset.label+' : '+item.parsed.y+' '+unitLabel}}
      },
      scales:{
        x:{grid:{display:false},ticks:{color:'#888',font:{size:9},maxRotation:0,minRotation:0,autoSkip:true,maxTicksLimit:5}},
        y:{grid:{color:'rgba(128,128,128,.05)'},ticks:{color:'#888',font:{size:9}}}
      }}});
  }catch(e){}
}
