// ══════════════════════════════════════════════════════════════
// KeyFit — notifications
// Tout ce qui touche aux notifications push : autorisation, abonnement,
// préférences, et l'écriture des notifications internes.
// Chargé APRÈS index.html : les variables partagées (sb, U, ST, _mutedConvs)
// y sont déjà définies au moment où ces fonctions sont appelées.
// ══════════════════════════════════════════════════════════════

const VAPID_PUBLIC_KEY = 'BBP-PQ2NEBMpiXw8fTkmPD4kh6qwdPf2nKeTzQOKZ8_awbHn171iXwWrMqqKd_VCKrojadRlPw9LYPNmfXjjPaA';

function _isStandalone(){
  return window.navigator.standalone===true ||
         window.matchMedia('(display-mode: standalone)').matches;
}
function _pushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function _b64ToUint8(base64){
  const pad='='.repeat((4-base64.length%4)%4);
  const b=(base64+pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b);const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
async function updatePushUI(){
  const on=document.getElementById('tog-push-on');
  const off=document.getElementById('tog-push-off');
  const hint=document.getElementById('push-hint');
  if(!on||!off)return;
  if(!_pushSupported()){
    on.disabled=true;
    if(hint)hint.textContent="Ton navigateur ne gère pas les notifications.";
    return;
  }
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  if(isIOS && !_isStandalone()){
    on.disabled=true;
    if(hint)hint.innerHTML="Sur iPhone, les notifications ne marchent que si KeyFit est <strong style='color:var(--txt)'>installé sur l'écran d'accueil</strong> (Partager → Sur l'écran d'accueil). Ouvre l'app depuis son icône, puis reviens ici.";
    return;
  }
  let active=false;
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    active=!!sub && Notification.permission==='granted';
  }catch(e){}
  on.classList.toggle('on',active);
  off.classList.toggle('on',!active);
  // Le detail ne s'affiche que si les notifications sont autorisees : sinon
  // ces reglages n'auraient aucun effet et laisseraient croire le contraire.
  const detail=document.getElementById('notif-detail');
  if(detail)detail.style.display=active?'block':'none';
  if(active)syncSocialToggle();
  if(hint){
    if(Notification.permission==='denied')
      hint.textContent="Bloquées par le navigateur. Réactive-les dans les réglages du site, puis recharge.";
    else hint.textContent=active
      ?"Autorisées. Choisis ci-dessous ce que tu veux recevoir."
      :"Autorise KeyFit à t'envoyer des notifications. Tu choisis ensuite lesquelles.";
  }
}
// Reglage propre aux messages, distinct de l'autorisation globale.
function msgNotifsOn(){ return !_mutedConvs.has('messages'); }
async function setMsgNotifs(on){
  try{
    if(on)await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key','messages');
    else await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:'messages'},{onConflict:'user_id,conv_key'});
    if(on)_mutedConvs.delete('messages'); else _mutedConvs.add('messages');
    syncSocialToggle();
    toast(on?'Notifications de messages activées':'Notifications de messages désactivées','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}
async function enablePush(){
  if(!_pushSupported()){toast('Notifications non supportées ici','err');return;}
  if(/iPad|iPhone|iPod/.test(navigator.userAgent) && !_isStandalone()){
    toast("Installe KeyFit sur l'écran d'accueil d'abord",'err');return;
  }
  if(VAPID_PUBLIC_KEY.startsWith('REMPLACE')){toast('Clé VAPID non configurée','err');return;}
  try{
    // Déjà refusé une fois : le navigateur ne repose plus la question, il
    // répond « denied » sans rien afficher. Il faut expliquer où le réactiver.
    if(Notification.permission==='denied'){
      const iOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
      alert(iOS
        ? "Les notifications ont été refusées pour KeyFit.\n\nPour les réactiver : Réglages de l'iPhone → Notifications → KeyFit → Autoriser les notifications."
        : "Les notifications ont été refusées pour ce site.\n\nPour les réactiver : touche l'icône à gauche de l'adresse (cadenas ou ⚙︎) → Notifications → Autoriser, puis recharge la page.");
      updatePushUI();return;
    }
    // La demande d'autorisation DOIT venir d'un tap (règle iOS) : on y est.
    const perm=await Notification.requestPermission();
    if(perm==='denied'){
      toast('Autorisation refusée — réactive-la dans les réglages du navigateur','err');
      updatePushUI();return;
    }
    if(perm!=='granted'){updatePushUI();return;}
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    // Après un refus puis une réautorisation, l'ancien abonnement survit mais
    // n'est plus valide : il faut le jeter, sinon rien n'arrivera jamais.
    if(sub){
      try{
        const ancien=sub.toJSON();
        await sub.unsubscribe();
        if(ancien&&ancien.endpoint)await sb.from('push_subscriptions').delete().eq('endpoint',ancien.endpoint);
      }catch(e){}
      sub=null;
    }
    try{
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:_b64ToUint8(VAPID_PUBLIC_KEY)
      });
    }catch(err){
      // On montre la vraie raison : « ça ne marche pas » ne se diagnostique pas.
      alert("Impossible d'activer les notifications.\n\nRaison : "+(err&&(err.message||err.name)||'inconnue')+
        "\n\nSi tu les avais refusées, réactive-les dans les réglages du site (icône à gauche de l'adresse), puis recharge la page.");
      updatePushUI();return;
    }
    const j=sub.toJSON();
    const{error}=await sb.from('push_subscriptions').upsert({
      user_id:U.id, endpoint:j.endpoint,
      p256dh:j.keys.p256dh, auth:j.keys.auth
    },{onConflict:'endpoint'});
    if(error)throw error;
    toast('🔔 Notifications activées','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
  updatePushUI();
}
async function disablePush(){
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(sub){
      const ep=sub.endpoint;
      await sub.unsubscribe();
      if(U&&sb)await sb.from('push_subscriptions').delete().eq('endpoint',ep);
    }
    toast('Notifications désactivées','ok');
  }catch(e){}
  updatePushUI();
}

// ── Auto-réparation silencieuse de l'abonnement ──────────────────
// Sur iOS en particulier, un abonnement peut disparaître sans rien
// signaler : Notification.permission reste "granted" mais
// getSubscription() renvoie null (ou l'endpoint stocké côté serveur ne
// correspond plus à rien de valide). Jusqu'ici, la seule façon de s'en
// rendre compte était de rouvrir les réglages et de re-toucher
// l'interrupteur. On vérifie désormais tout seul, à chaque ouverture de
// l'app, SANS jamais redemander l'autorisation (déjà accordée, donc
// aucune nouvelle fenêtre ne s'affiche).
const _PUSH_REPAIR_MIN_INTERVAL = 6*60*60*1000; // pas plus d'une fois toutes les 6h
async function autoRepairPush(){
  try{
    if(typeof U==='undefined'||!U||typeof sb==='undefined'||!sb)return;
    if(!_pushSupported())return;
    if(/iPad|iPhone|iPod/.test(navigator.userAgent) && !_isStandalone())return;
    if(Notification.permission!=='granted')return;
    const clef='kf-push-repair-'+U.id;
    const dernier=Number(localStorage.getItem(clef)||0);
    if(Date.now()-dernier < _PUSH_REPAIR_MIN_INTERVAL)return;
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:_b64ToUint8(VAPID_PUBLIC_KEY)
      });
    }
    // Qu'il soit neuf ou déjà là, on le republie : ça rattrape aussi le cas
    // où la ligne serveur a été supprimée (après un envoi en échec) alors
    // que l'abonnement local, lui, était resté valide.
    const j=sub.toJSON();
    await sb.from('push_subscriptions').upsert({
      user_id:U.id, endpoint:j.endpoint,
      p256dh:j.keys.p256dh, auth:j.keys.auth
    },{onConflict:'endpoint'});
    localStorage.setItem(clef,String(Date.now()));
    try{updatePushUI();}catch(e){}
  }catch(e){ /* silencieux : on retentera à la prochaine ouverture */ }
}
// U et sb se remplissent après l'authentification, de façon asynchrone :
// on patiente un peu, puis on réessaie à chaque fois que l'app redevient visible.
(function _pushRepairBoot(){
  let tentatives=0;
  const essayer=()=>{
    tentatives++;
    if(typeof U!=='undefined'&&U&&typeof sb!=='undefined'&&sb){ autoRepairPush(); return; }
    if(tentatives<10) setTimeout(essayer,3000);
  };
  setTimeout(essayer,3000);
})();
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible') autoRepairPush();
});

function pushNotif(userId,type,content){
  if(!userId||userId===U.id||!sb)return;
  try{ sb.from('notifications').insert({user_id:userId,from_id:U.id,type,content}).then(()=>{}).catch(()=>{}); }catch(e){}
}
function selfNotif(type,content){
  if(!U||!sb)return;
  try{ sb.from('notifications').insert({user_id:U.id,from_id:null,type,content}).then(()=>{}).catch(()=>{}); }catch(e){}
}
function myName(){ return (P&&P.username)?P.username:'Quelqu\'un'; }
async function setSocialNotifs(on){
  try{
    if(on)await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key','social');
    else await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:'social'},{onConflict:'user_id,conv_key'});
    if(on)_mutedConvs.delete('social'); else _mutedConvs.add('social');
    syncSocialToggle();
    toast(on?'🔔 Notifications sociales activées':'🔕 Notifications sociales désactivées','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}
function activityOn(){ return _mutedConvs.has('activity_on'); }
async function setActivity(on){
  try{
    if(on)await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:'activity_on'},{onConflict:'user_id,conv_key'});
    else await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key','activity_on');
    if(on)_mutedConvs.add('activity_on'); else _mutedConvs.delete('activity_on');
    syncSocialToggle();
    toast(on?'🔔 Activité des amis activée':'Activité des amis désactivée','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}
// Rappels de séance programmée, distincts des rappels hebdomadaires.
function planRemindersOn(){ return !_mutedConvs.has('planned'); }
async function setPlanReminders(on){
  try{
    if(on)await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key','planned');
    else await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:'planned'},{onConflict:'user_id,conv_key'});
    if(on)_mutedConvs.delete('planned'); else _mutedConvs.add('planned');
    syncSocialToggle();
    toast(on?'Rappels de séance activés':'Rappels de séance désactivés','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}
async function setReminders(on){
  try{
    if(on)await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key','reminders');
    else await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:'reminders'},{onConflict:'user_id,conv_key'});
    if(on)_mutedConvs.delete('reminders'); else _mutedConvs.add('reminders');
    syncSocialToggle();
    toast(on?'🔔 Rappels activés':'🔕 Rappels désactivés','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}
function syncSocialToggle(){
  const on=document.getElementById('tog-social-on'), off=document.getElementById('tog-social-off');
  if(on&&off){
    const a=!_mutedConvs.has('social');
    on.classList.toggle('on',a); off.classList.toggle('on',!a);
  }
  const rOn=document.getElementById('tog-remind-on'), rOff=document.getElementById('tog-remind-off');
  if(rOn&&rOff){
    const a=!_mutedConvs.has('reminders');
    rOn.classList.toggle('on',a); rOff.classList.toggle('on',!a);
  }
  const aOn=document.getElementById('tog-activity-on'), aOff=document.getElementById('tog-activity-off');
  if(aOn&&aOff){
    const a=activityOn();
    aOn.classList.toggle('on',a); aOff.classList.toggle('on',!a);
  }
  const mOn=document.getElementById('tog-msg-on'), mOff=document.getElementById('tog-msg-off');
  if(mOn&&mOff){
    const a=msgNotifsOn();
    mOn.classList.toggle('on',a); mOff.classList.toggle('on',!a);
  }
  const pOn=document.getElementById('tog-plan-on'), pOff=document.getElementById('tog-plan-off');
  if(pOn&&pOff){
    const a=planRemindersOn();
    pOn.classList.toggle('on',a); pOff.classList.toggle('on',!a);
  }
  const sOn=document.getElementById('tog-seen-on'), sOff=document.getElementById('tog-seen-off');
  if(sOn&&sOff){
    const a=receiptsOn();
    sOn.classList.toggle('on',a); sOff.classList.toggle('on',!a);
  }
}
function receiptsOn(){ return !_mutedConvs.has('receipts'); }
async function setReceipts(on){
  try{
    if(on)await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key','receipts');
    else await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:'receipts'},{onConflict:'user_id,conv_key'});
    if(on)_mutedConvs.delete('receipts'); else _mutedConvs.add('receipts');
    syncSocialToggle();
    if(_dmPartnerId)loadDM();
    toast(on?'👁 Accusés de lecture activés':'Accusés de lecture désactivés','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}

// ── Fin du chrono de repos ──────────────────────────────────────
// Prévient l'utilisateur parti sur une autre app. Une notification locale
// ne peut partir que si la page tourne encore : iOS suspend le JavaScript
// des web apps en arrière-plan, donc elle arrivera au retour dans l'app
// plutôt qu'à la seconde exacte. Sur Android et sur ordinateur, elle est
// immédiate. On garde donc aussi le son et la vibration.
async function notifyRestDone(){
  try{
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    const reg=await navigator.serviceWorker.ready;
    // Inutile de notifier si l'utilisateur regarde déjà l'écran
    if(document.visibilityState==='visible')return;
    await reg.showNotification('Repos terminé 💪',{
      body:'C\'est reparti pour une série.',
      tag:'rest-timer',
      renotify:true,
      silent:false
    });
  }catch(e){}
}
// Au retour dans l'app, on retire la notification du chrono si elle traîne
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)return;
  navigator.serviceWorker?.ready?.then(reg=>{
    reg.getNotifications({tag:'rest-timer'}).then(l=>l.forEach(n=>n.close())).catch(()=>{});
  }).catch(()=>{});
});
