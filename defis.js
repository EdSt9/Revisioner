// ══════════════════════════════════════════════════════════════
// KeyFit — les défis
// Module isolé : ce fichier ne contient que les défis.
// Chargé après index.html, les variables partagées y sont déjà définies.
// ══════════════════════════════════════════════════════════════

function totalChallengesWon(){
  return (ST.challengesRewarded||[]).length;
}
async function postChallengeWinMessage(groupId,text){
  try{
    await sb.from('group_messages').insert({group_id:groupId,user_id:U.id,content:text,type:'challenge'});
  }catch(e){}
}
async function openInviteSheet(challengeId){
  const back=document.getElementById('invite-sheet');
  const body=document.getElementById('invite-list');
  back.style.display='flex';
  body.innerHTML='<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px;">Chargement…</div>';
  try{
    // Les gens que je suis et qui me suivent : mon cercle
    const{data:rels}=await sb.from('friendships')
      .select('follower_id,followed_id').eq('status','accepted')
      .or(`follower_id.eq.${U.id},followed_id.eq.${U.id}`);
    const ids=[...new Set((rels||[]).map(r=>r.follower_id===U.id?r.followed_id:r.follower_id))].filter(x=>x&&x!==U.id);
    if(!ids.length){body.innerHTML='<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px;">Tu n\'as encore personne à inviter.</div>';return;}
    // On retire ceux déjà dans le défi (participants ou déjà invités)
    const{data:already}=await sb.from('challenge_participants').select('user_id').eq('challenge_id',challengeId);
    const inSet=new Set((already||[]).map(a=>a.user_id));
    const{data:profs}=await sb.from('profiles').select('id,username,avatar_url').in('id',ids);
    const list=(profs||[]).filter(p=>!inSet.has(p.id));
    if(!list.length){body.innerHTML='<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px;">Tout ton cercle est déjà dans ce défi.</div>';return;}
    body.innerHTML=list.map(p=>`<button class="inv-row" onclick="doInvite('${challengeId}','${p.id}')">
      ${p.avatar_url?`<img src="${p.avatar_url}" alt="">`:'<span class="inv-av">👤</span>'}
      <span class="inv-nm">${nameWithHandle(p.id,p.username)}</span>
      <span class="inv-plus">+</span>
    </button>`).join('');
  }catch(e){body.innerHTML='<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px;">Erreur de chargement.</div>';}
}
function closeInviteSheet(){document.getElementById('invite-sheet').style.display='none';}
async function doInvite(challengeId,friendId){
  try{
    const{error}=await sb.from('challenge_participants')
      .insert({challenge_id:challengeId,user_id:friendId,progress:0,status:'invited'});
    if(error){toast('Erreur : '+error.message,'err');return;}
    const{data:ch}=await sb.from('challenges').select('title').eq('id',challengeId).maybeSingle();
    pushNotif(friendId,'challenge_invite',`${myName()} t'invite à rejoindre « ${ch?.title||'un défi'} » 🎯`);
    toast('✓ Invitation envoyée','ok');
    openInviteSheet(challengeId);
  }catch(e){toast('Erreur','err');}
}
async function acceptChallengeInvite(challengeId){
  try{
    await sb.from('challenge_participants').update({status:'joined'})
      .eq('challenge_id',challengeId).eq('user_id',U.id);
    // Prévenir le créateur : accepter une invitation, c'est aussi rejoindre
    try{
      const{data:ch}=await sb.from('challenges').select('creator_id,title').eq('id',challengeId).maybeSingle();
      if(ch&&ch.creator_id)pushNotif(ch.creator_id,'challenge_join',`${myName()} a rejoint « ${ch.title} » 🔥`);
    }catch(e){}
    toast('🔥 Tu as rejoint le défi !','ok');
    loadChallenges();
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
    openChallengeDetail(challengeId);
  }catch(e){toast('Erreur','err');}
}
async function declineChallengeInvite(challengeId){
  try{
    await sb.from('challenge_participants').delete()
      .eq('challenge_id',challengeId).eq('user_id',U.id);
    toast('Invitation refusée','ok');
    loadChallenges();
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
  }catch(e){toast('Erreur','err');}
}
function updateChallengeTypeHint(){
  const t=document.getElementById('ch-type').value;
  const hint=document.getElementById('ch-type-hint');
  const tg=document.getElementById('ch-target');
  const hints={
    sessions:'Compte le nombre de séances enregistrées pendant la période. Progression automatique.',
    days:'Compte les jours différents où tu t\'es entraîné. Progression automatique.',
    free:'Objectif que chacun met à jour manuellement (ex : km courus, litres d\'eau).'
  };
  if(hint)hint.textContent=hints[t]||'';
  // L'unité n'a de sens que pour un objectif qu'on met à jour soi-même
  const uf=document.getElementById('ch-unit-field');
  if(uf)uf.style.display=(t==='free')?'block':'none';
}
async function selectChallengeVis(btn){
  _challengeVis=btn.dataset.v;
  document.querySelectorAll('.ch-vis-btn').forEach(b=>{
    const on=b===btn;
    b.style.borderColor=on?'var(--ac)':'var(--bdr)';
    b.style.color=on?'var(--ac)':'var(--muted)';
  });
  const wrap=document.getElementById('ch-group-select-wrap');
  if(_challengeVis==='group'){
    wrap.style.display='block';
    // Charger mes groupes dans le sélecteur
    const sel=document.getElementById('ch-group-select');
    sel.innerHTML='<option value="">Chargement…</option>';
    try{
      const{data:memberships}=await sb.from('group_members').select('group_id').eq('user_id',U.id).eq('status','member');
      const ids=(memberships||[]).map(m=>m.group_id);
      if(!ids.length){sel.innerHTML='<option value="">Tu n\'as aucun groupe</option>';return;}
      const{data:groups}=await sb.from('groups').select('id,name').in('id',ids);
      sel.innerHTML=(groups||[]).map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
    }catch(e){sel.innerHTML='<option value="">Erreur</option>';}
  }else{
    wrap.style.display='none';
  }
}
function openCreateChallengeFromInbox(){
  const m=document.getElementById('modal-create-challenge');
  if(m)m.style.zIndex='580';
  openCreateChallenge();
}
function openCreateChallenge(){
  document.getElementById('ch-title').value='';
  document.getElementById('ch-desc').value='';
  document.getElementById('ch-type').value='sessions';
  document.getElementById('ch-target').value='';
  // Dates par défaut : aujourd'hui → fin du mois
  const now=new Date();
  const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const endMonth=new Date(now.getFullYear(),now.getMonth()+1,0);
  document.getElementById('ch-start').value=fmt(now);
  document.getElementById('ch-end').value=fmt(endMonth);
  _challengeVis='public';
  document.getElementById('ch-group-select-wrap').style.display='none';
  document.querySelectorAll('.ch-vis-btn').forEach(b=>{
    const on=b.dataset.v==='public';
    b.style.borderColor=on?'var(--ac)':'var(--bdr)';
    b.style.color=on?'var(--ac)':'var(--muted)';
  });
  updateChallengeTypeHint();
  openModal('modal-create-challenge');
}
async function createChallenge(){
  const title=document.getElementById('ch-title').value.trim();
  const desc=document.getElementById('ch-desc').value.trim();
  const type=document.getElementById('ch-type').value;
  const target=parseInt(document.getElementById('ch-target').value);
  const start=document.getElementById('ch-start').value;
  const end=document.getElementById('ch-end').value;
  if(!title){toast('Donne un titre au défi','err');return;}
  if(!target||target<1){toast('Définis un objectif valide','err');return;}
  if(!start||!end){toast('Choisis les dates','err');return;}
  if(end<start){toast('La date de fin doit être après le début','err');return;}
  let groupId=null;
  if(_challengeVis==='group'){
    groupId=document.getElementById('ch-group-select').value;
    if(!groupId){toast('Choisis un groupe','err');return;}
  }
  try{
    const unite=(document.getElementById('ch-unit')?.value||'').trim();
    const row={creator_id:U.id,title,description:desc||null,type,target,
      start_date:start,end_date:end,
      is_public:_challengeVis==='public',
      group_id:groupId};
    if(type==='free'&&unite)row.unit=unite;
    let{data,error}=await sb.from('challenges').insert(row).select().single();
    // Colonne « unit » absente en base : on réessaie sans, rien ne casse
    if(error&&row.unit){delete row.unit;({data,error}=await sb.from('challenges').insert(row).select().single());}
    if(error){toast('Erreur : '+error.message,'err');return;}
    // Le créateur rejoint automatiquement son défi
    await sb.from('challenge_participants').insert({challenge_id:data.id,user_id:U.id,progress:0});
    toast('🔥 Défi créé !','ok');
    closeModal('modal-create-challenge');
    loadChallenges();
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))loadInbox(); }catch(e){}
  }catch(e){toast('Erreur lors de la création','err');}
}
async function loadChallenges(){
  const list=document.getElementById('challenges-list');
  if(!list||!U)return;
  try{
    // Défis publics OU ceux où je participe OU que j'ai créés
    const{data:parts}=await sb.from('challenge_participants').select('challenge_id,status').eq('user_id',U.id);
    const myIds=(parts||[]).map(p=>p.challenge_id);
    const invitedIds=(parts||[]).filter(p=>p.status==='invited').map(p=>p.challenge_id);
    // Mes groupes (pour voir leurs défis)
    const{data:myGroups}=await sb.from('group_members').select('group_id').eq('user_id',U.id).eq('status','member');
    const myGroupIds=(myGroups||[]).map(g=>g.group_id);
    let query=sb.from('challenges').select('*').order('created_at',{ascending:false}).limit(50);
    const{data:challenges,error}=await query;
    if(error){list.innerHTML='<div style="font-size:12px;color:#ef4444;text-align:center;padding:12px 0;">Erreur de chargement</div>';return;}
    // Filtrer : public, créé par moi, je participe, ou défi d'un de mes groupes
    const visible=(challenges||[]).filter(c=>
      (c.is_public&&!c.group_id) || c.creator_id===U.id || myIds.includes(c.id) || (c.group_id&&myGroupIds.includes(c.group_id))
    );
    if(!visible.length){
      list.innerHTML='<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px 0;">Aucun défi pour le moment.<br>Crée le premier ! 🔥</div>';
      return;
    }
    const today=new Date().toISOString().slice(0,10);
    list.innerHTML=visible.map(c=>{
      const invited=invitedIds.includes(c.id);
      const joined=myIds.includes(c.id)&&!invited;
      const ended=c.end_date<today;
      const typeLabel=(c.type==='free'&&c.unit)?c.unit:({sessions:'séances',days:'jours actifs',free:'objectif'}[c.type]||'');
      const inviteBar=invited?`<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="flex:1;font-size:12px;font-weight:700;color:var(--ac);">Invitation reçue</span>
        <button onclick="acceptChallengeInvite('${c.id}')" style="padding:6px 12px;background:var(--ac);color:#fff;border-radius:8px;font-size:12px;font-weight:700;">Accepter</button>
        <button onclick="declineChallengeInvite('${c.id}')" style="padding:6px 12px;background:var(--surf2);border:1px solid var(--bdr);color:var(--muted);border-radius:8px;font-size:12px;font-weight:700;">Refuser</button>
      </div>`:'';
      return `<div onclick="openChallengeDetail('${c.id}')" style="cursor:pointer;background:var(--surf);border:none;${ended?'':'box-shadow:inset 0 0 0 1.5px var(--ac);'}border-radius:16px;padding:16px 18px;margin-bottom:10px;">${inviteBar}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div style="font-size:16px;font-weight:600;color:var(--txt);letter-spacing:-.01em;">${c.title}</div>
          ${ended?'<span style="font-size:12px;color:var(--muted);background:var(--surf2);padding:4px 10px;border-radius:12px;white-space:nowrap;">Terminé</span>':joined?'<span style="font-size:12px;color:var(--green);background:rgba(48,209,88,.14);padding:4px 10px;border-radius:12px;white-space:nowrap;">✓ Inscrit</span>':c.is_public?'<span style="font-size:14px;color:var(--ac);white-space:nowrap;">Rejoindre ›</span>':'<span style="font-size:12px;color:var(--muted);">🔒</span>'}
        </div>
        ${c.description?`<div style="font-size:14px;color:var(--muted);margin-top:4px;letter-spacing:-.006em;">${c.description}</div>`:''}
        ${c.group_id?'<div style="font-size:12px;color:#A78BFA;margin-top:6px;">👥 Défi de groupe</div>':''}
        <div style="font-size:13px;color:var(--muted);margin-top:8px;">🎯 ${c.target} ${typeLabel} · jusqu'au ${c.end_date.slice(5).split('-').reverse().join('/')}</div>
      </div>`;
    }).join('');
  }catch(e){
    list.innerHTML='<div style="font-size:12px;color:#ef4444;text-align:center;padding:12px 0;">Erreur</div>';
  }
}
function computeChallengeProgress(challenge,days){
  if(challenge.type==='free')return null; // manuel
  const start=challenge.start_date, end=challenge.end_date;
  const allSessions=[];
  (days||[]).forEach(d=>(d.exercises||[]).forEach(e=>(e.sessions||[]).forEach(s=>{
    if(s.date>=start&&s.date<=end)allSessions.push(s.date);
  })));
  if(challenge.type==='sessions')return allSessions.length;
  if(challenge.type==='days')return new Set(allSessions).size;
  return 0;
}
async function openChallengeDetail(challengeId){
  const content=document.getElementById('challenge-detail-content');
  content.innerHTML='<div style="padding:30px;text-align:center;color:var(--muted);">Chargement…</div>';
  openModal('modal-challenge-detail');
  try{
    const{data:c}=await sb.from('challenges').select('*').eq('id',challengeId).single();
    if(!c){content.innerHTML='<div style="padding:20px;color:var(--muted);">Défi introuvable</div>';return;}
    const{data:participants}=await sb.from('challenge_participants').select('user_id,progress,profiles(username,avatar_url)').eq('challenge_id',challengeId);
    const parts=participants||[];
    const joined=parts.some(p=>p.user_id===U.id);
    const today=new Date().toISOString().slice(0,10);
    const ended=c.end_date<today;
    const typeLabel=(c.type==='free'&&c.unit)?c.unit:({sessions:'séances',days:'jours actifs',free:'objectif'}[c.type]||'');

    // Mettre à jour ma progression automatiquement si type auto et inscrit
    if(joined&&c.type!=='free'){
      const myProgress=computeChallengeProgress(c,ST.days);
      const myPart=parts.find(p=>p.user_id===U.id);
      if(myPart&&myPart.progress!==myProgress){
        const before=myPart.progress||0;
        myPart.progress=myProgress;
        sb.from('challenge_participants').update({progress:myProgress}).eq('challenge_id',challengeId).eq('user_id',U.id);
        // Prévenir ceux que je viens de doubler (uniquement à la hausse)
        if(myProgress>before){
          parts.filter(p=>p.user_id!==U.id&&(p.progress||0)>=before&&(p.progress||0)<myProgress)
               .forEach(p=>pushNotif(p.user_id,'challenge_overtake',`${myName()} t'a dépassé dans « ${c.title} » 🔥`));
        }
      }
    }

    // ── Bonus XP de réussite (une seule fois par défi) ──
    if(joined){
      const myPart=parts.find(p=>p.user_id===U.id);
      const myDone=myPart&&myPart.progress>=c.target;
      if(!ST.challengesRewarded)ST.challengesRewarded=[];
      if(myDone&&!ST.challengesRewarded.includes(challengeId)){
        // Bonus individuel proportionnel à la difficulté (cible), borné
        const indivBonus=Math.min(200,50+c.target*5);
        ST.challengesRewarded.push(challengeId);
        // Bonus collectif si TOUT le monde a réussi
        const everyone=parts.length>1 && parts.every(p=>p.progress>=c.target);
        const groupBonus=everyone?50:0;
        addXp(indivBonus+groupBonus);
        saveState();
        updateGamification();renderRankBadge();
        checkAchievements();
        // Si c'est un défi de groupe, poster un message auto dans le chat du groupe
        if(c.group_id){
          const myName=(P&&P.username)?P.username:'Un membre';
          postChallengeWinMessage(c.group_id,`${myName} a réussi le défi "${c.title}" ! 💪`);
        }
        setTimeout(()=>{
          toast(`🎉 Défi réussi ! +${indivBonus} XP${groupBonus?` · +${groupBonus} XP bonus groupe 🤝`:''}`,'ok');
        },400);
      }
    }

    // Classement par % d'objectif atteint (motivation saine : on plafonne à 100%)
    const ranked=parts.map(p=>({
      ...p,
      pct:Math.min(100,Math.round((p.progress/c.target)*100)),
      name:p.profiles?.username||'—',
      avatar:p.profiles?.avatar_url
    })).sort((a,b)=>b.pct-a.pct);

    // Progression collective
    const totalProgress=parts.reduce((a,p)=>a+Math.min(p.progress,c.target),0);
    const collectiveMax=c.target*parts.length;
    const collectivePct=collectiveMax?Math.round((totalProgress/collectiveMax)*100):0;

    const ICO={
      plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
    };
    // Les actions sont regroupées dans une seule carte, avec une hiérarchie
    // claire : l'action utile en violet, la destructive en rouge, séparées.
    let manual='',rows=[],note='';
    if(ended){
      note='<div class="cd-note">🏁 Ce défi est terminé</div>';
    }else if(joined){
      if(c.type==='free'){
        const myPart=parts.find(p=>p.user_id===U.id);
        manual=`<div class="cd-sec">Ma progression</div><div class="cd-card pad">
          <div style="display:flex;gap:8px;">
            <input class="finp" type="number" id="ch-manual-progress" value="${myPart?.progress||0}" min="0" max="${c.target}" style="flex:1;">
            <button onclick="updateManualProgress('${challengeId}')" style="padding:0 18px;background:var(--ac);color:#fff;border-radius:11px;font-weight:700;">OK</button>
          </div></div>`;
      }
      rows.push(`<button class="cd-act prim" onclick="openInviteSheet('${challengeId}')">Inviter un ami${ICO.plus}</button>`);
      rows.push(`<button class="cd-act" onclick="leaveChallenge('${challengeId}')">Quitter le défi${ICO.out}</button>`);
    }else if(c.is_public){
      rows.push(`<button class="cd-act prim" onclick="joinChallenge('${challengeId}')">Rejoindre ce défi 🔥</button>`);
    }else{
      note='<div class="cd-note">🔒 Défi sur invitation</div>';
    }
    if(c.creator_id===U.id){
      rows.push(`<button class="cd-act dgr" onclick="deleteChallenge('${challengeId}')">Supprimer le défi</button>`);
    }
    const actionBtn=manual+note+(rows.length
      ?'<div class="cd-sec">Gérer</div><div class="cd-card">'+rows.join('<div class="cd-hair"></div>')+'</div>'
      :'');

    content.innerHTML=`
      <div class="cd-hd">
        <div class="cd-cover${c.creator_id===U.id?' editable':''}" ${c.creator_id===U.id?`onclick="pickCoverPhoto('challenge','${challengeId}')"`:''}>
          ${c.image_url
            ? `<img src="${c.image_url}" alt="">`
            : `<span>${escapeHtml((c.title||'?')[0]).toUpperCase()}</span>`}
          ${c.creator_id===U.id?'<i class="cd-cover-edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="3.2"/><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/></svg></i>':''}
        </div>
        <h2>${escapeHtml(c.title)}${c.creator_id===U.id?`<button class="cd-rename" onclick="renameEntity('challenge','${challengeId}','${escapeHtml(c.title||'').replace(/'/g,"\\'")}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>`:''}</h2>
        ${c.description?`<div class="cd-meta">${escapeHtml(c.description)}</div>`:''}
        <div class="cd-meta">${c.target} ${typeLabel} · du ${c.start_date.slice(5).split('-').reverse().join('/')} au ${c.end_date.slice(5).split('-').reverse().join('/')}</div>
        <span class="cd-pill">🎯 ${parts.length} participant${parts.length>1?'s':''}</span>
      </div>

      <div class="cd-sec">Progression</div>
      <div class="cd-card pad">
        <div class="cd-prog"><b>${collectivePct}%</b><span>progression collective</span></div>
        <div class="cd-track"><i style="width:${collectivePct}%"></i></div>
      </div>

      <div class="cd-sec">Classement</div>
      <div class="cd-card">${ranked.map((p,idx)=>{
        const nom=displayName(p.user_id,(p.profiles||{}).username);
        const moi=p.user_id===U.id;
        const medal=['🥇','🥈','🥉'][idx]||(idx+1);
        const av=(p.profiles||{}).avatar_url
          ? `<div class="av"><img src="${(p.profiles||{}).avatar_url}" alt=""></div>`
          : `<div class="av" style="background:${userGrad(nom)}">${escapeHtml((nom||'?')[0]).toUpperCase()}</div>`;
        return `<div class="cd-p${moi?' me':''}">
          <span class="rk">${medal}</span>${av}
          <div class="nm">${escapeHtml(nom)}${moi?' (toi)':''}
            <div class="mini"><i style="width:${Math.min(100,p.pct)}%;background:${userColor(nom)}"></i></div>
          </div>
          <span class="val" style="${p.pct>=100?'color:#30D158;':''}">${p.progress}/${c.target}${p.pct>=100?' ✓':''}</span>
        </div>`;
      }).join('<div class="cd-hair"></div>')}</div>

      ${actionBtn}`;
  }catch(e){
    content.innerHTML='<div style="padding:20px;color:#ef4444;">Erreur de chargement</div>';
  }
}
async function joinChallenge(challengeId){
  try{
    const myProgress=0;
    let{error}=await sb.from('challenge_participants').insert({challenge_id:challengeId,user_id:U.id,progress:myProgress,status:'joined'});
    // Déjà invité : on transforme l'invitation en participation
    if(error)({error}=await sb.from('challenge_participants').update({status:'joined'}).eq('challenge_id',challengeId).eq('user_id',U.id));
    if(error){toast('Erreur : '+error.message,'err');return;}
    // Prévenir le créateur du défi
    try{
      const{data:ch}=await sb.from('challenges').select('creator_id,title').eq('id',challengeId).maybeSingle();
      if(ch&&ch.creator_id)pushNotif(ch.creator_id,'challenge_join',`${myName()} a rejoint « ${ch.title} » 🔥`);
    }catch(e){}
    toast('🔥 Tu as rejoint le défi !','ok');
    openChallengeDetail(challengeId);
    loadChallenges();
  }catch(e){toast('Erreur','err');}
}
async function leaveChallenge(challengeId){
  try{
    await sb.from('challenge_participants').delete().eq('challenge_id',challengeId).eq('user_id',U.id);
    toast('Tu as quitté le défi','ok');
    closeModal('modal-challenge-detail');
    loadChallenges();
    // La messagerie affiche aussi les défis : elle doit suivre tout de suite
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
    refreshInboxBadge();
  }catch(e){toast('Erreur','err');}
}
async function updateManualProgress(challengeId){
  const val=parseInt(document.getElementById('ch-manual-progress').value)||0;
  try{
    // On lit l'état des participants AVANT la mise à jour, pour savoir qui on double
    const{data:parts}=await sb.from('challenge_participants').select('user_id,progress').eq('challenge_id',challengeId);
    const before=(parts||[]).find(p=>p.user_id===U.id)?.progress||0;
    await sb.from('challenge_participants').update({progress:val}).eq('challenge_id',challengeId).eq('user_id',U.id);
    if(val>before){
      try{
        const{data:ch}=await sb.from('challenges').select('title').eq('id',challengeId).maybeSingle();
        (parts||[]).filter(p=>p.user_id!==U.id&&(p.progress||0)>=before&&(p.progress||0)<val)
          .forEach(p=>pushNotif(p.user_id,'challenge_overtake',`${myName()} t'a dépassé dans « ${ch?.title||'un défi'} » 🔥`));
      }catch(e){}
    }
    toast('✓ Progression mise à jour','ok');
    openChallengeDetail(challengeId);
    // La ligne du défi dans la messagerie affiche la progression : elle doit suivre
    loadChallenges();
    try{ if(document.getElementById('fs-inbox').classList.contains('on'))await loadInbox(); }catch(e){}
  }catch(e){toast('Erreur','err');}
}
async function deleteChallenge(challengeId){
  if(!confirm('Supprimer définitivement ce défi ?'))return;
  try{
    await sb.from('challenge_participants').delete().eq('challenge_id',challengeId);
    const{error}=await sb.from('challenges').delete().eq('id',challengeId);
    if(error){toast('Erreur : '+error.message,'err');return;}
    toast('Défi supprimé','ok');
    closeModal('modal-challenge-detail');
    loadChallenges();loadFeed();
  }catch(e){toast('Erreur','err');}
}

// ── Publier ma progression sans ouvrir le défi ────────────────────
// Jusqu'ici, la progression n'était écrite en base que lorsqu'on ouvrait le
// détail : si quelqu'un enregistrait une séance sans y aller, son avance
// restait invisible pour les autres. On la publie donc à l'enregistrement.
async function publishMyChallengeProgress(){
  if(!U||!sb)return;
  try{
    const today=new Date().toISOString().slice(0,10);
    const{data:mine}=await sb.from('challenge_participants')
      .select('challenge_id,progress,status').eq('user_id',U.id);
    const actifs=(mine||[]).filter(p=>p.status!=='invited');
    if(!actifs.length)return;
    const{data:chs}=await sb.from('challenges').select('id,type,target,start_date,end_date')
      .in('id',actifs.map(p=>p.challenge_id));
    for(const c of (chs||[])){
      if(c.end_date<today)continue;                 // défi terminé : on ne touche plus
      const val=computeChallengeProgress(c,ST.days);
      if(val===null)continue;                       // objectif libre : saisi à la main
      const p=actifs.find(x=>x.challenge_id===c.id);
      if(p&&p.progress===val)continue;              // rien de nouveau
      await sb.from('challenge_participants').update({progress:val})
        .eq('challenge_id',c.id).eq('user_id',U.id);
      // Prévenir ceux que l'on vient de doubler
      try{
        const before=p?p.progress||0:0;
        if(val>before){
          const{data:autres}=await sb.from('challenge_participants')
            .select('user_id,progress').eq('challenge_id',c.id).neq('user_id',U.id)
            .gte('progress',before).lt('progress',val);
          const{data:info}=await sb.from('challenges').select('title').eq('id',c.id).maybeSingle();
          (autres||[]).slice(0,5).forEach(a=>pushNotif(a.user_id,'challenge_overtake',
            `${myName()} t'a dépassé dans « ${info?.title||'un défi'} » 🔥`));
        }
      }catch(e){}
    }
  }catch(e){}
}
