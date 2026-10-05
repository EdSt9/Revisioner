// ══════════════════════════════════════════════════════════════
// KeyFit — les fils de discussion
// Module isolé : ce fichier ne contient que les fils de discussion.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

async function openGroupChat(groupId,groupName){
  _chatGroupId=groupId;
  _groupUnreadSince=getLastSeen('g:'+groupId);   // figé avant marquage comme lu
  _noMoreOlder=false;_loadingOlder=false;
  document.getElementById('chat-group-name').textContent=(groupName||'Chat');
  document.getElementById('chat-input').value='';
  const box=document.getElementById('chat-messages');
  box.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px;">Chargement…</div>';
  document.getElementById('fs-group-chat').classList.add('on');
  // Suis-je le créateur ? Le groupe est-il privé ? (photos en privé seulement)
  try{
    const{data:g}=await sb.from('groups').select('*').eq('id',groupId).single();
    // Photo du groupe dans l'en-tête de la conversation
    const av=document.getElementById('chat-head-avatar');
    if(av)av.innerHTML=g&&g.avatar_url
      ? `<img src="${g.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;">`
      : '👥';
    _chatIsCreator=g&&g.creator_id===U.id;
    _chatIsPrivate=g&&!g.is_public;
  }catch(e){_chatIsCreator=false;_chatIsPrivate=false;}
  // Bouton photo visible uniquement dans les groupes privés
  const photoBtn=document.getElementById('chat-photo-btn');
  if(photoBtn)photoBtn.style.display=_chatIsPrivate?'flex':'none';
  await loadGroupMessages();
  subscribeGroupChat();
  setLastSeen('g:'+groupId);
  refreshInboxBadge();
}
async function loadGroupMessages(){
  const box=document.getElementById('chat-messages');
  try{
    // Les plus RÉCENTS d'abord, puis remis dans l'ordre (même piège que les DM).
    const{data:raw,error}=await sb.from('group_messages').select('*').eq('group_id',_chatGroupId).order('created_at',{ascending:false}).limit(60);
    const data=(raw||[]).slice().reverse();
    if(error){box.innerHTML='<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px;">Erreur de chargement</div>';return;}
    // Charger les profils des expéditeurs séparément (jointure peu fiable)
    const msgs=data||[];
    const uids=[...new Set(msgs.map(m=>m.user_id))];
    let pmap={};
    if(uids.length){
      const{data:profs}=await sb.from('profiles').select('id,username,avatar_url').in('id',uids);
      (profs||[]).forEach(p=>pmap[p.id]=p);
    }
    msgs.forEach(m=>{m.profiles=pmap[m.user_id]||null;});
    renderChatMessages(msgs);
  }catch(e){
    console.error('loadGroupMessages',e);
    box.innerHTML='<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px;line-height:1.5;">Erreur d\'affichage<br><span style="font-size:10px;opacity:.8;">'+escapeHtml(String(e&&e.message||e))+'</span></div>';
  }
}
function renderChatMessages(msgs){
  const box=document.getElementById('chat-messages');
  if(!msgs.length){
    box.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px;">Aucun message. Lance la conversation ! 💬</div>';
    return;
  }
  msgs=afterClear(msgs,'g:'+_chatGroupId);
  _groupCache=msgs;
  box.innerHTML=buildThreadHtml(msgs,'group',_groupUnreadSince);
  scrollMsgBox(box);
  attachOlderLoader('group');
  attacherBoutonBas('group');
  _nonLusEnBas.group=0; majBoutonBas('group');
  if(Object.keys(_groupTyping).length)setTypingBubble('group',true);
}
async function sendGroupMessage(){
  const input=document.getElementById('chat-input');
  const content=input.value.trim();
  const pendPhoto=(_pendingPhoto&&_pendingPhoto.kind==='group')?_pendingPhoto:null;
  const pendVoice=(_pendingVoice&&_pendingVoice.kind==='group')?_pendingVoice:null;
  if(!content&&!pendPhoto&&!pendVoice)return;
  if(!_chatGroupId)return;
  if(_editingMsg&&_editingMsg.kind==='group'){
    const id=_editingMsg.id;
    input.value='';autoGrowInput(input);
    const error=await applyMsgEdit('group_messages',id,content);
    if(error){toast('Erreur : '+error.message,'err');input.value=content;return;}
    cancelEditMsg('group');
    await loadGroupMessages();return;
  }
  input.value='';autoGrowInput(input);
  if(pendVoice){await sendPendingVoice();}
  let imageUrl=null;
  if(pendPhoto){
    toast('Envoi de la photo…','ok');
    try{imageUrl=await uploadPendingPhoto();}catch(e){toast('Erreur photo : '+(e.message||e),'err');input.value=content;return;}
    cancelPendingPhoto('group');
  }
  if(!content&&!imageUrl)return;
  const row={group_id:_chatGroupId,user_id:U.id,content:content||null,type:'text'};
  if(imageUrl)row.image_url=imageUrl;
  if(_replyingTo)row.reply_to=_replyingTo.id;
  try{
    let ins=await sb.from('group_messages').insert(row).select().single();
    if(ins.error && row.reply_to){delete row.reply_to;ins=await sb.from('group_messages').insert(row).select().single();}
    if(ins.error){toast('Erreur : '+ins.error.message,'err');input.value=content;return;}
    cancelReplyChat();
    _groupUnreadSince=null;   // on vient de répondre : le séparateur disparaît
    const m=ins.data;
    m.profiles={id:U.id,username:(P&&P.username)||'',avatar_url:(P&&P.avatar_url)||null};
    if(!appendMsgLocal(m,'group'))await loadGroupMessages();
  }catch(e){toast('Erreur','err');input.value=content;}
}
async function deleteGroupMessage(msgId){
  try{
    // On récupère le fichier éventuel AVANT de supprimer la ligne
    let imgUrl=null;
    try{const{data}=await sb.from('group_messages').select('image_url').eq('id',msgId).single();imgUrl=data&&data.image_url;}catch(e){}
    await sb.from('group_messages').delete().eq('id',msgId);
    supprimerFichierMessage(imgUrl);
    await loadGroupMessages();
  }catch(e){toast('Erreur','err');}
}
async function reportChatMessage(msgId){
  try{
    const{error}=await sb.from('group_messages').update({reported:true,reported_by:U.id}).eq('id',msgId);
    if(error){toast('Erreur : '+error.message,'err');return;}
    toast('⚐ Message signalé au créateur du groupe','ok');
    await loadGroupMessages();
  }catch(e){toast('Erreur','err');}
}
async function toggleReaction(msgId,emoji,table){
  const tbl=table||'group_messages';
  const reload=tbl==='direct_messages'?loadDM:loadGroupMessages;
  try{
    const{data:msg}=await sb.from(tbl).select('reactions').eq('id',msgId).single();
    const reactions=(msg&&msg.reactions)||{};
    const users=reactions[emoji]||[];
    const idx=users.indexOf(U.id);
    if(idx>=0){users.splice(idx,1);}
    else{users.push(U.id);}
    if(users.length)reactions[emoji]=users; else delete reactions[emoji];
    // On mémorise la dernière réaction pour pouvoir la situer dans le temps
    // face au dernier message (sinon impossible de savoir laquelle est la plus récente).
    const patch={reactions};
    if(idx<0){patch.last_reaction_at=new Date().toISOString();patch.last_reaction_emoji=emoji;patch.last_reaction_by=U.id;}
    let{error}=await sb.from(tbl).update(patch).eq('id',msgId);
    // Colonnes absentes : on retombe sur la mise à jour simple, rien ne casse
    if(error&&idx<0)({error}=await sb.from(tbl).update({reactions}).eq('id',msgId));
    if(error){toast('Erreur réaction : '+error.message,'err');return;}
    // Réagir, c'est avoir lu : le séparateur n'a plus lieu d'être
    if(tbl==='direct_messages')_dmUnreadSince=null; else _groupUnreadSince=null;
    // On prévient l'auteur du message (jamais soi-même, et seulement à l'ajout)
    if(idx<0){
      try{
        const{data:full}=await sb.from(tbl).select('*').eq('id',msgId).maybeSingle();
        const auteur=full?(tbl==='direct_messages'?full.sender_id:full.user_id):null;
        if(auteur&&auteur!==U.id){
          const quoi=full.image_url
            ? (isVoiceUrl(full.image_url)?'à ton message vocal':'à ta photo')
            : 'à « '+((full.content||'').trim().slice(0,40))+' »';
          pushNotif(auteur,'reaction',`${myName()} a réagi ${emoji} ${quoi}`);
        }
      }catch(e){}
    }
    await reload();
  }catch(e){toast('Erreur','err');}
}
function openMsgCtxMenu(msgId,kind,mine,reported){
  _ctxMsg={id:msgId,kind,mine:mine===true||mine==='true',reported:reported===true||reported==='true'};
  const srcBubble=document.getElementById('msg-'+msgId);
  const back=document.getElementById('msg-ctx-menu');
  if(!srcBubble){back.style.display='block';return;}
  const r=srcBubble.getBoundingClientRect();
  const isMine=_ctxMsg.mine;
  back.innerHTML='';back.style.display='block';back.classList.add('ctx-ios');

  // clone de la bulle, nette, à sa position
  const clone=document.createElement('div');
  clone.className='ctxio-clone';
  clone.style.left=isMine?'auto':r.left+'px';
  clone.style.right=isMine?(window.innerWidth-r.right)+'px':'auto';
  clone.innerHTML=`<div class="ctxio-bubble" style="background:${isMine?'var(--bubble-mine)':'var(--surf2)'};color:${isMine?'#fff':'var(--txt)'};border-radius:${isMine?'20px 20px 6px 20px':'20px 20px 20px 6px'};${isMine?'':'border:.5px solid color-mix(in srgb,var(--ac) 32%,transparent);'}">${srcBubble.innerHTML}</div>`;

  // barre d'emojis flottante
  const reactBar=document.createElement('div');
  reactBar.className='ctxio-react';
  reactBar.innerHTML=REACTION_EMOJIS.map(e=>`<button onclick="msgCtxReact('${e}')">${e}</button>`).join('')
    +`<label class="more" for="emoji-catch" onclick="openMoreEmojisIOS(event)">＋</label>`;

  // carte d'actions
  const canDelete=isMine||(kind==='group'&&_chatIsCreator);
  const canReport=!isMine&&!_ctxMsg.reported;
  const cache=kind==='dm'?_dmCache:_groupCache;
  const srcMsg=(cache||[]).find(x=>String(x.id)===String(msgId));
  const hasThread=cache&&(cache.some(x=>String(x.reply_to)===String(msgId))||(srcMsg&&srcMsg.reply_to));
  const menu=document.createElement('div');
  menu.className='ctxio-menu';
  let items=`<button class="ctxio-item" onclick="msgCtxReply()">Répondre <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></button>`;
  // Modifier : mes messages texte, dans les 15 min après l'envoi
  if(isMine&&srcMsg&&srcMsg.content&&!srcMsg.image_url&&(Date.now()-new Date(srcMsg.created_at))<15*60*1000){
    items+=`<button class="ctxio-item" onclick="msgCtxEdit()">Modifier <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>`;
  }
  if(hasThread)items+=`<button class="ctxio-item" onclick="msgCtxThread()">Voir le fil <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>`;
  const estEpingle=srcMsg&&srcMsg.pinned;
  items+=`<button class="ctxio-item" onclick="msgCtxPin()">${estEpingle?'Désépingler':'Épingler'} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M9 2h6l-1 7 3 3v3H7v-3l3-3z"/></svg></button>`;
  items+=`<button class="ctxio-item" onclick="msgCtxCopy()">Copier <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
  if(canReport)items+=`<button class="ctxio-item" onclick="msgCtxReport()">Signaler <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></button>`;
  if(canDelete)items+=`<button class="ctxio-item danger" onclick="msgCtxDelete()">Supprimer <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`;
  menu.innerHTML=items;

  back.appendChild(reactBar);back.appendChild(clone);back.appendChild(menu);

  // placement vertical : garder la bulle en place, remonter si ça déborde.
  // On borne au viewport VISIBLE (clavier ouvert compris), sinon tout se
  // place derrière le clavier et on ne voit que le fond flouté.
  var vv=window.visualViewport;
  var vTop=vv?vv.offsetTop:0;
  var vBottom=vv?(vv.offsetTop+vv.height):window.innerHeight;
  const gap=10,reactH=56,margin=16;
  const nItems=menu.querySelectorAll('.ctxio-item').length, menuH=nItems*48+8;
  let top=r.top;
  if(top<vTop+reactH+gap+margin)top=vTop+reactH+gap+margin;
  if(top+r.height+gap+menuH+margin>vBottom)top=vBottom-r.height-gap-menuH-margin;
  clone.style.top=top+'px';
  reactBar.style.top=(top-reactH)+'px';
  reactBar.style[isMine?'right':'left']=(isMine?(window.innerWidth-r.right):r.left)+'px';
  menu.style.top=(top+r.height+gap)+'px';
  menu.style[isMine?'right':'left']=(isMine?(window.innerWidth-r.right):r.left)+'px';

  if(navigator.vibrate)navigator.vibrate(12);
}
function msgCtxReply(){ if(!_ctxMsg)return; const{id,kind}=_ctxMsg; closeMsgCtxMenu(); startReplyTo(id,kind); }
function msgCtxEdit(){
  if(!_ctxMsg)return; const{id,kind}=_ctxMsg; closeMsgCtxMenu();
  const cache=kind==='dm'?_dmCache:_groupCache;
  const m=(cache||[]).find(x=>String(x.id)===String(id)); if(!m)return;
  _editingMsg={id,kind}; _replyingTo=null;
  const barId=kind==='dm'?'dm-reply-bar':'chat-reply-bar';
  const el=document.getElementById(barId);
  el.innerHTML=`<div class="msg-replybar"><div class="rb-txt"><b>Modifier le message</b><span>${escapeHtml((m.content||'').slice(0,90))}</span></div><button onclick="cancelEditMsg('${kind}')">✕</button></div>`;
  const input=document.getElementById(kind==='dm'?'dm-input':'chat-input');
  if(input){input.value=m.content||'';autoGrowInput(input);input.focus();}
}
function cancelEditMsg(kind){
  _editingMsg=null;
  const el=document.getElementById(kind==='dm'?'dm-reply-bar':'chat-reply-bar');if(el)el.innerHTML='';
  const input=document.getElementById(kind==='dm'?'dm-input':'chat-input');
  if(input){input.value='';autoGrowInput(input);}
}
async function applyMsgEdit(tbl,id,content){
  let{error}=await sb.from(tbl).update({content,edited:true}).eq('id',id);
  if(error && /edited/.test(error.message||'')){({error}=await sb.from(tbl).update({content}).eq('id',id));}
  return error;
}
function msgCtxThread(){ if(!_ctxMsg)return; const{id,kind}=_ctxMsg; closeMsgCtxMenu(); setTimeout(()=>openThreadView(id,kind),120); }
function msgCtxCopy(){ if(!_ctxMsg)return; const cache=_ctxMsg.kind==='dm'?_dmCache:_groupCache; const m=(cache||[]).find(x=>String(x.id)===String(_ctxMsg.id)); if(m&&m.content){try{navigator.clipboard.writeText(m.content);toast('Copié','ok');}catch(e){}} closeMsgCtxMenu(); }
async function msgCtxPin(){
  if(!_ctxMsg)return;
  const{id,kind}=_ctxMsg;
  closeMsgCtxMenu();
  const cache=kind==='dm'?_dmCache:_groupCache;
  const m=(cache||[]).find(x=>String(x.id)===String(id));
  if(!m)return;
  const nouveau=!m.pinned;
  const table=kind==='dm'?'direct_messages':'group_messages';
  try{
    const{error}=await sb.from(table).update({pinned:nouveau}).eq('id',id);
    if(error)throw error;
    m.pinned=nouveau;   // mise à jour immédiate, sans attendre un rechargement
    if(kind==='dm')await loadDM(); else await loadGroupMessages();
    toast(nouveau?'📌 Message épinglé':'Message désépinglé','ok');
  }catch(e){
    toast("La colonne « pinned » n'existe pas encore en base",'err');
  }
}
function openThreadView(msgId,kind){
  const cache=kind==='dm'?_dmCache:_groupCache; if(!cache)return;
  const byId=id=>cache.find(x=>String(x.id)===String(id));
  let root=msgId,guard=0;
  while(byId(root)&&byId(root).reply_to&&guard++<80)root=byId(root).reply_to;
  const chain=[],seen=new Set();
  (function walk(id){ if(seen.has(String(id)))return; seen.add(String(id));
    const m=byId(id); if(!m)return; chain.push(m);
    cache.filter(x=>String(x.reply_to)===String(id)).forEach(x=>walk(x.id));
  })(root);
  chain.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  document.getElementById('thv-count').textContent=chain.length+' message'+(chain.length>1?'s':'')+' liés';
  document.getElementById('thv-body').innerHTML=chain.map((m,i)=>{
    const mine=(kind==='dm')?(m.sender_id===U.id):(m.user_id===U.id);
    const who=mine?'Toi':((kind==='group'?m.profiles?.username:_dmPartnerName)||'—');
    const conn=i>0?'<div class="thv-conn"></div>':'';
    const img=m.image_url?`<img src="${m.image_url}" onclick="openImgViewer('${m.image_url}')" style="max-width:200px;width:100%;border-radius:12px;margin-bottom:4px;display:block;cursor:pointer;">`:'';
    const border=mine?'':'border:.5px solid color-mix(in srgb,var(--ac) 32%,transparent);';
    return `${conn}<div style="display:flex;flex-direction:column;align-items:${mine?'flex-end':'flex-start'};margin-bottom:6px;max-width:88%;${mine?'margin-left:auto;':''}">
      <div style="font-size:11.5px;font-weight:600;color:var(--ac);margin:0 0 3px 10px;">${escapeHtml(who)}</div>
      <div style="background:${mine?'var(--bubble-mine)':'var(--surf2)'};color:${mine?'#fff':'var(--txt)'};border-radius:16px;${border}padding:9px 14px;font-size:16px;line-height:1.35;word-break:break-word;white-space:pre-wrap;">${img}${m.content?linkifyMsg(escapeHtml(m.content),mine):''}</div>
    </div>`;
  }).join('');
  document.getElementById('thread-view').classList.add('on');
}
function closeThreadView(){document.getElementById('thread-view').classList.remove('on');}
function openMediaPanel(kind){
  _mediaKind=kind; if(kind==='dm')closeDMOptions();
  document.getElementById('media-panel').classList.add('on');
  mediaTab('photos');
}
function closeMediaPanel(){document.getElementById('media-panel').classList.remove('on');}
async function mediaTab(which){
  document.getElementById('mp-tab-photos').classList.toggle('on',which==='photos');
  document.getElementById('mp-tab-links').classList.toggle('on',which==='links');
  const el=document.getElementById('mp-body');
  el.innerHTML='<div class="mp-empty">Chargement…</div>';
  const isDM=_mediaKind==='dm';
  const convKey=isDM?('dm:'+_dmPartnerId):('g:'+_chatGroupId);
  const fmtDay=iso=>{const d=new Date(iso);return d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});};
  // On interroge TOUT l'historique, pas seulement les messages affichés :
  // une photo envoyée il y a six mois reste retrouvable.
  function base(){
    return isDM
      ? sb.from('direct_messages').select('*').or(`and(sender_id.eq.${U.id},receiver_id.eq.${_dmPartnerId}),and(sender_id.eq.${_dmPartnerId},receiver_id.eq.${U.id})`)
      : sb.from('group_messages').select('*').eq('group_id',_chatGroupId);
  }
  try{
    if(which==='photos'){
      let q=base().not('image_url','is',null).order('created_at',{ascending:false}).limit(120);
      const c=clearedAt(convKey); if(c)q=q.gt('created_at',c);
      const{data}=await q;
      const photos=(data||[]).filter(m=>!isVoiceUrl(m.image_url));
      if(!photos.length){el.innerHTML='<div class="mp-empty">Aucune photo partagée pour l\'instant.</div>';return;}
      const groups={};photos.forEach(m=>{const d=fmtDay(m.created_at);(groups[d]=groups[d]||[]).push(m);});
      el.innerHTML=Object.keys(groups).map(day=>
        `<div class="mp-date">${day}</div><div class="mp-grid">`+
        groups[day].map(m=>`<img src="${thumbUrl(m.image_url)}" loading="lazy" onerror="this.onerror=null;this.src='${m.image_url}'" onclick="openImgViewer('${m.image_url}')">`).join('')+
        `</div>`).join('');
    }else{
      let q=base().ilike('content','%http%').order('created_at',{ascending:false}).limit(200);
      const c=clearedAt(convKey); if(c)q=q.gt('created_at',c);
      const{data}=await q;
      const links=[];
      (data||[]).forEach(m=>{ (String(m.content||'').match(/https?:\/\/[^\s]+/g)||[]).forEach(url=>{
        const mine=isDM?(m.sender_id===U.id):(m.user_id===U.id);
        links.push({url,uid:mine?null:(isDM?_dmPartnerId:m.user_id),mine,t:m.created_at}); }); });
      if(!links.length){el.innerHTML='<div class="mp-empty">Aucun lien partagé pour l\'instant.</div>';return;}
      const rows=[];
      for(const l of links){
        let who='Toi';
        if(!l.mine){ const pr=await ensureProfile(l.uid); who=displayName(l.uid,(pr&&pr.username)||_dmPartnerName); }
        let host='lien';try{host=new URL(l.url).hostname.replace('www.','');}catch(e){}
        const icon=/youtu/.test(host)?'▶️':/keyfit/.test(host)?'🏋️':/insta/.test(host)?'📸':'🔗';
        const when=new Date(l.t).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
        rows.push(`<a class="mp-link" href="${l.url}" target="_blank"><div class="mp-fav">${icon}</div>
          <div class="t"><b>${host}</b><span>${escapeHtml(l.url)}</span><small>${escapeHtml(who)} · ${when}</small></div></a>`);
      }
      el.innerHTML=rows.reverse().join('');
    }
  }catch(e){el.innerHTML='<div class="mp-empty">Impossible de charger. Vérifie ta connexion.</div>';}
}
function closeMsgCtxMenu(){const b=document.getElementById('msg-ctx-menu');b.style.display='none';b.classList.remove('ctx-ios');b.innerHTML='';_ctxMsg=null;}
function msgCtxReact(emoji){
  if(_ctxMsg){
    const tbl=_ctxMsg.kind==='dm'?'direct_messages':'group_messages';
    toggleReaction(_ctxMsg.id,emoji,tbl);
  }
  closeMsgCtxMenu();
}
function msgCtxDelete(){
  if(!_ctxMsg)return;
  const{id,kind}=_ctxMsg;
  closeMsgCtxMenu();
  // Filet de sécurité : depuis que le fichier joint part aussi du stockage,
  // la suppression est définitive. Une pression longue mal placée ne doit pas
  // suffire à effacer une photo pour tout le monde.
  const cache=kind==='dm'?_dmCache:_groupCache;
  const m=(cache||[]).find(x=>String(x.id)===String(id));
  const url=m&&m.image_url;
  let quoi='';
  if(url)quoi=isVoiceUrl(url)
    ? '\n\nLe message vocal sera effacé définitivement.'
    : '\n\nLa photo sera effacée définitivement.';
  const pour=kind==='group'?'les membres du groupe':'ton interlocuteur';
  if(!confirm('Supprimer ce message ?'+quoi+'\n\nIl disparaîtra aussi pour '+pour+'.'))return;
  if(kind==='group')deleteGroupMessage(id); else deleteDM(id);
}
function msgCtxReport(){
  if(!_ctxMsg)return;
  const{id,kind}=_ctxMsg;
  closeMsgCtxMenu();
  if(kind==='group'){reportChatMessage(id);}
  else{toast('⚐ Message signalé. Merci de nous aider à garder KeyFit sain.','ok');}
}
function startMsgPress(msgId,kind,mine,reported,ev){
  cancelMsgPress();
  _pressTimer=setTimeout(()=>{_longPressed=true;openMsgCtxMenu(msgId,kind,mine,reported);},500);
}
function cancelMsgPress(){if(_pressTimer){clearTimeout(_pressTimer);_pressTimer=null;}}
function subscribeGroupChat(){
  if(_chatChannel){sb.removeChannel(_chatChannel);_chatChannel=null;}
  _chatChannel=sb.channel('group-chat-'+_chatGroupId,{config:{presence:{key:U.id}}})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'group_messages',filter:'group_id=eq.'+_chatGroupId},async(payload)=>{
      const r=payload.new||{};
      if(r.user_id!==U.id){delete _groupTyping[r.user_id];setTypingBubble('group',Object.keys(_groupTyping).length>0);}
      r.profiles=await ensureProfile(r.user_id);
      if(!appendMsgLocal(r,'group'))loadGroupMessages();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'group_messages',filter:'group_id=eq.'+_chatGroupId},()=>loadGroupMessages())
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'group_messages',filter:'group_id=eq.'+_chatGroupId},()=>loadGroupMessages())
    .on('presence',{event:'sync'},()=>renderChatPresence())
    .on('presence',{event:'join'},()=>renderChatPresence())
    .on('presence',{event:'leave'},()=>renderChatPresence())
    .on('broadcast',{event:'typing'},({payload})=>{
      if(payload.uid===U.id)return;
      if(payload.voice){
        _groupVoice[payload.uid]=payload.name;renderChatPresence();
        clearTimeout(_groupVoiceClear[payload.uid]);
        _groupVoiceClear[payload.uid]=setTimeout(()=>{
          delete _groupVoice[payload.uid];renderChatPresence();
        },4000);
        return;
      }
      _groupTyping[payload.uid]=payload.name;setTypingBubble('group',true);
      clearTimeout(_groupTypingClear[payload.uid]);
      _groupTypingClear[payload.uid]=setTimeout(()=>{
        delete _groupTyping[payload.uid];
        setTypingBubble('group',Object.keys(_groupTyping).length>0);
      },3500);
    })
    .subscribe(async(status)=>{ if(status==='SUBSCRIBED')await _chatChannel.track({online:true,name:(P&&P.username?P.username:'')}); });
}
function renderChatPresence(){
  const el=document.getElementById('chat-presence'); if(!el||!_chatChannel)return;
  const enreg=Object.values(_groupVoice);
  if(enreg.length){
    el.textContent=enreg.length===1
      ?`🎙 ${enreg[0]} enregistre un vocal…`
      :`🎙 ${enreg.length} personnes enregistrent…`;
    el.style.color='var(--ac)';
    return;
  }
  let n=0;try{n=Object.keys(_chatChannel.presenceState()||{}).length;}catch(e){}
  el.textContent=n>1?(n+' en ligne'):'en ligne';
  el.style.color=n>1?'#30D158':'var(--muted)';
}
function chatTyping(){
  if(!_chatChannel||!_chatGroupId)return;
  if(_typingTimer)return;
  _chatChannel.send({type:'broadcast',event:'typing',payload:{uid:U.id,name:(P&&P.username?P.username:'Quelqu\'un')}});
  _typingTimer=setTimeout(()=>{_typingTimer=null;},1500);
}
function closeGroupChat(){
  if(_chatChannel){sb.removeChannel(_chatChannel);_chatChannel=null;}
  const gid=_chatGroupId;
  _chatGroupId=null;
  document.getElementById('fs-group-chat').classList.remove('on');
  _groupCache=null;cancelReplyChat();_groupTyping={};
  refreshInboxBadge();
  // Revenir à la liste des conversations si elle est ouverte
  if(document.getElementById('fs-inbox').classList.contains('on'))loadInbox();
}
function openGroupDetailFromChat(){
  if(_chatGroupId){
    const gid=_chatGroupId;
    // Le modal détail doit passer au-dessus du chat plein écran
    const m=document.getElementById('modal-group-detail');
    if(m)m.style.zIndex='580';
    openGroupDetail(gid);
  }
}
function clearedAt(convKey){ return (ST.convCleared||{})[convKey]||null; }
function afterClear(list,convKey){
  const c=clearedAt(convKey);
  return c?list.filter(m=>m.created_at>c):list;
}
function askClearConversation(kind,idExplicite){
  // Depuis le détail d'un groupe, la conversation n'est pas forcément ouverte :
  // on accepte donc un identifiant passé explicitement.
  if(kind!=='dm'&&idExplicite)_chatGroupId=idExplicite;
  const label=kind==='dm'?'cette conversation':'ce groupe';
  if(!confirm('Vider tous les messages de '+label+' de ton côté ?\n\nIls resteront visibles pour les autres. Les photos et liens disparaîtront aussi de « Photos et liens ».'))return;
  const key=kind==='dm'?('dm:'+_dmPartnerId):('g:'+_chatGroupId);
  if(!ST.convCleared)ST.convCleared={};
  ST.convCleared[key]=new Date().toISOString();
  saveState();
  if(kind==='dm'){closeDMOptions();_dmCache=[];loadDM();}
  else{_groupCache=[];loadGroupMessages();}
  toast('Conversation vidée','ok');
}
async function openDM(partnerId,partnerName,partnerAvatar){
  // Blocage : aucune conversation possible dans les deux sens
  if(await isBlockedBetween(partnerId)){
    toast('Impossible d\'écrire à cet utilisateur.','err');
    return;
  }
  // Vérifier l'amitié : on ne peut écrire qu'à un ami
  const friends=await areFriends(partnerId);
  const hasHistory=await dmHasHistory(partnerId);
  if(!friends && !hasHistory){
    // Pas ami et jamais échangé → proposer une demande d'ami
    if(confirm('Tu dois être ami avec cette personne pour lui écrire. Envoyer une demande d\'ami ?')){
      try{
        await sb.from('friendships').insert({follower_id:U.id,followed_id:partnerId,status:'pending'});
        toast('Demande d\'ami envoyée','ok');
      }catch(e){toast('Demande déjà envoyée ou erreur','err');}
    }
    return;
  }
  _dmPartnerId=partnerId;_dmPartnerName=partnerName||'';
  _dmUnreadSince=getLastSeen('dm:'+partnerId);   // figé avant marquage comme lu
  _noMoreOlder=false;_loadingOlder=false;
  document.getElementById('dm-name').textContent=displayName(partnerId,partnerName);
  const pres=document.getElementById('dm-presence');if(pres){pres.textContent='';}
  const av=document.getElementById('dm-head-avatar');
  if(av)av.innerHTML=partnerAvatar
    ?`<img src="${partnerAvatar}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">`
    :`<div style="width:38px;height:38px;border-radius:50%;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-size:17px;">👤</div>`;
  document.getElementById('dm-input').value='';
  const box=document.getElementById('dm-messages');
  box.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px;">Chargement…</div>';
  document.getElementById('fs-dm').classList.add('on');
  await loadDM();
  setLastSeen('dm:'+partnerId);
  refreshInboxBadge();
  subscribeDM();
}
async function dmHasHistory(partnerId){
  // Autoriser l'accès à une conversation déjà existante (ex : ancien ami)
  try{
    const{data}=await sb.from('direct_messages').select('id').or(`and(sender_id.eq.${U.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${U.id})`).limit(1);
    return (data||[]).length>0;
  }catch(e){return false;}
}
async function loadDM(){
  const box=document.getElementById('dm-messages');
  // Sans destinataire valide, la requete partirait avec « undefined » et
  // Postgres la rejetterait : on le dit clairement plutot que d'echouer.
  if(!_dmPartnerId||!U){
    box.innerHTML='<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px;">Conversation introuvable — reviens en arriere et reouvre-la.</div>';
    return;
  }
  try{
    // On demande les plus RÉCENTS (desc + limit), puis on remet dans l'ordre.
    // Avec ascending:true + limit, on récupérait les 300 plus ANCIENS et les
    // messages récents disparaissaient dès que la conversation dépassait la limite.
    const{data:raw,error}=await sb.from('direct_messages').select('*').or(`and(sender_id.eq.${U.id},receiver_id.eq.${_dmPartnerId}),and(sender_id.eq.${_dmPartnerId},receiver_id.eq.${U.id})`).order('created_at',{ascending:false}).limit(60);
    const data=(raw||[]).slice().reverse();
    if(error){
      // On affiche la raison : « Erreur » seul ne permettait pas de diagnostiquer.
      console.error('loadDM requete',error);
      box.innerHTML='<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px;line-height:1.6;">Impossible de charger<br><span style="font-size:10px;opacity:.85;">'+escapeHtml(String(error.message||error.code||error))+'</span></div>';
      return;
    }
    if(!data||!data.length){box.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px;">Aucun message. Dis bonjour ! 👋</div>';return;}
    const shown=afterClear(data,'dm:'+_dmPartnerId);
    _dmCache=shown;
    box.innerHTML=buildThreadHtml(shown,'dm',_dmUnreadSince);
    scrollMsgBox(box);
    if(_peerTyping)setTypingBubble('dm',true);
    markDmRead();
    attachOlderLoader('dm');
    attacherBoutonBas('dm');
    _nonLusEnBas.dm=0; majBoutonBas('dm');
  }catch(e){
    console.error('loadDM',e);
    box.innerHTML='<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px;line-height:1.5;">Erreur d\'affichage<br><span style="font-size:10px;opacity:.8;">'+escapeHtml(String(e&&e.message||e))+'</span></div>';
  }
}
function renderMsgRow(m,next,kind){
  const mine=(kind==='dm')?(m.sender_id===U.id):(m.user_id===U.id);
  if(kind==='group' && m.type==='challenge'){
    return `<div style="text-align:center;font-size:11px;color:#22c55e;background:rgba(34,197,94,.1);border-radius:14px;padding:6px 10px;align-self:center;max-width:90%;margin:4px auto;">🏆 ${escapeHtml(m.content)}</div>`;
  }
  // Annonce de la vie du groupe : visible par tous, même sans regarder ses notifications
  if(kind==='group' && m.type==='system'){
    return `<div class="msg-system">${escapeHtml(m.content)}</div>`;
  }
  const nextMine=next?((kind==='dm')?(next.sender_id===U.id):(next.user_id===U.id)):null;
  const tail=!next || nextMine!==mine || (kind==='group'&&(next.type==='challenge'||next.type==='system'));
  const cache=(kind==='dm')?_dmCache:_groupCache;
  // citation (reply_to)
  let quote='';
  if(m.reply_to && cache){
    const q=cache.find(x=>String(x.id)===String(m.reply_to));
    if(q){
      const qmine=(kind==='dm')?(q.sender_id===U.id):(q.user_id===U.id);
      const qname=qmine?'Toi':((kind==='group'?(q.profiles?.username):_dmPartnerName)||'—');
      const qtext=q.image_url?pieceJointeApercu(q):escapeHtml((q.content||'').slice(0,80));
      quote=`<span class="msg-quote ${mine?'q-mine':'q-their'}" onclick="event.stopPropagation();jumpToMsg('${q.id}')"><b>${escapeHtml(qname)}</b><span>${qtext}</span></span>`;
    }
  }
  const press=`onmousedown="startMsgPress('${m.id}','${kind}',${mine},${!!m.reported},event)" onmouseup="cancelMsgPress()" onmouseleave="cancelMsgPress()" ontouchstart="startMsgPress('${m.id}','${kind}',${mine},${!!m.reported},event)" ontouchend="cancelMsgPress()" ontouchmove="cancelMsgPress()" oncontextmenu="event.preventDefault();openMsgCtxMenu('${m.id}','${kind}',${mine},${!!m.reported})"`;
  const isVoice=isVoiceUrl(m.image_url);
  const imgHtml=m.image_url?(isVoice?renderVoiceBubble(m,mine,kind):`<div class="msg-img-wrap"><img src="${thumbUrl(m.image_url)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${m.image_url}'" onload="this.classList.add('ready');onMsgImgLoad(this)" onclick="event.stopPropagation();openImgViewer('${m.image_url}')" style="margin-bottom:${m.content?'5px':'0'};"></div>`):'';
  const editedTag=m.edited?`<span style="font-size:11px;opacity:.65;font-weight:400;"> (modifié)</span>`:'';
  const txt=m.content?(linkifyMsg(escapeHtml(m.content),mine)+editedTag):'';
  const sticker=isStickerMsg(m);
  // Dans un groupe, chaque personne a sa couleur : nom et bulle assortis,
  // pour distinguer les interlocuteurs d'un coup d'œil.
  const auteurNom=(kind==='group'&&!mine)?displayName(m.user_id,m.profiles?.username):'';
  const teinte=(kind==='group'&&!mine)?userColor(auteurNom||'?'):'';
  const border=(mine||sticker)?''
    :(teinte?`border:.5px solid color-mix(in srgb,${teinte} 55%,transparent);background:color-mix(in srgb,${teinte} 13%,var(--surf2));`
            :'border:.5px solid color-mix(in srgb,var(--ac) 32%,transparent);');
  const radius=mine?'20px 20px 6px 20px':'20px 20px 20px 6px';
  const skin=sticker?'background:transparent;padding:2px 6px;font-size:52px;line-height:1.1;':'';
  const pinMark=m.pinned?`<div style="font-size:11px;color:${mine?'rgba(255,255,255,.75)':'var(--muted)'};margin-bottom:3px;display:flex;align-items:center;gap:4px;">📌 Épinglé</div>`:'';
  const bubble=`<div ${press} id="msg-${m.id}" onclick="toggleMsgTime('${m.id}')" style="position:relative;max-width:100%;background:${mine?'var(--bubble-mine)':'var(--surf2)'};color:${mine?'#fff':'var(--txt)'};border-radius:${radius};${border}padding:9px 14px;font-size:16px;letter-spacing:-.01em;line-height:1.35;word-break:break-word;white-space:pre-wrap;cursor:pointer;-webkit-user-select:none;user-select:none;transition:box-shadow .3s;${skin}">${pinMark}${quote}${imgHtml}${txt}</div>`;
  // réactions
  const reactions=m.reactions||{};
  const tbl=kind==='dm'?'direct_messages':'group_messages';
  const pills=Object.keys(reactions).filter(e=>(reactions[e]||[]).length>0).map(e=>{
    const users=reactions[e]||[];const reacted=users.includes(U.id);
    return `<button onclick="toggleReaction('${m.id}','${e}','${tbl}')" style="display:inline-flex;align-items:center;gap:3px;font-size:13px;padding:3px 9px;border-radius:14px;background:${reacted?'color-mix(in srgb,var(--ac) 20%,transparent)':'var(--surf2)'};border:none;">${e} <span style="font-size:11px;color:var(--muted);">${users.length}</span></button>`;
  }).join('');
  const pillsRow=pills?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;${mine?'justify-content:flex-end;':''}">${pills}</div>`:'';
  const reportedTag=m.reported?'<div style="font-size:11px;color:#f97316;margin-top:3px;">⚐ signalé</div>':'';
  // nom (groupes, messages reçus, en tête de groupe)
  let nameLbl='';
  if(kind==='group' && !mine && tail){
    nameLbl=`<div style="font-size:12px;font-weight:600;color:${teinte};margin:0 0 3px 12px;">${escapeHtml(auteurNom||'—')}</div>`;
  }
  const hhmm=(()=>{try{return new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}catch(e){return '';}})();
  const timeLine=`<div class="msg-time" id="time-${m.id}" style="display:none;font-size:11px;color:var(--muted);margin:3px 6px 0;${mine?'text-align:right;':'text-align:left;'}">${hhmm}</div>`;
  // « Vu » sous le dernier message envoyé, si les accusés sont actifs des deux côtés
  const seenLine=(kind==='dm'&&mine&&!next&&m.read_at&&receiptsOn())
    ?'<div class="msg-seen">Vu</div>':'';
  // Lien "Voir le fil" sous la bulle RACINE d'une chaîne de réponses
  let threadLink='';
  if(!m.reply_to){
    const replies=(cache||[]).filter(x=>String(x.reply_to)===String(m.id));
    if(replies.length){
      threadLink=`<button onclick="event.stopPropagation();openThreadView('${m.id}','${kind}')" style="display:inline-flex;align-items:center;gap:5px;margin:3px 4px 0;font-size:12.5px;font-weight:600;color:var(--ac);background:none;border:none;padding:2px 4px;cursor:pointer;${mine?'align-self:flex-end;':''}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Voir le fil</button>`;
    }
  }
  return `<div class="msg-row" data-mid="${m.id}" data-kind="${kind}"
      ontouchstart="swipeStart(event,this)" ontouchmove="swipeMove(event,this)" ontouchend="swipeEnd(event,this)"
      style="display:flex;flex-direction:column;align-items:${mine?'flex-end':'flex-start'};max-width:82%;${mine?'align-self:flex-end;':'align-self:flex-start;'}margin-bottom:${tail?'10px':'2px'};">
    ${nameLbl}<div style="max-width:100%;">${bubble}${pillsRow}${reportedTag}${timeLine}${seenLine}</div>${threadLink}
  </div>`;
}
function swipeStart(e,el){
  const t=e.touches[0];
  _sw={x:t.clientX,y:t.clientY,el,active:false};
  el.style.transition='';
}
function swipeMove(e,el){
  if(!_sw.el)return;
  const t=e.touches[0];
  const dx=t.clientX-_sw.x, dy=t.clientY-_sw.y;
  // On n'active que sur un geste franchement horizontal vers la droite
  if(!_sw.active){
    if(Math.abs(dy)>Math.abs(dx)||dx<8)return;
    _sw.active=true;
    cancelMsgPress();          // annule l'appui long en cours
  }
  const d=Math.min(Math.max(dx,0),70);
  el.style.transform='translateX('+d+'px)';
  el.style.setProperty('--swipe',(d/70).toFixed(2));
}
function swipeEnd(e,el){
  if(!_sw.el){return;}
  const wasActive=_sw.active, d=parseFloat(el.style.getPropertyValue('--swipe')||'0');
  el.style.transition='transform .22s cubic-bezier(.32,.72,0,1)';
  el.style.transform='';
  el.style.setProperty('--swipe','0');
  _sw={x:0,y:0,el:null,active:false};
  if(wasActive && d>=0.7){
    if(navigator.vibrate)navigator.vibrate(10);
    startReplyTo(el.dataset.mid,el.dataset.kind);
  }
}
function toggleMsgTime(id){
  // Un appui long vient d'ouvrir le menu : on ignore le click qui suit.
  if(_longPressed){_longPressed=false;return;}
  const el=document.getElementById('time-'+id); if(!el)return;
  const showing=el.style.display!=='none';
  if(showing){ el.style.display='none'; }
  else{
    el.style.display='block';
    el.style.animation='msgTimeIn .2s ease';
  }
}
async function toggleVoiceRec(kind){
  if(_rec){finishVoiceRec();return;}   // déjà en cours → termine (passe en aperçu)
  if(_pendingVoice){toast('Un vocal est déjà prêt — envoie-le ou supprime-le','err');return;}
  const fluxVivant=_recStream&&_recStream.getAudioTracks
    &&_recStream.getAudioTracks().some(t=>t.readyState==='live');
  if(!fluxVivant){
    try{
      _recStream=await navigator.mediaDevices.getUserMedia({audio:true});
    }catch(e){toast('Micro refusé — autorise-le dans les réglages','err');return;}
  }
  const mime=MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4'
            :MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'';
  // 32 kbit/s suffit largement pour la voix et divise le poids du fichier
  _rec=new MediaRecorder(_recStream,mime?{mimeType:mime,audioBitsPerSecond:32000}:{audioBitsPerSecond:32000});
  _recChunks=[];_recKind=kind;_recStart=Date.now();
  _rec.ondataavailable=e=>{if(e.data.size)_recChunks.push(e.data);};
  _rec.start(250);
  // Le contexte de réponse, s'il y en a un, reste visible en compact ;
  // l'écran d'enregistrement, lui, remplace tout le composer en dessous —
  // dès l'appui sur le micro, pas seulement une fois arrêté.
  const bar=document.getElementById(kind==='dm'?'dm-reply-bar':'chat-reply-bar');
  if(bar)bar.innerHTML=replyMiniHtml(kind);
  _showVoiceReview(kind,'recording');
  _startLiveLevel(kind);
  signalVoiceRec(kind,true);
  _recTimerI=setInterval(()=>{
    const s=Math.floor((Date.now()-_recStart)/1000);
    const d=document.getElementById(_vrPrefix(kind)+'-vr-dur');
    if(d)d.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
    if(s>=120)finishVoiceRec();   // 2 min max
  },500);
}
function cancelVoiceRec(){ _stopRec(false); }
function finishVoiceRec(){ _stopRec(true); }
// Un seul bouton pour les deux phases : pendant l'enregistrement il annule
// ou termine, une fois arrêté il jette ou (re)lit l'aperçu.
function _vrTrashTap(){ if(_rec)cancelVoiceRec(); else discardPendingVoice(); }
function _vrMiddleTap(){ if(_rec)finishVoiceRec(); else togglePreviewVoice(); }
// Le composer groupe utilise le préfixe "chat", pas "group", pour rester
// cohérent avec ses ids existants (chat-input, chat-mic-btn, etc.).
function _vrPrefix(kind){ return kind==='dm'?'dm':'chat'; }
function _vrScreen(kind){ return kind==='dm'?'#fs-dm':'#fs-group-chat'; }
const _VR_PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const _VR_PAUSE='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const _VR_STOP='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
// Affiche l'écran plein composer, dans l'une de ses deux phases : en train
// d'enregistrer (pas encore d'envoi possible) ou en relecture (spectre figé,
// envoi possible).
function _showVoiceReview(kind,phase){
  const pfx=_vrPrefix(kind);
  const foot=document.querySelector(_vrScreen(kind)+' .fsmsg-foot');
  const panel=document.getElementById(pfx+'-voice-review');
  if(foot)foot.style.display='none';
  if(panel)panel.style.display='flex';
  const sendBtn=document.getElementById(pfx+'-vr-send');
  const midBtn=document.getElementById(pfx+'-vr-play');
  if(phase==='recording'){
    // visibility (pas display) : garde la place du bouton d'envoi occupée,
    // sinon les deux boutons restants se collent chacun à un bord au lieu
    // de laisser celui du milieu vraiment centré.
    if(sendBtn)sendBtn.style.visibility='hidden';
    if(midBtn)midBtn.innerHTML=_VR_STOP;
    const d=document.getElementById(pfx+'-vr-dur');if(d)d.textContent='0:00';
    const w=document.getElementById(pfx+'-vr-wave');if(w)w.innerHTML='';
  }else{
    if(sendBtn)sendBtn.style.visibility='visible';
    if(midBtn)midBtn.innerHTML=_VR_PLAY;
  }
}
// Vu-mètre réel, pas décoratif : lit le micro en direct (Web Audio sur le
// flux d'enregistrement lui-même) et fait glisser les niveaux vers la
// gauche, comme un vrai enregistreur.
let _recAnalyser=null,_recAnalyserCtx=null,_recLevelRaf=null;
function _startLiveLevel(kind){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx||!_recStream)return;
    _recAnalyserCtx=new AudioCtx();
    const src=_recAnalyserCtx.createMediaStreamSource(_recStream);
    _recAnalyser=_recAnalyserCtx.createAnalyser();
    _recAnalyser.fftSize=256;
    src.connect(_recAnalyser);
    const data=new Uint8Array(_recAnalyser.frequencyBinCount);
    const niveaux=new Array(_WAVE_NBARS).fill(.14);
    const wave=document.getElementById(_vrPrefix(kind)+'-vr-wave');
    // Les barres sont créées UNE fois ; ensuite on ne touche plus qu'à leur
    // hauteur. Les reconstruire en entier à chaque frame (comme avant, à
    // 60 im/s) surchargeait le fil principal au point de rendre les
    // boutons mous à réagir au tap — ce n'était pas un souci de câblage.
    if(wave)wave.innerHTML=niveaux.map(()=>'<i style="background:var(--red);"></i>').join('');
    const bars=wave?[...wave.children]:[];
    // Une dizaine d'images par seconde suffit largement à l'œil pour un
    // vu-mètre, et coûte bien moins cher qu'un vrai 60 fps.
    _recLevelRaf=setInterval(()=>{
      if(!_rec){_stopLiveLevel();return;}
      _recAnalyser.getByteTimeDomainData(data);
      let somme=0;
      for(let i=0;i<data.length;i++)somme+=Math.abs((data[i]-128)/128);
      const niveau=Math.max(.14,Math.min(1,(somme/data.length)*4));
      niveaux.shift();niveaux.push(niveau);
      for(let i=0;i<bars.length;i++)bars[i].style.height=Math.round(niveaux[i]*100)+'%';
    },70);
  }catch(e){}
}
function _stopLiveLevel(){
  clearInterval(_recLevelRaf);_recLevelRaf=null;
  try{if(_recAnalyserCtx)_recAnalyserCtx.close();}catch(e){}
  _recAnalyser=null;_recAnalyserCtx=null;
}
// Écran de relecture après l'enregistrement : le même écran reste affiché,
// il bascule juste de la phase "enregistrement" à la phase "relecture".
async function renderVoiceReview(kind,dur,blob){
  _stopLiveLevel();
  _showVoiceReview(kind,'review');
  const pfx=_vrPrefix(kind);
  const durEl=document.getElementById(pfx+'-vr-dur');
  if(durEl)durEl.textContent=fmtDur(dur);
  const peaks=await computeWaveform(blob,_WAVE_NBARS).catch(()=>null);
  if(_pendingVoice)_pendingVoice.waveform=peaks; // évite de le recalculer à l'envoi
  const waveEl=document.getElementById(pfx+'-vr-wave');
  if(waveEl)waveEl.innerHTML=(peaks||new Array(_WAVE_NBARS).fill(.32)).map(p=>
    `<i style="height:${Math.round(Math.max(14,Math.min(100,p*100)))}%"></i>`
  ).join('');
}
// Rend la main au composer normal, que le vocal ait été envoyé, jeté, ou
// l'enregistrement annulé avant même d'être arrêté.
function _restoreComposer(kind){
  _stopLiveLevel();
  const foot=document.querySelector(_vrScreen(kind)+' .fsmsg-foot');
  const panel=document.getElementById(_vrPrefix(kind)+'-voice-review');
  if(panel)panel.style.display='none';
  if(foot)foot.style.display='flex';
  restoreReplyBar(kind);
}
let _pvRaf=null;
function togglePreviewVoice(){
  if(!_pendingVoice)return;
  const btn=document.getElementById(_vrPrefix(_pendingVoice.kind)+'-vr-play');
  if(_pvAudio&&!_pvAudio.paused){_pvAudio.pause();if(btn)btn.innerHTML=_VR_PLAY;cancelAnimationFrame(_pvRaf);return;}
  if(!_pvAudio){_pvAudio=new Audio(_pendingVoice.url);
    _pvAudio.onended=()=>{
      const b=document.getElementById(_vrPrefix(_pendingVoice.kind)+'-vr-play');
      if(b)b.innerHTML=_VR_PLAY;
      _pvPaint(0);cancelAnimationFrame(_pvRaf);
    };}
  _pvAudio.play();if(btn)btn.innerHTML=_VR_PAUSE;
  _pvTick();
}
function _pvTick(){
  if(!_pvAudio||_pvAudio.paused||!_pendingVoice)return;
  if(_pvAudio.duration)_pvPaint(_pvAudio.currentTime/_pvAudio.duration);
  _pvRaf=requestAnimationFrame(_pvTick);
}
function _pvPaint(pct){
  if(!_pendingVoice)return;
  const wave=document.getElementById(_vrPrefix(_pendingVoice.kind)+'-vr-wave');
  if(!wave)return;
  const bars=wave.children,filled=Math.round(pct*bars.length);
  for(let i=0;i<bars.length;i++)bars[i].style.background=i<filled?'var(--ac)':'var(--bdr)';
}
function discardPendingVoice(){
  if(_pvAudio){_pvAudio.pause();_pvAudio=null;}
  cancelAnimationFrame(_pvRaf);
  if(_pendingVoice){
    const kind=_pendingVoice.kind;
    URL.revokeObjectURL(_pendingVoice.url);
    _pendingVoice=null;
    _restoreComposer(kind);
  }
}
// Calcule le spectre une seule fois, sur l'appareil de l'expéditeur, à partir
// du son réellement enregistré (pas décoratif). Tout le monde lira ensuite
// ce même tableau depuis le message : jamais recalculé à chaque lecture.
async function computeWaveform(blob,nBars){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return null;
    const buf=await blob.arrayBuffer();
    const ctx=new AudioCtx();
    const audioBuf=await ctx.decodeAudioData(buf);
    const data=audioBuf.getChannelData(0);
    const block=Math.max(1,Math.floor(data.length/nBars));
    const peaks=[];
    for(let i=0;i<nBars;i++){
      let sum=0,start=i*block;
      for(let j=0;j<block;j++)sum+=Math.abs(data[start+j]||0);
      peaks.push(sum/block);
    }
    ctx.close();
    const max=Math.max(...peaks)||1;
    // Arrondi à 2 décimales : suffisant à l'œil, réduit la taille stockée.
    return peaks.map(p=>Math.round(Math.min(1,p/max)*100)/100);
  }catch(e){ return null; } // pas bloquant : le vocal part quand même, sans spectre
}
async function sendPendingVoice(){
  if(!_pendingVoice)return;
  const{blob,mime,kind,dur}=_pendingVoice;
  if(_pvAudio){_pvAudio.pause();_pvAudio=null;}
  const ext=/mp4/.test(mime)?'m4a':/webm/.test(mime)?'webm':'audio';
  toast('Envoi du vocal…','ok');
  try{
    const path='voice/'+U.id+'_'+Date.now()+'.'+ext;
    const[upRes,peaks]=await Promise.all([
      sb.storage.from('chat-photos').upload(path,blob,{upsert:true,contentType:mime,cacheControl:'31536000'}),
      _pendingVoice.waveform?Promise.resolve(_pendingVoice.waveform):computeWaveform(blob,_WAVE_NBARS)
    ]);
    if(upRes.error)throw upRes.error;
    const{data}=sb.storage.from('chat-photos').getPublicUrl(path);
    const table=kind==='dm'?'direct_messages':'group_messages';
    let row=kind==='dm'
      ? {sender_id:U.id,receiver_id:_dmPartnerId,content:null,image_url:data.publicUrl}
      : {group_id:_chatGroupId,user_id:U.id,content:null,type:'text',image_url:data.publicUrl};
    // Un vocal peut repondre a un message, exactement comme un texte.
    if(_replyingTo&&_replyingTo.kind===kind)row.reply_to=_replyingTo.id;
    if(peaks)row.waveform=peaks;
    // Durée stockée en secondes : sert à afficher "🎙 Audio · 0:08" dans les
    // citations de réponse, sans avoir à charger le fichier pour le savoir.
    if(dur)row.duration=Math.round(dur);
    let ins=await sb.from(table).insert(row);
    // Dégradé progressif : ces colonnes peuvent ne pas exister encore
    // (SQL pas encore passé) — on retire ce qui bloque, un champ à la fois.
    if(ins.error&&row.waveform){row={...row};delete row.waveform;ins=await sb.from(table).insert(row);}
    if(ins.error&&row.duration){row={...row};delete row.duration;ins=await sb.from(table).insert(row);}
    if(ins.error&&row.reply_to){row={...row};delete row.reply_to;ins=await sb.from(table).insert(row);}
    if(ins.error)throw ins.error;
    _replyingTo=null;
    if(kind==='dm'){setLastSeen('dm:'+_dmPartnerId);await loadDM();}
    else await loadGroupMessages();
    discardPendingVoice();
  }catch(e){toast('Erreur vocal : '+(e.message||e),'err');}
}
// ── Lecture des vocaux : vitesse, glisser pour naviguer, vrai spectre ──
// Un seul réglage de vitesse pour toute l'app, comme WhatsApp : pas besoin
// de la refaire à chaque vocal. Mémorisé pour survivre à une fermeture.
const _V_SPEEDS=[0.5,1,1.5,2,2.5];
const _WAVE_NBARS=40;
let _vSpeedIdx=(()=>{const i=parseInt(localStorage.getItem('kf-voice-speed'));return(i>=0&&i<_V_SPEEDS.length)?i:1;})();
let _vChainKind=null; // 'dm' ou 'group' : la conversation où chercher le prochain vocal à enchaîner
function _vSpeedLabel(i){const s=_V_SPEEDS[i];return(s===1?'1':String(s).replace('.',','))+'×';}
function _voiceEls(id){
  return{
    btn:document.getElementById('vp-btn-'+id),
    track:document.getElementById('vp-track-'+id),
    dur:document.getElementById('vp-dur-'+id),
    speed:document.getElementById('vp-speed-'+id)
  };
}
// Bascule le coin droit entre durée (à l'arrêt) et vitesse (en lecture) :
// pas besoin des deux info à la fois, et ça évite de répéter la durée
// une fois sous le spectre, une fois dans la pastille.
function _vShowDur(id){
  const{dur,speed}=_voiceEls(id);
  if(dur)dur.style.display='';
  if(speed)speed.style.display='none';
}
function _vShowSpeed(id){
  const{dur,speed}=_voiceEls(id);
  if(dur)dur.style.display='none';
  if(speed)speed.style.display='';
}
// Peint la progression directement sur les barres du spectre, plutôt que sur
// une barre de remplissage séparée : chaque barre déjà « passée » prend la
// couleur pleine, les autres restent dans leur couleur de fond.
function _vPaintProgress(id,pct){
  const{track}=_voiceEls(id);
  if(!track)return;
  const base=track.dataset.base,done=track.dataset.done;
  const bars=track.children;
  const filled=Math.round(pct*bars.length);
  for(let i=0;i<bars.length;i++)bars[i].style.background=i<filled?done:base;
}
// Prépare (sans forcément jouer) l'Audio pour cet id. Rejouer ce même id
// réutilise l'instance en cours plutôt que d'en recréer une, ce qui garde
// la position et permet au bouton de vraiment alterner lecture/pause.
function ensureVoiceAudio(id,url,kind){
  if(_vPlayingId===id&&_vAudio)return _vAudio;
  if(_vAudio){_vAudio.pause();_vAudio=null;}
  cancelAnimationFrame(_vRaf);
  _vAudio=new Audio(url);
  _vAudio.playbackRate=_V_SPEEDS[_vSpeedIdx];
  _vPlayingId=id;
  // Retenu pour savoir, une fois ce vocal terminé, dans quelle conversation
  // chercher le suivant à enchaîner (kind reste celui du tout premier appel
  // si un maillon intermédiaire ne le repasse pas explicitement).
  if(kind)_vChainKind=kind;
  _vAudio.onplay=()=>{const b=_voiceEls(id).btn;if(b)b.textContent='❚❚';_vShowSpeed(id);_vTick(id);};
  _vAudio.onpause=()=>{const b=_voiceEls(id).btn;if(b)b.textContent='▶';_vShowDur(id);cancelAnimationFrame(_vRaf);};
  _vAudio.onended=()=>{
    const{btn}=_voiceEls(id);
    if(btn)btn.textContent='▶';_vPaintProgress(id,0);
    _vShowDur(id);_vPlayingId=null;cancelAnimationFrame(_vRaf);
    // Enchaînement : le prochain vocal de la même conversation démarre tout
    // seul, annoncé par un petit son plutôt qu'un silence abrupt.
    const suivant=_nextVoiceMsg(id,_vChainKind);
    if(suivant){
      _voiceChainChime();
      setTimeout(()=>{
        const a=ensureVoiceAudio(suivant.id,suivant.image_url,_vChainKind);
        a.play().catch(()=>{
          // Si la lecture auto est refusée pour une raison quelconque, on
          // revient à l'état arrêté plutôt que de rester bloqué en silence
          // sans recours : un tap manuel reste toujours possible.
          _vShowDur(suivant.id);_vPlayingId=null;
        });
        try{document.getElementById('vp-track-'+suivant.id)?.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){}
      },260);
    }
  };
  _vAudio.onloadedmetadata=()=>setVoiceDur(id,_vAudio.duration);
  return _vAudio;
}
// Le prochain vocal, dans l'ordre chronologique, de la même conversation.
function _nextVoiceMsg(id,kind){
  const cache=kind==='dm'?_dmCache:_groupCache;
  if(!cache)return null;
  const idx=cache.findIndex(x=>String(x.id)===String(id));
  if(idx<0)return null;
  for(let i=idx+1;i<cache.length;i++){
    if(isVoiceUrl(cache[i].image_url))return cache[i];
  }
  return null;
}
// Petit carillon montant, discret : annonce le passage au vocal suivant.
// Volontairement isolé de _getAudioCtx()/seance.js (le chrono de repos) :
// manipuler la session audio "ambient" pendant qu'un <audio> de vocal est
// en train d'enchaîner rendait tout muet jusqu'à fermeture complète de
// l'app, deux mécanismes audio différents se marchant dessus. Un simple
// <audio> isolé, comme les vocaux eux-mêmes, ne touche à rien de partagé.
const _VOICE_CHIME_SRC='data:audio/wav;base64,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';
let _voiceChimeAudio=null;
function _voiceChainChime(){
  try{
    if(!_voiceChimeAudio)_voiceChimeAudio=new Audio(_VOICE_CHIME_SRC);
    _voiceChimeAudio.currentTime=0;
    _voiceChimeAudio.volume=.5;
    _voiceChimeAudio.play().catch(()=>{});
  }catch(e){}
}
function _vTick(id){
  if(_vAudio.duration)_vPaintProgress(id,_vAudio.currentTime/_vAudio.duration);
  _vRaf=requestAnimationFrame(()=>_vTick(id));
}
function toggleVoicePlay(id,url,kind){
  const a=ensureVoiceAudio(id,url,kind);
  // La décision se base sur l'état RÉEL de la lecture, pas sur « est-ce le
  // même id qu'avant » : c'est ça qui manquait pour pouvoir reprendre après
  // une pause au lieu de rester bloqué.
  if(a.paused)a.play().catch(()=>toast('Lecture impossible','err'));
  else a.pause();
}
function cycleVoiceSpeed(id,url,e){
  e.stopPropagation();
  ensureVoiceAudio(id,url); // charge le vocal si on touche la vitesse avant play
  _vSpeedIdx=(_vSpeedIdx+1)%_V_SPEEDS.length;
  localStorage.setItem('kf-voice-speed',String(_vSpeedIdx));
  if(_vAudio)_vAudio.playbackRate=_V_SPEEDS[_vSpeedIdx];
  // Réglage global : toutes les pastilles visibles à l'écran suivent, pas
  // seulement celle qu'on vient de toucher.
  document.querySelectorAll('[id^="vp-speed-"]').forEach(b=>{
    b.textContent=_vSpeedLabel(_vSpeedIdx);
    b.style.opacity=_vSpeedIdx!==1?'1':'.75';
  });
}
// Glisser sur le spectre pour avancer/reculer. On coupe le son pendant le
// geste (sinon ça défile de façon incompréhensible) et on reprend en
// relâchant, seulement si le vocal jouait déjà.
function voiceSeekStart(id,url,e){
  e.stopPropagation();
  const a=ensureVoiceAudio(id,url);
  e.currentTarget.setPointerCapture(e.pointerId);
  a._reprendre=!a.paused;
  if(a._reprendre)a.pause();
  voiceSeekMove(id,e);
}
function voiceSeekMove(id,e){
  if(_vPlayingId!==id||!_vAudio)return;
  const{track}=_voiceEls(id);
  if(!track||!track.hasPointerCapture(e.pointerId))return;
  const r=track.getBoundingClientRect();
  const pct=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
  if(_vAudio.duration)_vAudio.currentTime=pct*_vAudio.duration;
  _vPaintProgress(id,pct);
}
function voiceSeekEnd(id,e){
  const track=document.getElementById('vp-track-'+id);
  if(track&&track.hasPointerCapture(e.pointerId))track.releasePointerCapture(e.pointerId);
  if(_vPlayingId===id&&_vAudio&&_vAudio._reprendre)_vAudio.play().catch(()=>{});
  if(_vAudio)_vAudio._reprendre=false;
}
function setVoiceDur(id,d){
  const el=document.getElementById('vp-dur-'+id);
  if(el&&isFinite(d)&&d>0)el.textContent=fmtDur(d);
}
// Le spectre vient du message (calculé une seule fois par l'expéditeur, voir
// computeWaveform). Un vocal envoyé avant cette version n'en a pas : on
// affiche alors des barres neutres plutôt qu'un faux spectre inventé.
function _waveBars(m){
  if(Array.isArray(m.waveform)&&m.waveform.length)return m.waveform;
  return new Array(_WAVE_NBARS).fill(.32);
}
function renderVoiceBubble(m,mine,kind){
  const fg=mine?'#fff':'var(--txt)';
  const base=mine?'rgba(255,255,255,.3)':'var(--bdr)';
  const done=mine?'#fff':'var(--ac2)';
  const id=m.id, url=m.image_url;
  const bars=_waveBars(m).map(p=>{
    const h=Math.round(Math.max(14,Math.min(100,p*100)));
    return `<i style="flex:1;min-width:2.5px;height:${h}%;border-radius:2px;background:${base};transition:background .1s;"></i>`;
  }).join('');
  const ptr=`onpointerdown="voiceSeekStart('${id}','${url}',event)" onpointermove="voiceSeekMove('${id}',event)" onpointerup="voiceSeekEnd('${id}',event)" onpointercancel="voiceSeekEnd('${id}',event)" ontouchstart="event.stopPropagation()" ontouchmove="event.stopPropagation()" ontouchend="event.stopPropagation()"`;
  return `<div style="display:flex;align-items:center;gap:9px;min-width:190px;padding:2px 0;">
    <button id="vp-btn-${id}" onclick="event.stopPropagation();toggleVoicePlay('${id}','${url}','${kind}')" style="width:38px;height:38px;border-radius:50%;background:${mine?'rgba(255,255,255,.2)':'color-mix(in srgb,var(--ac) 20%,transparent)'};border:none;color:${fg};font-size:13px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">▶</button>
    <div id="vp-track-${id}" data-base="${base}" data-done="${done}" ${ptr} style="flex:1;min-width:0;height:24px;display:flex;align-items:center;gap:2px;touch-action:none;-webkit-user-select:none;user-select:none;cursor:grab;">${bars}</div>
    <span id="vp-dur-${id}" style="flex-shrink:0;width:36px;box-sizing:border-box;text-align:center;font-size:11.5px;font-weight:500;font-variant-numeric:tabular-nums;color:${mine?'rgba(255,255,255,.8)':'var(--muted)'};">0:00</span>
    <button id="vp-speed-${id}" onclick="cycleVoiceSpeed('${id}','${url}',event)" style="display:none;flex-shrink:0;width:36px;box-sizing:border-box;padding:5px 0;text-align:center;border-radius:10px;border:none;background:${mine?'rgba(255,255,255,.2)':'var(--surf)'};color:${fg};font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;">${_vSpeedLabel(_vSpeedIdx)}</button>
    <audio src="${url}" preload="metadata" onloadedmetadata="setVoiceDur('${id}',this.duration)" style="display:none;"></audio>
  </div>`;
}
function openImgViewer(url){
  let v=document.getElementById('img-viewer');
  if(!v){ // secours si le HTML servi est une version en cache sans la visionneuse
    v=document.createElement('div');v.id='img-viewer';v.onclick=closeImgViewer;
    v.innerHTML='<button class="iv-close" onclick="event.stopPropagation();closeImgViewer()">✕</button><img id="img-viewer-src" onclick="event.stopPropagation()" alt="">';
    document.body.appendChild(v);
  }
  const i=document.getElementById('img-viewer-src');
  if(i)i.src=url;
  v.classList.add('on');
  return false;
}
function closeImgViewer(){
  const v=document.getElementById('img-viewer');
  if(v){v.classList.remove('on');const i=document.getElementById('img-viewer-src');if(i)i.src='';}
}
function buildThreadHtml(msgs,kind,unreadSince){
  const mine=(m)=>kind==='dm'?(m.sender_id===U.id):(m.user_id===U.id);
  let firstUnread=-1,count=0;
  if(unreadSince){
    msgs.forEach((m,i)=>{
      if(!mine(m) && m.created_at>unreadSince){ if(firstUnread<0)firstUnread=i; count++; }
    });
  }
  let html='';
  msgs.forEach((m,i)=>{
    if(i===firstUnread){
      html+=`<div class="unread-sep"><span>${count} message${count>1?'s':''} non lu${count>1?'s':''}</span></div>`;
    }
    html+=renderMsgRow(m,msgs[i+1],kind);
  });
  return html;
}
function appendMsgLocal(m,kind){
  const cache=kind==='dm'?_dmCache:_groupCache;
  if(!cache||!m||!m.id)return false;
  if(cache.some(x=>String(x.id)===String(m.id)))return true;   // déjà affiché
  cache.push(m);
  cache.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const box=document.getElementById(kind==='dm'?'dm-messages':'chat-messages');
  if(!box)return true;
  // Si l'utilisateur lit plus haut, on ne le ramène pas de force en bas :
  // on garde sa position et on lui signale les nouveaux messages.
  const etaitEnBas=estEnBas(box);
  const avant=box.scrollTop;
  box.innerHTML=buildThreadHtml(cache,kind,kind==='dm'?_dmUnreadSince:_groupUnreadSince);
  const mien=(kind==='dm')?(m.sender_id===U.id):(m.user_id===U.id);
  if(etaitEnBas||mien){ scrollMsgBox(box); }
  else{ box.scrollTop=avant; _nonLusEnBas[kind]++; }
  majBoutonBas(kind);
  return true;
}
function nickOf(uid){ return (ST.nicknames&&ST.nicknames[uid])||null; }
function openRenameFriend(){
  if(!_dmPartnerId)return;
  closeDMOptions();
  const inp=document.getElementById('nick-input');
  document.getElementById('nick-real').textContent='@'+(_dmPartnerName||'');
  inp.value=nickOf(_dmPartnerId)||'';
  inp.placeholder=_dmPartnerName||'Surnom';
  document.getElementById('modal-nickname').classList.add('on');
  setTimeout(()=>inp.focus(),250);
}
function closeRenameFriend(){document.getElementById('modal-nickname').classList.remove('on');}
function saveNickname(){
  const v=document.getElementById('nick-input').value.trim();
  if(!ST.nicknames)ST.nicknames={};
  if(v)ST.nicknames[_dmPartnerId]=v.slice(0,30);
  else delete ST.nicknames[_dmPartnerId];
  saveState();
  document.getElementById('dm-name').textContent=displayName(_dmPartnerId,_dmPartnerName);
  renderDMPresence();
  closeRenameFriend();
  try{loadInbox();}catch(e){}
  toast(v?'Surnom enregistré':'Surnom retiré','ok');
}
async function markDmRead(){
  if(!_dmPartnerId||!receiptsOn())return;
  try{
    await sb.from('direct_messages').update({read_at:new Date().toISOString()})
      .eq('receiver_id',U.id).eq('sender_id',_dmPartnerId).is('read_at',null);
  }catch(e){}   // colonne absente : on ignore, rien ne casse
}
async function loadOlderMessages(kind){
  if(_loadingOlder||_noMoreOlder)return;
  const cache=kind==='dm'?_dmCache:_groupCache;
  if(!cache||!cache.length)return;
  const box=document.getElementById(kind==='dm'?'dm-messages':'chat-messages');
  if(!box)return;
  _loadingOlder=true;
  const beforeH=box.scrollHeight, oldest=cache[0].created_at;
  try{
    let q;
    if(kind==='dm'){
      q=sb.from('direct_messages').select('*')
        .or(`and(sender_id.eq.${U.id},receiver_id.eq.${_dmPartnerId}),and(sender_id.eq.${_dmPartnerId},receiver_id.eq.${U.id})`);
    }else{
      q=sb.from('group_messages').select('*').eq('group_id',_chatGroupId);
    }
    const{data:raw}=await q.lt('created_at',oldest).order('created_at',{ascending:false}).limit(50);
    let older=(raw||[]).slice().reverse();
    older=afterClear(older,kind==='dm'?('dm:'+_dmPartnerId):('g:'+_chatGroupId));
    if(!older.length){_noMoreOlder=true;_loadingOlder=false;return;}
    if(kind==='group'){
      for(const m of older) m.profiles=await ensureProfile(m.user_id);
    }
    cache.unshift(...older);
    box.innerHTML=buildThreadHtml(cache,kind,kind==='dm'?_dmUnreadSince:_groupUnreadSince);
    // On replace la vue exactement où elle était, pour ne pas désorienter
    box.scrollTop=box.scrollHeight-beforeH;
  }catch(e){}
  _loadingOlder=false;
}
function attachOlderLoader(kind){
  const box=document.getElementById(kind==='dm'?'dm-messages':'chat-messages');
  if(!box||box.dataset.older)return;
  box.dataset.older='1';
  box.addEventListener('scroll',()=>{ if(box.scrollTop<80)loadOlderMessages(kind); },{passive:true});
}
function openStickerPicker(){
  closePlusSheet();
  const g=document.getElementById('sticker-grid');
  g.innerHTML=STICKERS.map(e=>`<button onclick="sendSticker('${e}')">${e}</button>`).join('');
  document.getElementById('sticker-sheet').style.display='flex';
}
function closeStickerPicker(){document.getElementById('sticker-sheet').style.display='none';}
function sendSticker(emoji){
  closeStickerPicker();
  const input=document.getElementById(_plusKind==='dm'?'dm-input':'chat-input');
  if(!input)return;
  const keep=input.value;
  input.value=emoji;
  if(_plusKind==='dm')sendDM(); else sendGroupMessage();
  // On ne perd pas ce qui était en cours de rédaction
  setTimeout(()=>{ if(keep){input.value=keep;autoGrowInput(input);} },60);
}
function linkifyMsg(safe,mine){
  return safe.replace(/(https?:\/\/[^\s]+)/g,(u)=>`<a href="${u}" target="_blank" onclick="event.stopPropagation()" style="color:${mine?'#fff':'var(--ac)'};text-decoration:underline;text-underline-offset:2px;font-weight:600;">${u}</a>`);
}
function scrollMsgBox(box){
  if(!box)return;
  const toBottom=()=>{box.scrollTop=box.scrollHeight;};
  toBottom();
  requestAnimationFrame(()=>{toBottom();requestAnimationFrame(toBottom);});
}
function onMsgImgLoad(img){
  const box=img.closest('.fsmsg-body'); if(!box)return;
  // Avec des images à hauteur fixe (200px), le layout ne bouge plus après
  // chargement : on ne recolle en bas que si l'utilisateur y était déjà,
  // et instantanément (jamais d'animation qui renvoie vers l'image).
  if(box.scrollHeight-box.scrollTop-box.clientHeight<120) box.scrollTop=box.scrollHeight;
}
function jumpToMsg(id){
  const el=document.getElementById('msg-'+id); if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.style.boxShadow='0 0 0 3px color-mix(in srgb,var(--ac) 55%,transparent)';
  setTimeout(()=>{el.style.boxShadow='';},900);
}
async function sendDM(){
  const input=document.getElementById('dm-input');
  const content=input.value.trim();
  const pendPhoto=(_pendingPhoto&&_pendingPhoto.kind==='dm')?_pendingPhoto:null;
  const pendVoice=(_pendingVoice&&_pendingVoice.kind==='dm')?_pendingVoice:null;
  if(!content&&!pendPhoto&&!pendVoice)return;
  if(!_dmPartnerId)return;
  // Mode édition : on met à jour le message au lieu d'en créer un
  if(_editingMsg&&_editingMsg.kind==='dm'){
    const id=_editingMsg.id;
    input.value='';autoGrowInput(input);
    const error=await applyMsgEdit('direct_messages',id,content);
    if(error){toast('Erreur : '+error.message,'err');input.value=content;return;}
    cancelEditMsg('dm');
    await loadDM();return;
  }
  input.value='';autoGrowInput(input);
  // Vocal en attente : on l'envoie (le texte part en message séparé s'il y en a)
  if(pendVoice){await sendPendingVoice();}
  let imageUrl=null;
  if(pendPhoto){
    toast('Envoi de la photo…','ok');
    try{imageUrl=await uploadPendingPhoto();}catch(e){toast('Erreur photo : '+(e.message||e),'err');input.value=content;return;}
    cancelPendingPhoto('dm');
  }
  if(!content&&!imageUrl)return;
  const row={sender_id:U.id,receiver_id:_dmPartnerId,content:content||null};
  if(imageUrl)row.image_url=imageUrl;
  if(_replyingTo)row.reply_to=_replyingTo.id;
  try{
    let ins=await sb.from('direct_messages').insert(row).select().single();
    // Dégradé : si la colonne reply_to n'existe pas encore en base, on réessaie sans.
    if(ins.error && row.reply_to){delete row.reply_to;ins=await sb.from('direct_messages').insert(row).select().single();}
    if(ins.error){toast('Erreur : '+ins.error.message,'err');input.value=content;return;}
    cancelReplyDM();
    setLastSeen('dm:'+_dmPartnerId);
    _dmUnreadSince=null;   // on vient de répondre : le séparateur n'a plus lieu d'être
    // Affiché tout de suite depuis le cache, sans recharger la conversation
    if(!appendMsgLocal(ins.data,'dm'))await loadDM();
  }catch(e){toast('Erreur','err');input.value=content;}
}
// Un seul générateur pour les trois endroits qui résument une pièce jointe :
// la citation dans une bulle, la barre "Répondre à", et le mini-résumé
// au-dessus du composer. Un seul texte à changer, jamais trois à recaler.
function pieceJointeLabel(url){
  if(isVoiceUrl(url))return 'Pièce jointe : 1 Audio';
  if(isGifUrl(url))return 'Pièce jointe : 1 GIF';
  return 'Pièce jointe : 1 Photo';
}
// Version "on sait à quoi on répond" : la durée pour un vocal, une vignette
// pour une photo ou un GIF, plutôt que le texte générique ci-dessus. Utilisée
// uniquement dans les trois citations de réponse — la liste des conversations
// garde le texte court.
function pieceJointeApercu(m){
  const url=m.image_url;
  if(isVoiceUrl(url)){
    const d=(typeof m.duration==='number'&&m.duration>0)?fmtDur(m.duration):'';
    return `🎙 Audio${d?' · '+d:''}`;
  }
  const src=isGifUrl(url)?url:thumbUrl(url);
  return `<img src="${src}" style="width:22px;height:22px;object-fit:cover;border-radius:5px;vertical-align:middle;margin-right:5px;flex-shrink:0;">${isGifUrl(url)?'GIF':'Photo'}`;
}
function startReplyTo(id,kind){
  const cache=kind==='dm'?_dmCache:_groupCache;
  const m=(cache||[]).find(x=>String(x.id)===String(id)); if(!m)return;
  _replyingTo={id,kind};
  const mine=(kind==='dm')?(m.sender_id===U.id):(m.user_id===U.id);
  const who=mine?'toi-même':((kind==='group'?m.profiles?.username:_dmPartnerName)||'—');
  const preview=m.image_url?pieceJointeApercu(m):escapeHtml((m.content||'').slice(0,90));
  const barId=kind==='dm'?'dm-reply-bar':'chat-reply-bar';
  const el=document.getElementById(barId); if(!el)return;
  el.innerHTML=`<div class="msg-replybar"><div class="rb-txt"><b>Répondre à ${escapeHtml(who)}</b><span>${preview}</span></div><button onclick="${kind==='dm'?'cancelReplyDM()':'cancelReplyChat()'}">✕</button></div>`;
  const input=document.getElementById(kind==='dm'?'dm-input':'chat-input'); if(input)input.focus();
}
// La barre au-dessus du composer sert a la fois a la reponse, a l'apercu photo
// et a l'apercu vocal. Ces deux aides gardent la reponse visible pendant un
// enregistrement, et la remettent en place si l'apercu est abandonne.
function replyMiniHtml(kind){
  if(!_replyingTo||_replyingTo.kind!==kind)return '';
  const cache=kind==='dm'?_dmCache:_groupCache;
  const m=(cache||[]).find(x=>String(x.id)===String(_replyingTo.id));
  if(!m)return '';
  const mine=(kind==='dm')?(m.sender_id===U.id):(m.user_id===U.id);
  const who=mine?'toi-même':((kind==='group'?m.profiles?.username:_dmPartnerName)||'—');
  const apercu=m.image_url?pieceJointeApercu(m)
                          :escapeHtml((m.content||'').slice(0,60));
  return `<div class="rb-mini">En réponse à <b>${escapeHtml(who)}</b> · ${apercu}</div>`;
}
function restoreReplyBar(kind){
  const el=document.getElementById(kind==='dm'?'dm-reply-bar':'chat-reply-bar');
  if(el)el.innerHTML='';
  if(_replyingTo&&_replyingTo.kind===kind)startReplyTo(_replyingTo.id,kind);
}
function cancelReplyDM(){_replyingTo=null;const el=document.getElementById('dm-reply-bar');if(el)el.innerHTML='';}
function cancelReplyChat(){_replyingTo=null;const el=document.getElementById('chat-reply-bar');if(el)el.innerHTML='';}
async function deleteDM(id){
  try{
    // Récupérer l'éventuelle image pour la supprimer du storage aussi
    let imgUrl=null;
    try{const{data}=await sb.from('direct_messages').select('image_url').eq('id',id).single();imgUrl=data?.image_url;}catch(e){}
    await sb.from('direct_messages').delete().eq('id',id);
    supprimerFichierMessage(imgUrl);   // fichier ET vignette
    await loadDM();
  }catch(e){toast('Erreur','err');}
}
function sendDMPhoto(input){ const f=input.files[0];input.value='';if(f)stageFile(f,'dm'); }
function sendChatPhoto(input){ const f=input.files[0];input.value='';if(f)stageFile(f,'group'); }
function stageFile(file,kind){
  if(!file)return;
  // Vidéos refusées : elles satureraient le stockage.
  if(/^video\//.test(file.type)){toast('Les vidéos ne sont pas supportées','err');return;}
  const isGif=/gif/i.test(file.type);
  // Un GIF n'est pas recompressé (sinon il perd son animation) → on plafonne sa taille.
  if(isGif && file.size>6*1024*1024){toast('GIF trop lourd (max 6 Mo)','err');return;}
  if(!isGif && !/^image\//.test(file.type)){toast('Format non supporté','err');return;}
  if(_pendingPhoto)URL.revokeObjectURL(_pendingPhoto.url);
  _pendingPhoto={file,kind,isGif,url:URL.createObjectURL(file)};
  _renderPendingPhotoBar(kind,isGif?'GIF prêt':'Photo prête');
}
// ── Coller un GIF depuis le clavier ────────────────────────────────
// Sur iOS, aucune app tierce — web ou native — ne reçoit un GIF inséré
// directement comme dans Messages : c'est réservé à l'app Messages elle-
// même. Un clavier GIF (natif ou Tenor/Giphy) copie le GIF dans le
// presse-papier au tap, à coller ensuite dans le champ visé. C'est cette
// étape de collage qu'on intercepte ici, sur les deux composers.
function _wireVoicePasteGif(inputId,kind){
  const el=document.getElementById(inputId);
  if(!el)return;
  el.addEventListener('paste',(e)=>{
    const items=(e.clipboardData&&e.clipboardData.items)||[];
    for(const it of items){
      if(it.kind==='file'&&/^image\//.test(it.type)){
        const file=it.getAsFile();
        if(file){e.preventDefault();stageFile(file,kind);}
        return;
      }
    }
    // Sinon : du texte normal, on laisse le champ gérer le collage lui-même.
  });
}
document.addEventListener('DOMContentLoaded',()=>{
  _wireVoicePasteGif('dm-input','dm');
  _wireVoicePasteGif('chat-input','group');
  _wireGifShortcut('dm-input','dm');
  _wireGifShortcut('chat-input','group');
});
// Si ce script se charge après DOMContentLoaded (cas courant, il est en fin
// de page), l'évènement ne se déclenchera jamais : on tente aussi tout de
// suite, sans risque puisque les fonctions ne font rien si l'élément
// n'existe pas encore.
_wireVoicePasteGif('dm-input','dm');
_wireVoicePasteGif('chat-input','group');
_wireGifShortcut('dm-input','dm');
_wireGifShortcut('chat-input','group');

// ── Recherche de GIF (Giphy) ──────────────────────────────────────
// Pas de bouton dédié dans le composer (je n'ai pas index.html sous les
// yeux pour l'y placer proprement) : taper « /gif » ou « /gif chat » dans
// le champ ouvre la recherche. Dis-moi si tu préfères en plus une icône
// visible à côté de la photo, j'ajusterai avec index.html.
function _wireGifShortcut(inputId,kind){
  const el=document.getElementById(inputId);
  if(!el||el.dataset.gifWired)return;
  el.dataset.gifWired='1';
  el.addEventListener('input',()=>{
    if(!/^\/gif\b/i.test(el.value))return;
    const terme=el.value.replace(/^\/gif\s*/i,'');
    el.value='';
    try{autoGrowInput(el);}catch(e){}
    openGifSearch(kind,terme);
  });
}
let _gifKind=null,_gifResults=[],_gifDebounce=null;
function _gifStyles(){
  if(document.getElementById('gif-sheet-style'))return;
  const s=document.createElement('style');
  s.id='gif-sheet-style';
  s.textContent=`
    #gif-sheet{position:fixed;inset:0;z-index:700;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);}
    #gif-sheet.on{display:flex;}
    #gif-sheet .gsb{width:100%;max-width:480px;height:78vh;background:var(--surf);border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;animation:gsUp .28s cubic-bezier(.32,.72,0,1);}
    @keyframes gsUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    #gif-sheet .gsh{display:flex;align-items:center;gap:8px;padding:14px 14px 10px;flex-shrink:0;}
    #gif-sheet .gsh input{flex:1;padding:10px 14px;border-radius:12px;border:none;background:var(--surf2);color:var(--txt);font-size:16px;font-family:inherit;outline:none;}
    #gif-sheet .gsh button{flex-shrink:0;background:none;border:none;color:var(--ac);font-size:15px;font-weight:600;font-family:inherit;padding:6px 4px;}
    #gif-sheet-grid{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;display:flex;gap:6px;padding:0 14px 14px;align-items:flex-start;}
    #gif-sheet .gif-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}
    #gif-sheet .gif-cell{display:block;width:100%;padding:0;border:none;border-radius:12px;overflow:hidden;background:var(--surf2);cursor:pointer;}
    #gif-sheet .gif-cell img{width:100%;height:auto;display:block;}
    #gif-sheet .gif-sheet-msg{grid-column:1/-1;text-align:center;color:var(--muted);font-size:13px;padding:40px 0;}
  `;
  document.head.appendChild(s);
}
function ensureGifSheet(){
  let v=document.getElementById('gif-sheet');
  if(v)return v;
  _gifStyles();
  v=document.createElement('div');
  v.id='gif-sheet';
  v.onclick=(e)=>{if(e.target===v)closeGifSearch();};
  v.innerHTML=`<div class="gsb">
    <div class="gsh">
      <input id="gif-search-input" type="text" placeholder="Chercher un GIF (Giphy)" autocomplete="off" autocapitalize="off">
      <button onclick="closeGifSearch()">Annuler</button>
    </div>
    <div id="gif-sheet-grid"></div>
  </div>`;
  document.body.appendChild(v);
  document.getElementById('gif-search-input').addEventListener('input',()=>{
    clearTimeout(_gifDebounce);
    const val=document.getElementById('gif-search-input').value;
    _gifDebounce=setTimeout(()=>runGifSearch(val),350);
  });
  return v;
}
function openGifSearch(kind,presetTerm){
  _gifKind=kind;
  ensureGifSheet().classList.add('on');
  const input=document.getElementById('gif-search-input');
  input.value=presetTerm||'';
  setTimeout(()=>input.focus(),60);
  runGifSearch(presetTerm||'');
}
function closeGifSearch(){
  const v=document.getElementById('gif-sheet');
  if(v)v.classList.remove('on');
}
async function runGifSearch(term){
  const grid=document.getElementById('gif-sheet-grid');
  if(!grid)return;
  grid.innerHTML='<div class="gif-sheet-msg">Recherche…</div>';
  try{
    // Le nom affiché dans Supabase est "giphy-search", mais le nom réel de
    // la fonction (celui qui compte pour l'appel) est "bright-responder" :
    // Supabase attribue parfois un identifiant différent du nom donné à la
    // création. Voir /functions/v1/bright-responder dans le tableau de bord.
    const{data,error}=await sb.functions.invoke('bright-responder',{body:{q:term}});
    if(error)throw error;
    _gifResults=(data&&data.gifs)||[];
    if(!_gifResults.length){grid.innerHTML='<div class="gif-sheet-msg">Aucun résultat.</div>';return;}
    // Deux vraies colonnes remplies à la main, équilibrées par hauteur estimée
    // (h/w à largeur de colonne égale) : column-count aurait plutôt ajouté des
    // colonnes sur le côté une fois la hauteur visible dépassée, forçant un
    // défilement horizontal au lieu de vertical.
    const colH=[0,0],cols=[[],[]];
    _gifResults.forEach((g,i)=>{
      const h=(g.h&&g.w)?g.h/g.w:1;
      const c=colH[0]<=colH[1]?0:1;
      cols[c].push(i);colH[c]+=h;
    });
    grid.innerHTML=cols.map(idxs=>'<div class="gif-col">'+idxs.map(i=>{
      const g=_gifResults[i];
      return `<button class="gif-cell" onclick="stageGiphyGifAt(${i})"><img src="${g.preview}" loading="lazy" alt="" style="aspect-ratio:${g.w||1}/${g.h||1}"></button>`;
    }).join('')+'</div>').join('');
  }catch(e){
    grid.innerHTML='<div class="gif-sheet-msg">Recherche indisponible pour le moment.</div>';
  }
}
function stageGiphyGifAt(i){
  const g=_gifResults[i];
  if(g)stageGiphyGif(g,_gifKind);
}
// Choisi depuis Giphy : on ne télécharge rien, le GIF reste hébergé chez eux.
// Même aperçu que pour une photo prise en local, donc le message peut
// toujours être annulé avant l'envoi.
function stageGiphyGif(gif,kind){
  _pendingPhoto={kind,isGif:true,external:true,url:gif.preview,sendUrl:gif.send};
  _renderPendingPhotoBar(kind,'GIF prêt (Giphy)');
  closeGifSearch();
}
function _renderPendingPhotoBar(kind,label){
  const barId=kind==='dm'?'dm-reply-bar':'chat-reply-bar';
  const el=document.getElementById(barId); if(!el)return;
  el.innerHTML=replyMiniHtml(kind)+`<div class="msg-replybar">
    <img src="${_pendingPhoto.url}" onclick="openImgViewer('${_pendingPhoto.url}')" style="width:42px;height:42px;object-fit:cover;border-radius:9px;flex-shrink:0;cursor:pointer;">
    <div class="rb-txt"><b>${label}</b><span>Tape l'aperçu pour vérifier · ➤ pour envoyer</span></div>
    <button onclick="cancelPendingPhoto('${kind}')">✕</button>
  </div>`;
}
function cancelPendingPhoto(kind){
  if(_pendingPhoto){URL.revokeObjectURL(_pendingPhoto.url);_pendingPhoto=null;}
  restoreReplyBar(kind);
}
async function uploadPendingPhoto(){
  // GIF choisi via Giphy : déjà hébergé, rien à envoyer vers Supabase.
  if(_pendingPhoto.external)return _pendingPhoto.sendUrl;
  const isGif=_pendingPhoto.isGif;
  // GIF : envoyé tel quel pour garder l'animation. Photo : compressée en JPEG.
  const blob=isGif?_pendingPhoto.file:await compressImage(_pendingPhoto.file,800,0.6);
  const ext=isGif?'gif':'jpg', mime=isGif?'image/gif':'image/jpeg';
  const base=(_pendingPhoto.kind==='dm'?'dm/':'grp/')+U.id+'_'+Date.now();
  const path=base+'.'+ext;
  const{error:upErr}=await sb.storage.from('chat-photos').upload(path,blob,{upsert:true,contentType:mime,cacheControl:'31536000'});
  if(upErr)throw upErr;
  // Vignette : c'est elle qui s'affiche dans le fil. Environ dix fois plus
  // légère que la photo, ce qui divise d'autant la bande passante consommée.
  if(!isGif){
    try{
      const vign=await compressImage(_pendingPhoto.file,320,0.45);
      await sb.storage.from('chat-photos').upload(base+'_t.jpg',vign,
        {upsert:true,contentType:'image/jpeg',cacheControl:'31536000'});
    }catch(e){}   // échec de la vignette : le fil affichera la photo pleine
  }
  const{data}=sb.storage.from('chat-photos').getPublicUrl(path);
  return data.publicUrl;
}
// Adresse de la vignette, déduite de celle de la photo. Les GIF et les vocaux
// n'en ont pas. Si le fichier n'existe pas (photo d'avant cette version),
// l'image bascule seule sur l'originale grâce à onerror.
function thumbUrl(u){
  if(!u||isVoiceUrl(u)||/\.gif(\?|$)/i.test(u))return u;
  return u.replace(/(\.[a-z0-9]+)(\?|$)/i,'_t$1$2');
}
function subscribeDM(){
  if(_dmChannel){sb.removeChannel(_dmChannel);_dmChannel=null;}
  _peerTyping=false;
  const ids=[U.id,_dmPartnerId].sort();
  _dmChannel=sb.channel('dm-'+ids[0]+'-'+ids[1],{config:{presence:{key:U.id}}})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'},(payload)=>{
      const r=payload.new||{};
      const mine=(r.sender_id===U.id&&r.receiver_id===_dmPartnerId);
      const theirs=(r.sender_id===_dmPartnerId&&r.receiver_id===U.id);
      if(!mine&&!theirs)return;
      // Le message arrive déjà complet dans l'événement : on l'affiche
      // directement, sans redemander toute la conversation au serveur.
      if(theirs){_peerTyping=false;setTypingBubble('dm',false);markDmRead();}
      setLastSeen('dm:'+_dmPartnerId);
      if(!appendMsgLocal(r,'dm'))loadDM();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'direct_messages'},(payload)=>{
      const r=payload.new||{};
      if((r.sender_id===U.id&&r.receiver_id===_dmPartnerId)||(r.sender_id===_dmPartnerId&&r.receiver_id===U.id))loadDM();
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'direct_messages'},()=>loadDM())
    // présence : qui est dans la conversation en ce moment
    .on('presence',{event:'sync'},()=>renderDMPresence())
    .on('presence',{event:'join'},()=>renderDMPresence())
    .on('presence',{event:'leave'},()=>renderDMPresence())
    // "en train d'écrire" via broadcast (aucune table nécessaire)
    .on('broadcast',{event:'typing'},({payload})=>{
      if(payload.from!==_dmPartnerId)return;
      // Deux états distincts sur le même canal : écrire, ou enregistrer un
      // vocal. Sans ça, on voit juste « en ligne » sans savoir ce que la
      // personne est en train de faire.
      if(payload.voice){
        _peerVoice=true;setTypingBubble('dm',false);renderDMPresence();
        clearTimeout(_voiceClearTimer);
        _voiceClearTimer=setTimeout(()=>{_peerVoice=false;renderDMPresence();},4000);
        return;
      }
      _peerTyping=true;setTypingBubble('dm',true);
      clearTimeout(_typingClearTimer);
      _typingClearTimer=setTimeout(()=>{_peerTyping=false;setTypingBubble('dm',false);},3500);
    })
    .subscribe(async(status)=>{ if(status==='SUBSCRIBED')await _dmChannel.track({online:true}); });
}
function renderDMPresence(){
  const el=document.getElementById('dm-presence'); if(!el||!_dmChannel)return;
  let online=false;
  try{ const state=_dmChannel.presenceState(); online=!!(state&&state[_dmPartnerId]&&state[_dmPartnerId].length); }catch(e){}
  const nick=nickOf(_dmPartnerId);
  // Un vocal en cours prime sur le simple « en ligne » : c'est justement
  // l'information qui manquait quand on voyait quelqu'un connecté.
  if(_peerVoice){
    el.textContent='🎙 enregistre un vocal…';
    el.style.color='var(--ac)';
    return;
  }
  const statut=online?'en ligne':'hors ligne';
  // Si la personne est renommée, on rappelle son vrai pseudo sous le surnom
  el.textContent=statut;
  el.style.color=online?'#30D158':'var(--muted)';
}
// Prévient l'autre qu'on enregistre. Répété tant que ça dure, car le
// destinataire efface l'état tout seul au bout de quelques secondes de silence.
let _voiceSignalTimer=null;
function signalVoiceRec(kind,on){
  const send=()=>{
    try{
      if(kind==='dm'){ if(_dmChannel&&_dmPartnerId)_dmChannel.send({type:'broadcast',event:'typing',payload:{from:U.id,voice:true}}); }
      else if(_chatChannel){ _chatChannel.send({type:'broadcast',event:'typing',payload:{uid:U.id,name:(P&&P.username?P.username:'Quelqu\'un'),voice:true}}); }
    }catch(e){}
  };
  clearInterval(_voiceSignalTimer);_voiceSignalTimer=null;
  if(!on)return;
  send();
  _voiceSignalTimer=setInterval(send,2500);
}
function setTypingBubble(kind,on){
  const box=document.getElementById(kind==='dm'?'dm-messages':'chat-messages');
  if(!box)return;
  let el=document.getElementById('typing-'+kind);
  if(!on){ if(el)el.remove(); return; }
  if(!el){
    el=document.createElement('div');
    el.id='typing-'+kind;
    el.className='typing-row';
    el.innerHTML='<div class="typing-bubble"><span></span><span></span><span></span></div>';
  }
  box.appendChild(el);   // toujours replacée en fin de fil après un re-render
  if(box.scrollHeight-box.scrollTop-box.clientHeight<200) scrollMsgBox(box);
}
function dmTyping(){
  if(!_dmChannel||!_dmPartnerId)return;
  if(_typingTimer)return;
  _dmChannel.send({type:'broadcast',event:'typing',payload:{from:U.id}});
  _typingTimer=setTimeout(()=>{_typingTimer=null;},1500);
}
function closeDM(){
  if(_dmChannel){sb.removeChannel(_dmChannel);_dmChannel=null;}
  _dmPartnerId=null;_dmCache=null;cancelReplyDM();_peerTyping=false;
  document.getElementById('fs-dm').classList.remove('on');
  refreshInboxBadge();
  // Revenir à la liste des conversations
  if(document.getElementById('fs-inbox').classList.contains('on'))loadInbox();
}
function openDMProfile(){
  if(!_dmPartnerId)return;
  document.getElementById('dm-options-menu').style.display='flex';
}
function closeDMOptions(){document.getElementById('dm-options-menu').style.display='none';}
function dmViewProfile(){
  closeDMOptions();
  if(_dmPartnerId){
    const m=document.getElementById('modal-friend-profile');
    if(m)m.style.zIndex='580';
    viewFriendProfile(_dmPartnerId);
  }
}
async function deleteDMConversation(){
  closeDMOptions();
  if(!_dmPartnerId)return;
  if(!confirm("Supprimer cette conversation ?\n\nTes messages seront effacés et l'historique disparaîtra de ton côté. C'est définitif."))return;
  const partnerId=_dmPartnerId;
  try{
    // Supprimer mes propres messages (RLS : chacun supprime les siens)
    await sb.from('direct_messages').delete().eq('sender_id',U.id).eq('receiver_id',partnerId);
    // Couper l'historique : ceux de l'autre personne, qu'on ne peut pas
    // effacer, ne seront plus jamais relus de notre cote.
    if(!ST.convCleared)ST.convCleared={};
    ST.convCleared['dm:'+partnerId]=new Date().toISOString();
    if(!ST.hiddenDMs)ST.hiddenDMs={};
    ST.hiddenDMs[partnerId]=new Date().toISOString();
    saveState();
    toast('Conversation supprimée','ok');
    closeDM();
  }catch(e){toast('Erreur','err');}
}

// ── Nettoyage du stockage ─────────────────────────────────────────
// Un message supprimé laissait son fichier en ligne pour toujours. On retire
// le fichier ET sa vignette, sinon l'espace se remplit de fichiers orphelins
// que plus rien n'affiche.
async function supprimerFichierMessage(imgUrl){
  if(!imgUrl)return;
  try{
    const path=imgUrl.split('/chat-photos/')[1];
    if(!path)return;
    const aRetirer=[path];
    // La vignette porte le même nom avec « _t » avant l'extension
    if(!isVoiceUrl(imgUrl)&&!/\.gif$/i.test(path)){
      aRetirer.push(path.replace(/(\.[a-z0-9]+)$/i,'_t$1'));
    }
    await sb.storage.from('chat-photos').remove(aRetirer);
  }catch(e){}
}

// ── Retour rapide au dernier message ──────────────────────────────
// Le bouton n'apparaît que si l'on a réellement remonté le fil, et porte une
// pastille quand des messages sont arrivés pendant qu'on lisait plus haut.
const _nonLusEnBas={dm:0,group:0};
function _btnBas(kind){ return document.getElementById(kind==='dm'?'dm-to-bottom':'chat-to-bottom'); }
function _boiteMsg(kind){ return document.getElementById(kind==='dm'?'dm-messages':'chat-messages'); }
function estEnBas(box){ return box.scrollHeight-box.scrollTop-box.clientHeight<80; }
function scrollToBottom(kind){
  const box=_boiteMsg(kind); if(!box)return;
  box.scrollTo({top:box.scrollHeight,behavior:'smooth'});
  _nonLusEnBas[kind]=0;
  majBoutonBas(kind);
}
function majBoutonBas(kind){
  const box=_boiteMsg(kind), b=_btnBas(kind);
  if(!box||!b)return;
  const enBas=estEnBas(box);
  if(enBas)_nonLusEnBas[kind]=0;
  // On ne le montre qu'au-delà d'un écran de défilement : inutile pour trois messages
  b.classList.toggle('on',!enBas&&box.scrollHeight-box.clientHeight>240);
  b.classList.toggle('unread',_nonLusEnBas[kind]>0);
  const i=b.querySelector('i');
  if(i)i.textContent=_nonLusEnBas[kind]>9?'9+':String(_nonLusEnBas[kind]||'');
}
function attacherBoutonBas(kind){
  const box=_boiteMsg(kind);
  if(!box||box.dataset.tb)return;
  box.dataset.tb='1';
  box.addEventListener('scroll',()=>majBoutonBas(kind),{passive:true});
}
// Un message reçu alors qu'on lit plus haut incrémente la pastille
function signalerMessageEnBas(kind){
  const box=_boiteMsg(kind);
  if(!box)return;
  if(!estEnBas(box))_nonLusEnBas[kind]++;
  majBoutonBas(kind);
}
