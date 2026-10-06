// ══════════════════════════════════════════════════════════════
// KeyFit — les groupes
// Module isolé : ce fichier ne contient que les groupes.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function selectGroupVis(btn){
  _groupVis=btn.dataset.v;
  document.querySelectorAll('.grp-vis-btn').forEach(b=>{
    const on=b===btn;
    b.style.borderColor=on?'var(--ac)':'var(--bdr)';
    b.style.color=on?'var(--ac)':'var(--muted)';
  });
}
function openCreateGroup(){
  document.getElementById('grp-name').value='';
  document.getElementById('grp-desc').value='';
  _groupVis='private';
  document.querySelectorAll('.grp-vis-btn').forEach(b=>{
    const on=b.dataset.v==='private';
    b.style.borderColor=on?'var(--ac)':'var(--bdr)';
    b.style.color=on?'var(--ac)':'var(--muted)';
  });
  openModal('modal-create-group');
}
async function createGroup(){
  const name=document.getElementById('grp-name').value.trim();
  const desc=document.getElementById('grp-desc').value.trim();
  if(!name){toast('Donne un nom au groupe','err');return;}
  try{
    const{data,error}=await sb.from('groups').insert({creator_id:U.id,name,description:desc||null,is_public:_groupVis==='public'}).select().single();
    if(error){toast('Erreur : '+error.message,'err');return;}
    // Le créateur rejoint automatiquement comme membre confirmé
    await sb.from('group_members').insert({group_id:data.id,user_id:U.id,status:'member'});
    ST._createdAGroup=true;ST._inAGroup=true;saveState();checkAchievements();
    toast('👥 Groupe créé !','ok');
    closeModal('modal-create-group');
    loadGroups();
    openGroupDetail(data.id);
  }catch(e){toast('Erreur lors de la création','err');}
}
async function loadGroups(){
  const list=document.getElementById('groups-list');
  if(!list||!U)return;
  try{
    // Mes liens de groupe (membre, invité, ou demande en attente)
    const{data:memberships}=await sb.from('group_members').select('group_id,status').eq('user_id',U.id);
    const all=memberships||[];
    const memberIds=all.filter(m=>m.status==='member').map(m=>m.group_id);
    if(memberIds.length){ST._inAGroup=true;}

    let html='';

    // Section mes groupes
    if(!memberIds.length){
      list.innerHTML='<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px 0;">Aucun groupe encore.<br>Crée-en un, ou cherche un groupe public à rejoindre ! 👥</div>'+groupSearchBox();
      return;
    }
    if(memberIds.length){
      const{data:groups}=await sb.from('groups').select('*').in('id',memberIds).order('created_at',{ascending:false});
      const{data:allMembers}=await sb.from('group_members').select('group_id,status').in('group_id',memberIds);
      const counts={};
      (allMembers||[]).forEach(m=>{if(m.status==='member')counts[m.group_id]=(counts[m.group_id]||0)+1;});
      html+='<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.02em;margin-bottom:10px;">Mes groupes</div>';
      html+=(groups||[]).map(g=>`
        <div onclick="openGroupDetail('${g.id}')" style="cursor:pointer;background:var(--surf);border:none;border-radius:16px;padding:16px 18px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:16px;font-weight:600;color:var(--txt);letter-spacing:-.01em;">${g.name} ${g.is_public?'<span style="font-size:12px;color:var(--muted);">🌍</span>':'<span style="font-size:12px;color:var(--muted);">🔒</span>'}</div>
            <span style="font-size:14px;color:var(--muted);">${counts[g.id]||1} membre${(counts[g.id]||1)>1?'s':''} ›</span>
          </div>
          ${g.description?`<div style="font-size:14px;color:var(--muted);margin-top:4px;letter-spacing:-.006em;">${g.description}</div>`:''}
        </div>`).join('');
    }
    list.innerHTML=html+groupSearchBox();
  }catch(e){
    list.innerHTML='<div style="font-size:12px;color:#ef4444;text-align:center;padding:12px 0;">Erreur</div>';
  }
}
function groupSearchBox(){
  return `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--bdr);">
    <input class="finp" type="text" id="group-search-input" placeholder="🔍 Chercher un groupe public…" oninput="debouncedGroupSearch()" style="margin-bottom:8px;">
    <div id="group-search-results"></div>
  </div>`;
}
function debouncedGroupSearch(){
  clearTimeout(_groupSearchTimer);
  _groupSearchTimer=setTimeout(groupSearch,400);
}
async function groupSearch(){
  const q=document.getElementById('group-search-input').value.trim();
  const el=document.getElementById('group-search-results');
  if(!q){el.innerHTML='';return;}
  el.innerHTML='<div style="text-align:center;padding:12px;color:var(--muted);font-size:12px;">Recherche…</div>';
  try{
    // Groupes publics correspondant
    const{data:groups}=await sb.from('groups').select('*').eq('is_public',true).ilike('name','%'+q+'%').limit(15);
    // Mes liens existants
    const{data:myLinks}=await sb.from('group_members').select('group_id,status').eq('user_id',U.id);
    const linkMap={};(myLinks||[]).forEach(m=>linkMap[m.group_id]=m.status);
    if(!groups||!groups.length){el.innerHTML='<div style="text-align:center;padding:12px;color:var(--muted);font-size:12px;">Aucun groupe public trouvé</div>';return;}
    el.innerHTML=groups.map(g=>{
      const st=linkMap[g.id];
      let action;
      if(st==='member')action='<span style="font-size:11px;color:#22c55e;">✓ Membre</span>';
      else if(st==='requested')action='<span style="font-size:11px;color:var(--muted);">⏳ Demande envoyée</span>';
      else if(st==='invited')action='<span style="font-size:11px;color:var(--ac);">📩 Invité</span>';
      else action=`<button data-req-target="${g.id}" onclick="requestJoinGroup('${g.id}')" style="font-size:11px;padding:6px 12px;background:var(--ac);color:#fff;border-radius:8px;font-weight:700;">Demander</button>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--bdr);">
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${g.name}</div>${g.description?`<div style="font-size:12px;color:var(--muted);">${g.description}</div>`:''}</div>
        ${action}
      </div>`;
    }).join('');
  }catch(e){el.innerHTML='<div style="text-align:center;padding:12px;color:#ef4444;font-size:12px;">Erreur</div>';}
}
async function requestJoinGroup(groupId){
  try{
    const{error}=await sb.from('group_members').insert({group_id:groupId,user_id:U.id,status:'requested'});
    if(error){toast('Erreur : '+error.message,'err');return;}
    toast('⏳ Demande envoyée','ok');
    document.querySelectorAll(`[data-req-target="${groupId}"]`).forEach(el=>{
      el.outerHTML='<span style="font-size:11px;color:var(--muted);">⏳ Demande envoyée</span>';
    });
    // Notifier le créateur du groupe
    try{
      const{data:g}=await sb.from('groups').select('creator_id,name').eq('id',groupId).single();
      if(g&&g.creator_id){
        const myName=(P&&P.username)?P.username:'Quelqu\'un';
        sb.from('notifications').insert({user_id:g.creator_id,from_id:U.id,type:'group_request',content:`${myName} demande à rejoindre "${g.name}"`}).then(()=>{}).catch(()=>{});
      }
    }catch(e){}
  }catch(e){toast('Erreur','err');}
}
async function respondGroupInvite(groupId,accept){
  try{
    if(accept){
      await sb.from('group_members').update({status:'member'}).eq('group_id',groupId).eq('user_id',U.id);
      ST._inAGroup=true;saveState();checkAchievements();
      // Prévenir le créateur : quelqu'un vient d'entrer dans son groupe
      try{
        const{data:g}=await sb.from('groups').select('creator_id,name').eq('id',groupId).maybeSingle();
        if(g&&g.creator_id)pushNotif(g.creator_id,'group_request',`${myName()} a rejoint « ${g.name} » 👥`);
      }catch(e){}
      annonceGroupe(groupId,`${myName()} a rejoint le groupe`);
      toast('✓ Tu as rejoint le groupe !','ok');
    }else{
      await sb.from('group_members').delete().eq('group_id',groupId).eq('user_id',U.id);
      toast('Invitation refusée','ok');
    }
    loadGroups();
    renderFollowCounts();
    renderProfileNotifications();
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
    refreshInboxBadge();
  }catch(e){toast('Erreur','err');}
}
async function openGroupDetail(groupId){
  _currentGroupId=groupId;
  const content=document.getElementById('group-detail-content');
  content.innerHTML='<div style="padding:30px;text-align:center;color:var(--muted);">Chargement…</div>';
  openModal('modal-group-detail');
  try{
    const{data:g}=await sb.from('groups').select('*').eq('id',groupId).single();
    if(!g){content.innerHTML='<div style="padding:20px;color:var(--muted);">Groupe introuvable</div>';return;}
    const{data:links}=await sb.from('group_members').select('user_id,status,profiles(username,avatar_url)').eq('group_id',groupId);
    const all=links||[];
    const mems=all.filter(m=>m.status==='member');
    const requests=all.filter(m=>m.status==='requested');
    const invited=all.filter(m=>m.status==='invited');
    const isCreator=g.creator_id===U.id;
    const isMember=mems.some(m=>m.user_id===U.id);
    // Managers : le créateur en désigne jusqu'à trois. Ils peuvent modifier le
    // groupe, mais ni le supprimer ni nommer d'autres managers.
    const managers=Array.isArray(g.managers)?g.managers:[];
    const isManager=managers.includes(U.id);
    const canEdit=isCreator||isManager;

    // L'ordre venait de la base, donc le créateur pouvait se retrouver
    // n'importe où. Il ouvre toujours la liste, puis les managers, puis
    // les membres ordinaires dans leur ordre d'arrivée.
    const rangMembre=(uid)=>uid===g.creator_id?0:managers.includes(uid)?1:2;
    mems.sort((a,b)=>rangMembre(a.user_id)-rangMembre(b.user_id));

    // Section demandes en attente (visible créateur seulement)
    let requestsHtml='';
    if(isCreator && requests.length){
      requestsHtml=`<div style="font-size:12px;font-weight:600;color:var(--ac);text-transform:uppercase;letter-spacing:.3px;margin:16px 0 8px;">Demandes d'entrée (${requests.length})</div>`+
      requests.map(m=>{
        const p=m.profiles;
        const avatarHtml=p?.avatar_url?`<img src="${p.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`:`<div style="width:32px;height:32px;border-radius:50%;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-size:14px;">👤</div>`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--bdr);">
          ${avatarHtml}
          <div style="flex:1;font-size:13px;font-weight:600;">${p?.username||'—'}</div>
          <button onclick="respondJoinRequest('${groupId}','${m.user_id}',true)" style="font-size:11px;padding:6px 10px;background:#22c55e;color:#fff;border-radius:8px;font-weight:700;">✓</button>
          <button onclick="respondJoinRequest('${groupId}','${m.user_id}',false)" style="font-size:11px;padding:6px 10px;background:var(--surf2);border:1px solid var(--bdr);color:var(--muted);border-radius:8px;font-weight:700;">✕</button>
        </div>`;
      }).join('');
    }

    // Qui peut exclure qui : le créateur retire n'importe qui, un manager
    // seulement les membres ordinaires. Personne ne peut retirer le créateur.
    const peutExclure=(uid)=>{
      if(uid===g.creator_id||uid===U.id)return false;
      if(isCreator)return true;
      return isManager && !managers.includes(uid);
    };
    const membersHtml=mems.map(m=>{
      const p=m.profiles||{};
      const nom=displayName(m.user_id,p.username);
      const moi=m.user_id===U.id;
      const av=p.avatar_url
        ? `<div class="av"><img src="${p.avatar_url}" alt=""></div>`
        : `<div class="av" style="background:${userGrad(nom)}">${escapeHtml((nom||'?')[0]).toUpperCase()}</div>`;
      const excluable=peutExclure(m.user_id);
      return `<div class="gm-row${excluable?' swipeable':''}"
          ${excluable?`ontouchstart="gmStart(event)" ontouchmove="gmMove(event)" ontouchend="gmEnd(event,this)"`:''}>
        ${excluable?`<div class="gm-act"><button onclick="event.stopPropagation();removeMember('${groupId}','${m.user_id}')">Exclure</button></div>`:''}
        <div class="cd-p gm-in${moi?' me':''}">${av}
        <div class="nm">${escapeHtml(nom)}${moi?' (toi)':''}
          <small>${m.user_id===g.creator_id?'A créé le groupe':managers.includes(m.user_id)?'Peut modifier le groupe':'Membre'}</small>
        </div>
        ${m.user_id===g.creator_id?'<span class="gm-badge creator">Créateur</span>'
          :managers.includes(m.user_id)?'<span class="gm-badge mgr">Manager</span>'
          :`<span class="val" style="color:${userColor(nom)};">●</span>`}
        </div>
      </div>`;
    }).join('<div class="cd-hair"></div>');

    // Depuis la discussion elle-même, « Ouvrir la discussion » n'a aucun sens.
    const dansLaDiscussion=(typeof _chatGroupId!=='undefined'&&_chatGroupId===groupId
      &&document.getElementById('fs-group-chat')&&document.getElementById('fs-group-chat').classList.contains('on'));
    let rows='';
    if((isMember||isCreator)&&!dansLaDiscussion) rows+=`<button class="cd-act prim" onclick="openGroupChat('${groupId}','${escapeHtml(g.name).replace(/'/g,'')}');markGroupSeen('${groupId}')">Ouvrir la discussion<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`;
    if(canEdit) rows+=(rows?'<div class="cd-hair"></div>':'')+`<button class="cd-act${dansLaDiscussion?' prim':''}" onclick="openAddMember('${groupId}')">Ajouter un membre${dansLaDiscussion?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>':''}</button>`;
    if(isMember||isCreator) rows+=(rows?'<div class="cd-hair"></div>':'')+`<button class="cd-act" onclick="askClearConversation('group','${groupId}')">Vider la conversation<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`;
    if(isMember&&!isCreator) rows+=(rows?'<div class="cd-hair"></div>':'')+`<button class="cd-act" onclick="leaveGroup('${groupId}')">Quitter le groupe<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`;
    if(isCreator) rows+=(rows?'<div class="cd-hair"></div>':'')+`<button class="cd-act dgr" onclick="deleteGroup('${groupId}')">Supprimer le groupe</button>`;

    content.innerHTML=`
      <div class="cd-hd">
        <div class="cd-cover${canEdit?' editable':''}" ${canEdit?`onclick="pickCoverPhoto('group','${groupId}')"`:''}>
          ${g.avatar_url
            ? `<img src="${g.avatar_url}" alt="">`
            : `<span>${escapeHtml((g.name||'?')[0]).toUpperCase()}</span>`}
          ${canEdit?'<i class="cd-cover-edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="3.2"/><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/></svg></i>':''}
        </div>
        <h2>${escapeHtml(g.name||'Groupe')}${canEdit?`<button class="cd-rename" onclick="renameEntity('group','${groupId}','${escapeHtml(g.name||'').replace(/'/g,"\\'")}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>`:''}</h2>
        ${g.description?`<div class="cd-meta">${escapeHtml(g.description)}</div>`:''}
        <div class="cd-meta">${g.is_public?'Groupe public':'Groupe privé'}</div>
        <span class="cd-pill">👥 ${mems.length} membre${mems.length>1?'s':''}</span>
      </div>

      ${requestsHtml}

      <div class="cd-sec">Membres</div>
      <div class="cd-card">${membersHtml||'<div class="cd-note">Aucun membre pour l\'instant</div>'}</div>

      ${invited.length?`<div class="cd-sec">Invitations en attente</div><div class="cd-card">`+invited.map(m=>{
        const nom=displayName(m.user_id,(m.profiles||{}).username);
        return `<div class="cd-p"><div class="av" style="background:${userGrad(nom)}">${escapeHtml((nom||'?')[0]).toUpperCase()}</div>
          <div class="nm">${escapeHtml(nom)}<small>en attente de réponse</small></div></div>`;
      }).join('<div class="cd-hair"></div>')+`</div>`:''}

      ${isCreator&&mems.length>1?`<div class="cd-sec">Managers · ${managers.length}/3</div>
        <div class="cd-card">${mems.filter(m=>m.user_id!==g.creator_id).map(m=>{
          const p=m.profiles||{};
          const nom=displayName(m.user_id,p.username);
          const est=managers.includes(m.user_id);
          const plein=managers.length>=3&&!est;
          const av=p.avatar_url
            ? `<div class="av"><img src="${p.avatar_url}" alt=""></div>`
            : `<div class="av" style="background:${userGrad(nom)}">${escapeHtml((nom||'?')[0]).toUpperCase()}</div>`;
          return `<div class="cd-p${plein?' gm-full':''}">${av}
            <div class="nm">${escapeHtml(nom)}<small>${est?'Peut modifier le groupe':'Membre'}</small></div>
            <div class="gm-tog${est?' on':''}" onclick="toggleManager('${groupId}','${m.user_id}')"></div>
          </div>`;
        }).join('<div class="cd-hair"></div>')}</div>
        <div class="cd-note" style="text-align:left;padding:8px 4px 0;">Un manager peut changer la photo, le nom et ajouter des membres. Il ne peut ni supprimer le groupe ni nommer d'autres managers.</div>`:''}

      ${rows?`<div class="cd-sec">Gérer</div><div class="cd-card">${rows}</div>`:''}`;
  }catch(e){
    content.innerHTML='<div style="padding:20px;color:#ef4444;">Erreur de chargement</div>';
  }
}
async function respondJoinRequest(groupId,userId,accept){
  try{
    const{data:g}=await sb.from('groups').select('name').eq('id',groupId).single();
    const gname=g?.name||'le groupe';
    if(accept){
      const{error}=await sb.from('group_members').update({status:'member'}).eq('group_id',groupId).eq('user_id',userId);
      if(error){toast('Erreur : '+error.message,'err');return;}
      toast('✓ Membre accepté','ok');
      sb.from('notifications').insert({user_id:userId,from_id:U.id,type:'group_accepted',content:`Ta demande pour "${gname}" a été acceptée ! 🎉`}).then(()=>{}).catch(()=>{});
      try{
        const{data:pr}=await sb.from('profiles').select('username').eq('id',userId).maybeSingle();
        annonceGroupe(groupId,`${displayName(userId,pr&&pr.username)} a rejoint le groupe`);
      }catch(e){}
    }else{
      const{error}=await sb.from('group_members').delete().eq('group_id',groupId).eq('user_id',userId);
      if(error){toast('Erreur : '+error.message,'err');return;}
      toast('Demande refusée','ok');
      sb.from('notifications').insert({user_id:userId,from_id:U.id,type:'group_refused',content:`Ta demande pour "${gname}" n'a pas été retenue`}).then(()=>{}).catch(()=>{});
    }
    if(document.getElementById('modal-group-detail').classList.contains('on'))openGroupDetail(groupId);
    renderProfileNotifications();
    renderFollowCounts();
  }catch(e){toast('Erreur','err');}
}
function openAddMember(groupId){
  _currentGroupId=groupId;
  document.getElementById('add-member-search').value='';
  document.getElementById('add-member-results').innerHTML='<div style="font-size:13px;color:var(--muted);text-align:center;padding:22px 16px;">Cherche un ami à inviter</div>';
  openModal('modal-add-member');
}
function debouncedAddMemberSearch(){
  clearTimeout(_addMemberTimer);
  _addMemberTimer=setTimeout(addMemberSearch,400);
}
async function addMemberSearch(){
  const q=document.getElementById('add-member-search').value.trim();
  const el=document.getElementById('add-member-results');
  if(!q){el.innerHTML='';return;}
  el.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;">Recherche…</div>';
  try{
    const{data}=await sb.from('profiles').select('id,username,avatar_url').ilike('username','%'+q+'%').neq('id',U.id).limit(20);
    const{data:existing}=await sb.from('group_members').select('user_id,status').eq('group_id',_currentGroupId);
    const statusMap={};(existing||[]).forEach(m=>statusMap[m.user_id]=m.status);
    if(!data||!data.length){el.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;">Aucun résultat</div>';return;}
    el.innerHTML=data.map(u=>{
      const st=statusMap[u.id];
      const avatarHtml=u.avatar_url?`<img src="${u.avatar_url}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">`:`<div style="width:34px;height:34px;border-radius:50%;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-size:15px;">👤</div>`;
      let action;
      if(st==='member')action='<span style="font-size:11px;color:#22c55e;">✓ Membre</span>';
      else if(st==='invited')action='<span style="font-size:11px;color:var(--ac);">📩 Invité</span>';
      else if(st==='requested')action=`<button data-add-target="${u.id}" onclick="addMemberToGroup('${u.id}')" style="font-size:11px;padding:6px 12px;background:#22c55e;color:#fff;border-radius:8px;font-weight:700;">Accepter</button>`;
      else action=`<button data-add-target="${u.id}" onclick="addMemberToGroup('${u.id}')" style="font-size:11px;padding:6px 12px;background:var(--ac);color:#fff;border-radius:8px;font-weight:700;">+ Inviter</button>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--bdr);">
        <div style="flex-shrink:0;">${avatarHtml}</div>
        <div style="flex:1;font-size:14px;font-weight:600;">${u.username||'—'}</div>
        ${action}
      </div>`;
    }).join('');
  }catch(e){
    el.innerHTML='<div style="text-align:center;padding:16px;color:#ef4444;font-size:13px;">Erreur</div>';
  }
}
async function addMemberToGroup(userId){
  try{
    // Si la personne avait déjà demandé, on l'accepte ; sinon on l'invite
    const{data:existing}=await sb.from('group_members').select('status').eq('group_id',_currentGroupId).eq('user_id',userId).maybeSingle();
    if(existing){
      await sb.from('group_members').update({status:existing.status==='requested'?'member':'invited'}).eq('group_id',_currentGroupId).eq('user_id',userId);
    }else{
      await sb.from('group_members').insert({group_id:_currentGroupId,user_id:userId,status:'invited',invited_by:U.id});
    }
    try{
      const{data:g}=await sb.from('groups').select('name').eq('id',_currentGroupId).maybeSingle();
      pushNotif(userId,'group_request',`${myName()} t'invite à rejoindre « ${g?.name||'un groupe'} » 👥`);
    }catch(e){}
    toast('📩 Invitation envoyée','ok');
    document.querySelectorAll(`[data-add-target="${userId}"]`).forEach(el=>{
      el.outerHTML='<span style="font-size:11px;color:var(--ac);">📩 Invité</span>';
    });
  }catch(e){toast('Erreur','err');}
}
async function leaveGroup(groupId){
  try{
    const{error}=await sb.from('group_members').delete().eq('group_id',groupId).eq('user_id',U.id);
    if(error){toast('Erreur : '+error.message,'err');return;}
    annonceGroupe(groupId,`${myName()} a quitté le groupe`);
    toast('Tu as quitté le groupe','ok');
    closeModal('modal-group-detail');
    // On sort de la discussion si elle est ouverte, sinon on reste dans un
    // groupe dont on n'est plus membre.
    if(_chatGroupId===groupId){ try{closeGroupChat();}catch(e){} }
    loadGroups();
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
    refreshInboxBadge();
  }catch(e){toast('Erreur','err');}
}
async function deleteGroup(groupId){
  if(!confirm('Supprimer définitivement ce groupe ?'))return;
  try{
    // Supprimer d'abord les membres et messages liés, puis le groupe
    await sb.from('group_members').delete().eq('group_id',groupId);
    await sb.from('group_messages').delete().eq('group_id',groupId);
    const{error}=await sb.from('groups').delete().eq('id',groupId);
    if(error){toast('Erreur : '+error.message,'err');return;}
    toast('Groupe supprimé','ok');
    closeModal('modal-group-detail');
    loadGroups();
  }catch(e){toast('Erreur','err');}
}
function openCreateGroupFromInbox(){
  const m=document.getElementById('modal-create-group');
  if(m)m.style.zIndex='580';
  openCreateGroup();
}

// ── Nommer ou retirer un manager (créateur uniquement) ────────────
async function toggleManager(groupId,userId){
  try{
    const{data:g}=await sb.from('groups').select('creator_id,managers,name').eq('id',groupId).single();
    if(!g||g.creator_id!==U.id){toast('Réservé au créateur','err');return;}
    let list=Array.isArray(g.managers)?g.managers.slice():[];
    const est=list.includes(userId);
    if(est) list=list.filter(x=>x!==userId);
    else{
      if(list.length>=3){toast('Trois managers au maximum','err');return;}
      list.push(userId);
    }
    const{error}=await sb.from('groups').update({managers:list}).eq('id',groupId);
    if(error){toast('Colonne manquante en base — vois le SQL','err');return;}
    // Notification ET trace dans la conversation : tout le groupe voit le
    // changement, même ceux qui ne regardent pas leurs notifications.
    if(!est)pushNotif(userId,'group_request',`${myName()} t'a nommé manager de « ${g.name||'un groupe'} »`);
    try{
      const{data:p}=await sb.from('profiles').select('username').eq('id',userId).maybeSingle();
      const qui=displayName(userId,p&&p.username);
      await sb.from('group_messages').insert({
        group_id:groupId, user_id:U.id, type:'system',
        content: est ? `${qui} n'est plus manager du groupe`
                     : `${qui} est maintenant manager du groupe`
      });
    }catch(e){}
    toast(est?'Manager retiré':'Manager nommé','ok');
    openGroupDetail(groupId);
  }catch(e){toast('Erreur','err');}
}

// ── Retirer quelqu'un du groupe ───────────────────────────────────
// Retirer un manager le destitue au passage : son emplacement se libère,
// sans qu'on ait à le rétrograder d'abord.
async function removeMember(groupId,userId){
  try{
    const{data:g}=await sb.from('groups').select('creator_id,managers,name').eq('id',groupId).single();
    if(!g)return;
    const managers=Array.isArray(g.managers)?g.managers:[];
    const isCreator=g.creator_id===U.id;
    const isManager=managers.includes(U.id);
    if(userId===g.creator_id){toast('Le créateur ne peut pas être retiré','err');return;}
    const autorise=isCreator || (isManager && !managers.includes(userId));
    if(!autorise){toast('Tu n\'as pas le droit de retirer cette personne','err');return;}

    const{data:p}=await sb.from('profiles').select('username').eq('id',userId).maybeSingle();
    const qui=displayName(userId,p&&p.username)||(p&&p.username)||'ce membre';
    if(!confirm('Exclure '+qui+' du groupe ?\n\n'+qui+' perdra l\'accès à la conversation et devra être réinvité pour revenir.'))return;

    const{error}=await sb.from('group_members').delete().eq('group_id',groupId).eq('user_id',userId);
    if(error){toast('Erreur : '+error.message,'err');return;}
    // Un manager retiré libère son emplacement
    if(managers.includes(userId)){
      await sb.from('groups').update({managers:managers.filter(x=>x!==userId)}).eq('id',groupId);
    }
    try{
      await sb.from('group_messages').insert({
        group_id:groupId, user_id:U.id, type:'system',
        content:`${qui} a été exclu du groupe`
      });
    }catch(e){}
    pushNotif(userId,'group_request',`Tu as été retiré de « ${g.name||'un groupe'} »`);
    toast(qui+' a été retiré','ok');
    openGroupDetail(groupId);
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
  }catch(e){toast('Erreur','err');}
}

// Annonce partagée : arrivée, départ, exclusion. Visible de tout le groupe,
// pour que sa composition ne change jamais en silence.
async function annonceGroupe(groupId,texte){
  try{
    await sb.from('group_messages').insert({
      group_id:groupId, user_id:U.id, type:'system', content:texte
    });
  }catch(e){}
}

// ── Glissement sur une ligne de membre ────────────────────────────
// Même geste que sur les conversations : on tire vers la gauche pour
// révéler « Exclure », plutôt qu'une croix visible en permanence.
let _gm={x:0,y:0,on:false};
function gmStart(e){_gm={x:e.touches[0].clientX,y:e.touches[0].clientY,on:false};}
function gmMove(e){
  const dx=e.touches[0].clientX-_gm.x, dy=e.touches[0].clientY-_gm.y;
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.6)_gm.on=true;
}
function gmEnd(e,el){
  if(!_gm.on)return;
  const dx=e.changedTouches[0].clientX-_gm.x;
  document.querySelectorAll('.gm-row.swiped').forEach(r=>{ if(r!==el)r.classList.remove('swiped'); });
  el.classList.toggle('swiped',dx<-40);
}
