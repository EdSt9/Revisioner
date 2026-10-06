// ══════════════════════════════════════════════════════════════
// KeyFit — la liste des conversations
// Module isolé : ce fichier ne contient que la liste des conversations.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

async function loadMutedConvs(){
  try{
    const{data}=await sb.from('muted_conversations').select('conv_key').eq('user_id',U.id);
    _mutedConvs=new Set((data||[]).map(r=>r.conv_key));
  }catch(e){_mutedConvs=new Set();}
}
async function toggleMuteConv(key){
  const on=!_mutedConvs.has(key);
  if(on)_mutedConvs.add(key); else _mutedConvs.delete(key);
  renderInboxList();
  try{
    if(on)await sb.from('muted_conversations').upsert({user_id:U.id,conv_key:key},{onConflict:'user_id,conv_key'});
    else await sb.from('muted_conversations').delete().eq('user_id',U.id).eq('conv_key',key);
    toast(on?'🔕 Conversation en sourdine':'🔔 Notifications réactivées','ok');
  }catch(e){toast('Erreur : '+(e.message||e),'err');}
}
async function reactionPreview(m){
  if(!m||!m.last_reaction_at||!m.last_reaction_emoji)return null;
  // On cite ce sur quoi porte la réaction, comme le fait iOS
  let quoi='';
  if(m.image_url) quoi=isVoiceUrl(m.image_url)?' à un message vocal':(isGifUrl(m.image_url)?' à un GIF':' à une photo');
  else{
    const t=(m.content||'').trim();
    if(t) quoi=' à « '+(t.length>40?t.slice(0,40)+'…':t)+' »';
  }
  const emo=m.last_reaction_emoji;
  if(m.last_reaction_by===U.id)return{at:m.last_reaction_at,text:`Tu as réagi ${emo}${quoi}`};
  const p=await ensureProfile(m.last_reaction_by);
  const who=displayName(m.last_reaction_by,p&&p.username);
  return {at:m.last_reaction_at,text:`${who} a réagi ${emo}${quoi}`};
}
function getLastSeen(convKey){const m=ST.convLastSeen||{};return m[convKey]||'1970-01-01';}
function setLastSeen(convKey){if(!ST.convLastSeen)ST.convLastSeen={};ST.convLastSeen[convKey]=new Date().toISOString();saveState();}
function subscribeInbox(){
  if(!sb||!U)return;
  unsubscribeInbox();
  const bump=()=>{
    clearTimeout(_inboxRefreshT);
    _inboxRefreshT=setTimeout(()=>{
      try{ if(document.getElementById('fs-inbox').classList.contains('on'))loadInbox(); }catch(e){}
      refreshInboxBadge();
    },180);   // groupé, mais court : la liste doit suivre le geste
  };
  try{
    _inboxChannel=sb.channel('inbox-'+U.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'direct_messages'},bump)
      .on('postgres_changes',{event:'*',schema:'public',table:'group_messages'},bump)
      // Un defi cree, rejoint ou supprime doit apparaitre ou disparaitre tout
      // de suite, sans attendre de rouvrir l'ecran.
      .on('postgres_changes',{event:'*',schema:'public',table:'challenges'},bump)
      .on('postgres_changes',{event:'*',schema:'public',table:'challenge_participants'},bump)
      .on('postgres_changes',{event:'*',schema:'public',table:'groups'},bump)
      .on('postgres_changes',{event:'*',schema:'public',table:'group_members'},bump)
      .subscribe();
  }catch(e){}
}
function unsubscribeInbox(){
  if(_inboxChannel){ try{sb.removeChannel(_inboxChannel);}catch(e){} _inboxChannel=null; }
}
function openInbox(){_inboxTab='all';_inboxFilter=ST.inboxFilter||'all';switchInboxTab('all');document.getElementById('fs-inbox').classList.add('on');subscribeInbox();}
function closeInbox(){document.getElementById('fs-inbox').classList.remove('on');unsubscribeInbox();refreshInboxBadge();}
function switchInboxTab(tab){
  _inboxTab=tab;
  ['all','dm','groups'].forEach(t=>{
    const b=document.getElementById('inbox-tab-'+t);
    if(b){const on=t===tab;b.style.background=on?'var(--ac)':'var(--surf2)';b.style.color=on?'#fff':'var(--muted)';b.style.border=on?'none':'1px solid var(--bdr)';}
  });
  loadInbox();
}
async function loadInbox(){
  const el=document.getElementById('inbox-list');
  if(!el||!U)return;
  // On réaffiche immédiatement la liste précédente : l'attente réseau ne se
  // voit plus, la mise à jour arrive derrière.
  if(_inboxConvs&&_inboxConvs.length)renderInboxList();
  else el.innerHTML='<div class="ib-empty">Chargement…</div>';
  const pMuted=loadMutedConvs();   // en parallèle du reste
  try{
    const convs=[];
    // Les trois familles se chargent EN PARALLELE : on attend la plus lente,
    // au lieu d'additionner les trois attentes comme avant.
    const pGroupes=(async()=>{
    if(_inboxTab==='all'||_inboxTab==='groups'){
      // On prend aussi les invitations : sans ca, elles n'apparaissent nulle
      // part depuis la suppression de l'ancien centre de notifications.
      const{data:mems}=await sb.from('group_members').select('group_id,status')
        .eq('user_id',U.id).in('status',['member','invited']);
      const invitedG=new Set((mems||[]).filter(m=>m.status==='invited').map(m=>m.group_id));
      const gids=(mems||[]).map(m=>m.group_id);
      if(gids.length){
        const{data:groups}=await sb.from('groups').select('*').in('id',gids);
        // Les deux requêtes de chaque groupe partent EN MÊME TEMPS, et tous les
        // groupes ensemble : on attend le plus lent, plus la somme de tous.
        // On ne demande aussi que les colonnes utiles, pas la ligne entière.
        const COLS='group_id,user_id,content,type,image_url,created_at,last_reaction_at,last_reaction_emoji,last_reaction_by';
        const lots=await Promise.all((groups||[]).map(async g=>{
          if(invitedG.has(g.id))return{g,lm:null,rx:null};
          const [last,rx]=await Promise.all([
            sb.from('group_messages').select(COLS).eq('group_id',g.id)
              .order('created_at',{ascending:false}).limit(1),
            sb.from('group_messages').select(COLS).eq('group_id',g.id)
              .not('last_reaction_at','is',null)
              .order('last_reaction_at',{ascending:false}).limit(1)
              .then(r=>r,()=>({data:null}))
          ]);
          return {g, lm:(last.data&&last.data[0])||null, rx:(rx&&rx.data&&rx.data[0])||null};
        }));
        for(const {g,lm,rx} of lots){
          if(invitedG.has(g.id)){
            convs.push({type:'group',id:g.id,name:g.name,isPublic:g.is_public,avatar:g.avatar_url,
              preview:'Invitation reçue',time:'',unread:true,invited:true});
            continue;
          }
          const unread=lm&&lm.user_id!==U.id&&lm.created_at>getLastSeen('g:'+g.id);
          let prev=lm?(lm.type==='challenge'?'🏆 '+lm.content:(lm.image_url?pieceJointeLabel(lm.image_url):lm.content)):'Aucun message';
          let tm=lm?lm.created_at:'';
          try{
            const r=await reactionPreview(rx);
            if(r&&(!tm||r.at>tm)){prev=r.text;tm=r.at;}
          }catch(e){}
          const videG=clearedAt('g:'+g.id);
          if(videG&&tm&&tm<=videG){prev='';tm='';}
          convs.push({type:'group',id:g.id,name:g.name,isPublic:g.is_public,avatar:g.avatar_url,preview:prev,time:tm,unread:videG&&tm===''?false:!!unread});
        }
      }
    }
    })();
    const pConvs=(async()=>{
    if(_inboxTab==='all'||_inboxTab==='dm'){
      const{data:dms}=await sb.from('direct_messages').select('*').or(`sender_id.eq.${U.id},receiver_id.eq.${U.id}`).order('created_at',{ascending:false}).limit(200);
      const byPartner={};
      (dms||[]).forEach(m=>{
        const partner=m.sender_id===U.id?m.receiver_id:m.sender_id;
        if(!byPartner[partner])byPartner[partner]={last:m,partner,rx:null};
        // On retient la réaction la plus récente de cette conversation
        if(m.last_reaction_at&&(!byPartner[partner].rx||m.last_reaction_at>byPartner[partner].rx.last_reaction_at))
          byPartner[partner].rx=m;
      });
      const partnerIds=Object.keys(byPartner);
      if(partnerIds.length){
        const{data:profs}=await sb.from('profiles').select('id,username,avatar_url').in('id',partnerIds);
        const pmap={};(profs||[]).forEach(p=>pmap[p.id]=p);
        // Toutes les conversations sont préparées EN PARALLELE. Attention :
        // ici « masquée » doit sauter la conversation, pas interrompre la
        // boucle — un « return » aurait fait disparaître toutes les suivantes.
        const lignes=await Promise.all(partnerIds.map(async pid=>{
          const c=byPartner[pid];const p=pmap[pid]||{};
          const hiddenAt=(ST.hiddenDMs||{})[pid];
          if(hiddenAt && c.last.created_at<=hiddenAt)return null;
          const unread=c.last.created_at>getLastSeen('dm:'+pid)&&c.last.sender_id!==U.id;
          let prev=(c.last.sender_id===U.id?'Toi : ':'')+(c.last.content||(c.last.image_url?pieceJointeLabel(c.last.image_url):''));
          let tm=c.last.created_at;
          const r=await reactionPreview(c.rx);
          if(r&&r.at>tm){prev=r.text;tm=r.at;}
          const vide=clearedAt('dm:'+pid);
          if(vide&&tm&&tm<=vide){prev='';tm='';}
          return {type:'dm',id:pid,name:p.username||'—',avatar:p.avatar_url,preview:prev,time:tm,unread:vide&&tm===''?false:!!unread};
        }));
        lignes.forEach(l=>{ if(l)convs.push(l); });
      }
    }
    })();
    const pDefis=(async()=>{
    // Mes défis : on les affiche ici, c'est là qu'on les cherche
    _inboxChallenges=[];
    try{
      const{data:parts}=await sb.from('challenge_participants').select('challenge_id,status,progress').eq('user_id',U.id);
      const cids=(parts||[]).map(p=>p.challenge_id);
      if(cids.length){
        const{data:chs}=await sb.from('challenges').select('*').in('id',cids);
        const today=new Date().toISOString().slice(0,10);
        const byId={};(parts||[]).forEach(p=>byId[p.challenge_id]=p);
        _inboxChallenges=(chs||[]).map(c=>({
          id:c.id,title:c.title,image:c.image_url,
          invited:byId[c.id]&&byId[c.id].status==='invited',
          ended:c.end_date<today,
          sub:byId[c.id]&&byId[c.id].status==='invited'
            ? 'Invitation reçue'
            : (c.end_date<today?'Terminé':'En cours · '+(byId[c.id]?byId[c.id].progress:0)+(c.target?'/'+c.target:''))
        })).sort((a,b)=>(a.ended?1:0)-(b.ended?1:0));
      }
    }catch(e){_inboxChallenges=[];}
    })();
    const afficherAuFur=(p)=>p.then(()=>{
      try{
        convs.sort((a,b)=>(b.time||'').localeCompare(a.time||''));
        _inboxConvs=convs.slice();
        renderInboxList();
      }catch(e){}
    });
    await Promise.all([pMuted,afficherAuFur(pGroupes),afficherAuFur(pConvs),afficherAuFur(pDefis)]);
    convs.sort((a,b)=>(b.time||'').localeCompare(a.time||''));
    _inboxConvs=convs;
    renderInboxList();
  }catch(e){el.innerHTML='<div class="ib-empty">Impossible de charger tes conversations. Vérifie ta connexion.</div>';}
}
function pinKey(it){ return it.kind==='challenge'?('c:'+it.id):((it.type==='dm'?'dm:':'g:')+it.id); }
function isPinned(it){ return !!(ST.pinned||{})[pinKey(it)]; }
function togglePin(key){
  if(!ST.pinned)ST.pinned={};
  if(ST.pinned[key])delete ST.pinned[key]; else ST.pinned[key]=true;
  saveState(); renderInboxList();
  toast(ST.pinned[key]?'Épinglé':'Désépinglé','ok');
}
function setInboxFilter(f){
  _inboxFilter=f;
  ST.inboxFilter=f; saveState();   // on retrouve le meme onglet a la prochaine ouverture
  document.querySelectorAll('#inbox-filter button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));
  renderInboxList();
}
function challengeRow(c){
  const pinned=isPinned({kind:'challenge',id:c.id});
  // Une seule action : le glissement s'arrête à 64px
  return `<div class="ib-row ${c.invited?'new':''}${pinned?' is-pinned':''}" style="--sw:64px;"
      ontouchstart="ibStart(event)" ontouchmove="ibMove(event)" ontouchend="ibEnd(event,this)">
    <div class="ib-act"><button class="pin" onclick="event.stopPropagation();togglePin('c:${c.id}')">${pinned?`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3c.6 0 1 .4 1 1s-.4 1-1 1h-1v5.6l3.4 4.9c.5.7 0 1.5-.8 1.5H13v5l-1 2-1-2v-5H5.4c-.8 0-1.3-.9-.8-1.5L8 10.6V5H7c-.6 0-1-.4-1-1s.4-1 1-1h9z"/></svg>`:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M16 3c.6 0 1 .4 1 1s-.4 1-1 1h-1v5.6l3.4 4.9c.5.7 0 1.5-.8 1.5H13v5l-1 2-1-2v-5H5.4c-.8 0-1.3-.9-.8-1.5L8 10.6V5H7c-.6 0-1-.4-1-1s.4-1 1-1h9z"/></svg>`}</button></div>
    <div class="ib-in" onclick="if(this.parentNode.classList.contains('swiped')){this.parentNode.classList.remove('swiped');return;}openChallengeDetail('${c.id}')">
      ${c.image
        ? `<div class="ib-av"><img src="${c.image}" alt=""></div>`
        : `<div class="ib-av stack"><i>🎯</i><i>${escapeHtml((c.title||'?')[0].toUpperCase())}</i></div>`}
      <div class="ib-body">
        <div class="ib-l1"><span class="ib-name">${escapeHtml(c.title)}</span></div>
        <div class="ib-prev">${escapeHtml(c.sub)}</div>
      </div>
      ${c.invited?'<div class="ib-dot"></div>':''}
    </div>
    ${c.invited?`<div class="ib-invite">
      <button class="ok" onclick="event.stopPropagation();acceptChallengeInvite('${c.id}')">Rejoindre</button>
      <button class="no" onclick="event.stopPropagation();declineChallengeInvite('${c.id}')">Refuser</button>
    </div>`:''}
  </div>`;
}
function renderInboxList(){
  const el=document.getElementById('inbox-list'); if(!el)return;
  const q=(document.getElementById('inbox-search')?.value||'').trim().toLowerCase();
  const f=_inboxFilter||'all';

  // Conversations et défis dans un même panier, pour qu'un épinglage
  // fonctionne pareil sur les trois types.
  let convs=_inboxConvs.slice();
  let chals=(_inboxChallenges||[]).slice();
  if(f==='dm') { convs=convs.filter(c=>c.type==='dm'); chals=[]; }
  if(f==='group'){ convs=convs.filter(c=>c.type==='group'); chals=[]; }
  if(f==='challenge'){ convs=[]; }
  if(q){
    convs=convs.filter(c=>(c.name||'').toLowerCase().includes(q)
      ||((c.type==='dm'&&nickOf(c.id))||'').toLowerCase().includes(q)
      ||(c.preview||'').toLowerCase().includes(q));
    chals=chals.filter(c=>(c.title||'').toLowerCase().includes(q));
  }

  const pinConvs=convs.filter(c=>isPinned(c));
  const pinChals=chals.filter(c=>isPinned({kind:'challenge',id:c.id}));
  const restConvs=convs.filter(c=>!isPinned(c));
  const restChals=chals.filter(c=>!isPinned({kind:'challenge',id:c.id}));

  if(!convs.length&&!chals.length){
    el.innerHTML=q
      ?'<div class="ib-empty">Rien ne correspond à cette recherche.</div>'
      :'<div class="ib-empty">Rien ici pour l\'instant.<br>Touche ✎ en haut pour écrire à quelqu\'un.</div>';
    return;
  }

  let html='';
  if(pinConvs.length||pinChals.length){
    html+='<div class="ib-sec first">Épinglés</div><div class="ib-card">'
      +pinConvs.map(inboxRow).join('')+pinChals.map(challengeRow).join('')+'</div>';
  }
  const unread=restConvs.filter(c=>c.unread), plusTot=restConvs.filter(c=>!c.unread);
  const premier=!(pinConvs.length||pinChals.length);
  html+=inboxSection('Non lus',unread,premier&&true);
  html+=inboxSection('Plus tôt',plusTot,premier&&!unread.length);
  if(restChals.length){
    html+='<div class="ib-sec">Défis</div><div class="ib-card">'+restChals.map(challengeRow).join('')+'</div>';
  }
  el.innerHTML=html;
}
function fmtInboxTime(iso){
  if(!iso)return '';
  const d=new Date(iso), now=new Date();
  const j=(x)=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
  const diff=Math.round((j(now)-j(d))/86400000);
  if(diff===0)return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  if(diff===1)return 'Hier';
  if(diff<7)return d.toLocaleDateString('fr-FR',{weekday:'short'});
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
}
function inboxSection(title,list,first){
  if(!list.length)return '';
  return `<div class="ib-sec${first?' first':''}">${title}</div><div class="ib-card">${list.map(inboxRow).join('')}</div>`;
}
function inboxRow(c){
  const safeName=escapeHtml(c.name).replace(/'/g,'');
  let av;
  if(c.type==='group'){
    // Les deux pastilles encodent une vraie info : visibilité du groupe + initiale
    av=c.avatar
      ? `<div class="ib-av"><img src="${c.avatar}" alt=""></div>`
      : `<div class="ib-av stack"><i>${c.isPublic?'🌍':'🔒'}</i><i>${escapeHtml((c.name||'?')[0].toUpperCase())}</i></div>`;
  }else if(c.avatar){
    av=`<div class="ib-av"><img src="${c.avatar}" alt=""></div>`;
  }else{
    av=`<div class="ib-av grad">${escapeHtml((c.name||'?')[0].toUpperCase())}</div>`;
  }
  const click=c.type==='dm'
    ?`openDM('${c.id}','${safeName}','${c.avatar||''}')`
    :`openGroupChat('${c.id}','${safeName}');markGroupSeen('${c.id}')`;
  const convKey=c.type==='dm'?('dm:'+c.id):('g:'+c.id);
  const isMuted=_mutedConvs.has(convKey);
  const pinned=isPinned(c);
  const nbAct=c.type==='dm'?3:2;
  const act=`<div class="ib-act">
      <button class="pin" onclick="event.stopPropagation();togglePin('${convKey}')" title="${pinned?'Désépingler':'Épingler'}">${pinned?`<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3c.6 0 1 .4 1 1s-.4 1-1 1h-1v5.6l3.4 4.9c.5.7 0 1.5-.8 1.5H13v5l-1 2-1-2v-5H5.4c-.8 0-1.3-.9-.8-1.5L8 10.6V5H7c-.6 0-1-.4-1-1s.4-1 1-1h9z"/></svg>`:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M16 3c.6 0 1 .4 1 1s-.4 1-1 1h-1v5.6l3.4 4.9c.5.7 0 1.5-.8 1.5H13v5l-1 2-1-2v-5H5.4c-.8 0-1.3-.9-.8-1.5L8 10.6V5H7c-.6 0-1-.4-1-1s.4-1 1-1h9z"/></svg>`}</button>
      <button class="mute" onclick="event.stopPropagation();toggleMuteConv('${convKey}')" title="${isMuted?'Réactiver':'Mettre en sourdine'}">
        ${isMuted
          ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>'
          :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'}
      </button>
      ${c.type==='dm'?`<button class="del" onclick="event.stopPropagation();hideDMFromInbox('${c.id}')" title="Retirer de la liste"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`:''}
    </div>`;
  const mutedIcon=isMuted?'<svg class="ib-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>':'';
  const nick=c.type==='dm'?nickOf(c.id):null;
  const shownName=nick||c.name;
  const inviteBtns=c.invited?`<div class="ib-invite">
      <button class="ok" onclick="event.stopPropagation();respondGroupInvite('${c.id}',true)">Rejoindre</button>
      <button class="no" onclick="event.stopPropagation();respondGroupInvite('${c.id}',false)">Refuser</button>
    </div>`:'';
  return `<div class="ib-row ${c.unread&&!isMuted?'new':''}${pinned?' is-pinned':''}" style="--sw:${nbAct*64}px;"
      ontouchstart="ibStart(event)" ontouchmove="ibMove(event)" ontouchend="ibEnd(event,this)">
    ${act}
    <div class="ib-in" onclick="if(this.parentNode.classList.contains('swiped')){this.parentNode.classList.remove('swiped');return;}${click}">
      ${av}
      <div class="ib-body">
        <div class="ib-l1"><span class="ib-name">${escapeHtml(shownName)}</span><span class="ib-time">${fmtInboxTime(c.time)}</span></div>
        <div class="ib-prev">${escapeHtml(c.preview||'')}</div>
      </div>
      ${mutedIcon}
      ${c.unread&&!isMuted?'<div class="ib-dot"></div>':''}
    </div>
    ${inviteBtns}
  </div>`;
}
function ibStart(e){_ib={x:e.touches[0].clientX,y:e.touches[0].clientY,on:false};}
function ibMove(e){
  const dx=e.touches[0].clientX-_ib.x, dy=e.touches[0].clientY-_ib.y;
  // 35 px, pas 8 : à 8 px le moindre écart pendant un défilement vertical
  // ouvrait le bouton de suppression sans qu'on l'ait voulu.
  if(!_ib.on){ if(Math.abs(dy)>Math.abs(dx)||dx>-35)return; _ib.on=true; }
}
function ibEnd(e,el){
  if(_ib.on){
    document.querySelectorAll('.ib-row.swiped').forEach(r=>{if(r!==el)r.classList.remove('swiped');});
    el.classList.toggle('swiped');
  }
  _ib={x:0,y:0,on:false};
}
async function hideDMFromInbox(pid){
  // La poubelle supprime vraiment : tes messages sont effaces en base, et
  // ceux de l'autre personne sont definitivement masques de ton cote (on ne
  // peut pas effacer les messages de quelqu'un d'autre). La conversation ne
  // revient donc pas, meme apres un nouveau message : seul ce nouveau message
  // apparaitra, dans une conversation vide.
  if(!confirm("Supprimer cette conversation ?\n\nTes messages seront effacés et l'historique disparaîtra de ton côté. C'est définitif."))return;
  try{
    await sb.from('direct_messages').delete().eq('sender_id',U.id).eq('receiver_id',pid);
  }catch(e){}
  // Coupe l'historique a maintenant : ce qui precede ne sera plus jamais relu.
  if(!ST.convCleared)ST.convCleared={};
  ST.convCleared['dm:'+pid]=new Date().toISOString();
  if(!ST.hiddenDMs)ST.hiddenDMs={};
  ST.hiddenDMs[pid]=new Date().toISOString();
  saveState();loadInbox();
  toast('Conversation supprimée','ok');
}
function openInboxCompose(){document.getElementById('inbox-compose-sheet').style.display='flex';}
function closeInboxCompose(){document.getElementById('inbox-compose-sheet').style.display='none';}
function markGroupSeen(groupId){setLastSeen('g:'+groupId);refreshInboxBadge();}
function openNewDM(){
  document.getElementById('new-dm-search').value='';
  document.getElementById('new-dm-results').innerHTML='<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px;">Cherche un ami pour lui écrire…</div>';
  const m=document.getElementById('modal-new-dm');
  if(m)m.style.zIndex='580';
  openModal('modal-new-dm');
}
function debouncedNewDMSearch(target){clearTimeout(_newDMTimer);_newDMTimer=setTimeout(()=>newDMSearch(target),400);}
async function newDMSearch(target){
  const inInbox=target==='inbox';
  const q=document.getElementById(inInbox?'inbox-search':'new-dm-search').value.trim();
  const el=document.getElementById(inInbox?'inbox-search-results':'new-dm-results');
  if(!q){el.innerHTML='';return;}
  el.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;">Recherche…</div>';
  try{
    // On n'ecrit qu'a des gens qu'on a deja ajoutes : la recherche par nom
    // reste donc limitee a ses propres amis. Pour trouver quelqu'un de
    // nouveau, il faut son code, depuis l'onglet Communaute.
    const{data:rels}=await sb.from('friendships')
      .select('followed_id').eq('follower_id',U.id).eq('status','accepted');
    const ids=(rels||[]).map(r=>r.followed_id);
    if(!ids.length){
      el.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;line-height:1.5;">Tu n\'as encore ajouté personne.<br><span style="font-size:12px;opacity:.75;">Demande son code à quelqu\'un pour l\'ajouter.</span></div>';
      return;
    }
    const{data}=await sb.from('profiles').select('id,username,avatar_url')
      .in('id',ids).ilike('username','%'+q+'%').limit(20);
    if(!data||!data.length){el.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;">Aucun de tes amis ne correspond</div>';return;}
    const closeAction=inInbox?'':"closeModal('modal-new-dm');";
    el.innerHTML=data.map(u=>{
      const avatarHtml=u.avatar_url?`<img src="${u.avatar_url}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">`:`<div style="width:38px;height:38px;border-radius:50%;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-size:16px;">👤</div>`;
      return `<div onclick="${closeAction}openDM('${u.id}','${escapeHtml(u.username||'').replace(/'/g,"")}','${u.avatar_url||''}')" style="display:flex;align-items:center;gap:12px;padding:13px 4px;border-bottom:1px solid var(--bdr);cursor:pointer;">
        ${avatarHtml}<div style="flex:1;font-size:16px;font-weight:600;letter-spacing:-.01em;">${escapeHtml(u.username||'—')}</div><span style="font-size:20px;color:var(--muted);">›</span>
      </div>`;
    }).join('');
  }catch(e){
    console.error('loadInbox',e);
    el.innerHTML='<div style="text-align:center;padding:16px;color:#ef4444;font-size:13px;line-height:1.6;">Impossible de charger<br><span style="font-size:10px;opacity:.85;">'+escapeHtml(String(e&&e.message||e))+'</span></div>';
  }
}
async function refreshInboxBadge(){
  const badge=document.getElementById('inbox-badge');
  if(!badge||!U)return;
  try{
    // On compte les CONVERSATIONS non lues (pas les messages) : plus lisible.
    const unreadDm=new Set();
    const{data:dms}=await sb.from('direct_messages').select('sender_id,created_at').eq('receiver_id',U.id).order('created_at',{ascending:false}).limit(50);
    (dms||[]).forEach(m=>{if(m.created_at>getLastSeen('dm:'+m.sender_id))unreadDm.add(m.sender_id);});
    let unreadGroups=0;
    const{data:mems}=await sb.from('group_members').select('group_id').eq('user_id',U.id).eq('status','member');
    const gids=(mems||[]).map(m=>m.group_id);
    if(gids.length){
      const{data:msgs}=await sb.from('group_messages').select('group_id,created_at,user_id').in('group_id',gids).order('created_at',{ascending:false}).limit(50);
      const seenGroup={};
      (msgs||[]).forEach(m=>{if(seenGroup[m.group_id])return;seenGroup[m.group_id]=true;
        if(m.user_id!==U.id&&m.created_at>getLastSeen('g:'+m.group_id))unreadGroups++;});
    }
    // Tout est centralisé sur l'icône des messages : conversations, groupes,
    // mais aussi les invitations et demandes, puisque défis et groupes vivent ici.
    let pending=0;
    try{
      const{count:c1}=await sb.from('friendships').select('*',{count:'exact',head:true})
        .eq('followed_id',U.id).eq('status','pending');
      const{count:c2}=await sb.from('group_members').select('*',{count:'exact',head:true})
        .eq('user_id',U.id).eq('status','invited');
      const{count:c3}=await sb.from('challenge_participants').select('*',{count:'exact',head:true})
        .eq('user_id',U.id).eq('status','invited');
      pending=(c1||0)+(c2||0)+(c3||0);
      // Demandes à rejoindre MES groupes
      const{data:mine}=await sb.from('groups').select('id').eq('creator_id',U.id);
      const myIds=(mine||[]).map(g=>g.id);
      if(myIds.length){
        const{count:c4}=await sb.from('group_members').select('*',{count:'exact',head:true})
          .in('group_id',myIds).eq('status','requested');
        pending+=(c4||0);
      }
    }catch(e){}
    const count=unreadDm.size+unreadGroups+pending;
    const hasUnread=count>0;
    const badgeHome=document.getElementById('inbox-badge-home');
    const badgeFab=document.getElementById('inbox-badge-fab');
    badge.style.display=hasUnread?'block':'none';
    if(badgeHome)badgeHome.style.display=hasUnread?'block':'none';
    if(badgeFab){
      badgeFab.textContent=count>9?'9+':String(count);
      badgeFab.classList.toggle('on',hasUnread);
    }
  }catch(e){}
}
