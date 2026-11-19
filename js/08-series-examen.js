// ── Séries de questions, mode examen, comparaison du corrigé
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
// ══════════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════════
const MOTIV_OK=["Bien joué !","Tu vois, tu savais.","C'est ça !","Parfait","Continue 🔥"];
const MOTIV_KO=["Pas grave, retiens l'explication.","C'est en révisant qu'on apprend.","La prochaine fois ça rentrera."];

// Mélange les réponses d'un QCM et recale l'index de la bonne.
// Copie : on ne touche pas au contenu d'origine.
function melangerQCM(item){
  if(!item || !Array.isArray(item.opts)) return item;
  const ordre = item.opts.map((_,i)=>i);
  for(let i = ordre.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  }
  return Object.assign({}, item, {
    opts: ordre.map(i=>item.opts[i]),
    c: ordre.indexOf(item.c)
  });
}

// ══════════════════════════════════════════════════
// MODE EXAMEN : un sujet tiré au hasard, un chrono, la note à la fin
// Les réponses ne touchent pas à ce qui est validé dans les QCM.
// ══════════════════════════════════════════════════
let exam = null;
const EXAMEN = { subj:null, sel:null, nb:20 };
const SEC_PAR_QUESTION = 30;
function examNotes(){ try{ return JSON.parse(localStorage.getItem("examNotes") || "{}") || {}; }catch(_){ return {}; } }
function noteFr(n){ return String(n).replace(".", ","); }
function melange(a){ const b = a.slice(); for(let i = b.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function examSources(subj){
  const out = [];
  chapitresAReviser(subj).forEach(c=>{
    const n = exos(subj, "qcm").filter(x=>x && x.ch === c.label).length;
    if(n) out.push({ id:"ch:" + c.label, nom:c.label, type:c.type, n });
  });
  const na = (subj.auteurs && subj.auteurs.length) ? quizAuteurs(subj).length : 0;
  if(na) out.push({ id:"auteurs", nom:"Auteurs", type:"aut", n:na });
  return out;
}
function dureeFr(sec){ const m = Math.round(sec / 60); return m < 1 ? sec + " s" : m + " min"; }
function renderExamenChoix(){
  const src = examSources(curSubj);
  if(EXAMEN.subj !== curSubj.id || !EXAMEN.sel){ EXAMEN.subj = curSubj.id; EXAMEN.sel = new Set(src.map(x=>x.id)); }
  document.getElementById("qcmchoix-eyebrow").textContent = curSubj.title;
  document.getElementById("qcmchoix-titre").textContent = "Mode examen";
  document.getElementById("qcmchoix-sub").textContent = "Comme le jour du partiel : un chrono, pas de correction pendant, une note sur 20 à la fin. Ça ne change pas ce qui est validé dans tes QCM.";
  const box = document.getElementById("qcmchoix-inner"); box.innerHTML = "";
  const dispo = ()=>src.filter(x=>EXAMEN.sel.has(x.id)).reduce((k,x)=>k + x.n, 0);
  const go = el("button","btn ex-go"); go.type = "button";
  const maj = ()=>{
    const d = dispo(), n = Math.min(EXAMEN.nb, d);
    go.disabled = !n;
    go.textContent = n ? "Commencer · " + n + " questions · " + dureeFr(n * SEC_PAR_QUESTION) : "Choisis au moins un cours";
  };
  // nombre de questions
  const g1 = el("div","qc-group"); g1.textContent = "Nombre de questions"; box.appendChild(g1);
  const chips = el("div","ex-chips");
  [10,20,25].forEach(n=>{
    const c = el("button","ex-chip" + (EXAMEN.nb === n ? " on" : "")); c.type = "button"; c.textContent = n;
    c.addEventListener("click",()=>{ haptic(); EXAMEN.nb = n; chips.querySelectorAll(".ex-chip").forEach(x=>x.classList.toggle("on", x === c)); maj(); });
    chips.appendChild(c);
  });
  box.appendChild(chips);
  // sur quoi
  const g2 = el("div","qc-group ex-groupe"); g2.innerHTML = `<span>Sur quoi</span>`;
  const tout = el("button","ex-tout"); tout.type = "button";
  const majTout = ()=>{ tout.textContent = EXAMEN.sel.size === src.length ? "Tout enlever" : "Tout prendre"; };
  g2.appendChild(tout); box.appendChild(g2);
  const lignes = [];
  src.forEach(x=>{
    const pc = x.type === "aut" ? { court:"👤 Auteurs", titre:"" } : partiesChapitre(x.nom);
    const r = el("button","ex-row" + (EXAMEN.sel.has(x.id) ? " on" : "")); r.type = "button";
    r.innerHTML = `<span class="ex-check">${COCHE_SVG}</span><span class="ex-row-txt"><div class="ex-row-nom">${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre) : ""}</div>
      <div class="ex-row-sub">${x.n} question${x.n > 1 ? "s" : ""}</div></span>`;
    r.addEventListener("click",()=>{ haptic(); if(EXAMEN.sel.has(x.id)) EXAMEN.sel.delete(x.id); else EXAMEN.sel.add(x.id); r.classList.toggle("on"); majTout(); maj(); });
    lignes.push([r, x.id]); box.appendChild(r);
  });
  tout.addEventListener("click",()=>{
    haptic();
    const tous = EXAMEN.sel.size === src.length;
    EXAMEN.sel = new Set(tous ? [] : src.map(x=>x.id));
    lignes.forEach(([r,id])=>r.classList.toggle("on", EXAMEN.sel.has(id))); majTout(); maj();
  });
  majTout(); maj();
  go.addEventListener("click",()=>{ haptic(); startExamen(); });
  box.appendChild(go);
  showScreen("qcmchoix");
}
function startExamen(){
  const pool = [];
  EXAMEN.sel.forEach(id=>itemsDuScope(curSubj, "qcm", id).forEach(x=>{ if(x.item && Array.isArray(x.item.opts)) pool.push(Object.assign(melangerQCM(x.item), { _key:cardKey(curSubj.id, "qcm", x.item, x.i) })); }));
  const qs = melange(pool).slice(0, EXAMEN.nb);
  if(!qs.length) return;
  sessionFil = null;
  exam = { qs, rep:new Array(qs.length).fill(null), i:0, duree:qs.length * SEC_PAR_QUESTION, t0:Date.now(), fini:false };
  clearInterval(timerInt);
  timerInt = setInterval(tickExamen, 1000);
  showScreen("session");
  renderExamen();
}
function resteExamen(){ return Math.max(0, exam.duree - Math.floor((Date.now() - exam.t0) / 1000)); }
function tickExamen(){
  if(!exam || exam.fini) return;
  const r = resteExamen();
  const sc = document.getElementById("sess-score");
  sc.textContent = "⏱ " + Math.floor(r / 60) + ":" + String(r % 60).padStart(2, "0");
  sc.className = "nav-score ex-chrono" + (r <= 60 ? " red" : "");
  if(r <= 0) finirExamen(true);
}
function renderExamen(){
  const n = exam.qs.length, i = exam.i, q = exam.qs[i];
  document.getElementById("sess-pos").textContent = "Examen · " + (i + 1) + " / " + n;
  document.getElementById("sess-prog").style.width = (exam.rep.filter(x=>x !== null).length / n * 100) + "%";
  tickExamen();
  const body = document.getElementById("sess-body"); body.innerHTML = "";
  const wrap = el("div","rise");
  const qb = el("div","q-box"); qb.innerHTML = `<div class="q-text">${esc(q.q)}</div>`; wrap.appendChild(qb);
  const opts = el("div","opts");
  q.opts.forEach((o,k)=>{
    const b = el("button","opt" + (exam.rep[i] === k ? " choisie" : ""));
    b.innerHTML = `<span class="opt-letter">${String.fromCharCode(65 + k)}</span><span>${esc(o)}</span>`;
    b.addEventListener("click",()=>{
      haptic(); exam.rep[i] = k; renderExamen();
      // on passe tout seul à la suivante, on peut toujours revenir
      if(i < n - 1) setTimeout(()=>{ if(exam && !exam.fini && exam.i === i){ exam.i = i + 1; renderExamen(); } }, 350);
    });
    opts.appendChild(b);
  });
  wrap.appendChild(opts);
  const row = el("div","btn-row");
  const prev = el("button","btn ghost"); prev.textContent = "‹ Précédente"; prev.disabled = i === 0;
  prev.addEventListener("click",()=>{ haptic(); exam.i = i - 1; renderExamen(); });
  const next = el("button","btn" + (i < n - 1 ? " ghost" : ""));
  next.textContent = i < n - 1 ? "Suivante ›" : "Terminer";
  next.addEventListener("click",()=>{
    haptic();
    if(i < n - 1){ exam.i = i + 1; renderExamen(); return; }
    const vides = exam.rep.filter(x=>x === null).length;
    if(vides) confirmer("Terminer l'examen ?", vides + " question" + (vides > 1 ? "s sont" : " est") + " sans réponse.", "Terminer", ()=>finirExamen(false));
    else finirExamen(false);
  });
  row.append(prev, next); wrap.appendChild(row);
  // toutes les questions, pour sauter de l'une à l'autre
  const grille = el("div","ex-grille");
  exam.qs.forEach((_,k)=>{
    const b = el("button",(exam.rep[k] !== null ? "fait" : "") + (k === i ? " ici" : "")); b.type = "button"; b.textContent = k + 1;
    b.addEventListener("click",()=>{ haptic(); exam.i = k; renderExamen(); });
    grille.appendChild(b);
  });
  wrap.appendChild(grille);
  body.appendChild(wrap);
}
function finirExamen(tempsEcoule){
  clearInterval(timerInt);
  exam.fini = true;
  const n = exam.qs.length;
  const bonnes = exam.qs.filter((q,k)=>exam.rep[k] === q.c).length;
  const note = Math.round(bonnes / n * 40) / 2;
  const duree = Math.min(exam.duree, Math.floor((Date.now() - exam.t0) / 1000));
  try{ const N = examNotes(); N[curSubj.id] = { note, date:Date.now() }; localStorage.setItem("examNotes", JSON.stringify(N)); }catch(_){}
  document.getElementById("sess-pos").textContent = "Résultat";
  const sc = document.getElementById("sess-score"); sc.className = "nav-score"; sc.textContent = "";
  document.getElementById("sess-prog").style.width = "100%";
  const body = document.getElementById("sess-body"); body.innerHTML = "";
  const msg = note >= 16 ? "Très bien, tu es prête." : note >= 12 ? "Bien. Revois les quelques erreurs ci-dessous." : note >= 10 ? "C'est la moyenne. Encore un tour sur les points ratés." : "Pas encore. Relis les cours des questions ratées, puis retente.";
  const wrap = el("div","results");
  wrap.innerHTML = `<div class="ex-note">${noteFr(note)}<small> / 20</small></div>
    <p class="results-msg">${msg}</p>
    <p class="res-scope">${bonnes} bonne${bonnes > 1 ? "s" : ""} réponse${bonnes > 1 ? "s" : ""} sur ${n} · ${tempsEcoule ? "temps écoulé" : Math.floor(duree / 60) + " min " + String(duree % 60).padStart(2, "0") + " s"}</p>`;
  const erreurs = exam.qs.map((q,k)=>({ q, r:exam.rep[k] })).filter(x=>x.r !== x.q.c);
  // elles rejoignent « Mes erreurs », dans les QCM
  erreurs.forEach(({q})=>{ if(q._key) ERREXAM[q._key] = Date.now(); });
  if(erreurs.length) errExamSave();
  if(erreurs.length){
    const t = el("div","results-detail-label"); t.textContent = "À revoir (" + erreurs.length + ")"; t.style.margin = "22px 0 10px";
    wrap.appendChild(t);
    erreurs.forEach(({q,r})=>{
      const d = el("div","ex-err");
      d.innerHTML = `<div class="ex-err-q">${esc(q.q)}</div>
        <div class="ex-err-l ko">✗ ${r === null ? "Pas de réponse" : esc(q.opts[r])}</div>
        <div class="ex-err-l ok">✓ ${esc(q.opts[q.c])}</div>` + (r !== null && q.w && q.w[q.opts[r]] ? `<div class="ex-err-e"><b>Pourquoi pas :</b> ${esc(q.w[q.opts[r]])}</div>` : "") + (q.e ? `<div class="ex-err-e">${q.w ? "<b>Pourquoi la bonne :</b> " : ""}${esc(q.e)}</div>` : "");
      wrap.appendChild(d);
    });
  }
  const row = el("div","btn-row");
  const b1 = el("button","btn ghost"); b1.textContent = "Réglages";
  b1.addEventListener("click",()=>{ haptic(); exam = null; renderExamenChoix(); });
  const b2 = el("button","btn"); b2.textContent = "🔁 Un autre sujet";
  b2.addEventListener("click",()=>{ haptic(); startExamen(); });
  row.append(b1, b2); wrap.appendChild(row);
  body.appendChild(wrap);
  window.scrollTo(0, 0);
}
function startSession(m){
  sessionMix = null;
  exam = null; document.getElementById("sess-score").className = "nav-score";
  curMode=m; idx=0; score=0; answers=[]; rateesSession = new Set(); sessionFil = null;
  flipped=false; selOpt=null; confirmed=false; showAns=false; showHint=false; lastMotiv=""; oqEcrit="";
  globalSession = false;
  sessionScope = scopeCourant();
  // Chaque entrée porte sa matière + son mode (permet aussi les sessions multi-matières).
  const all = itemsDuScope(curSubj, m, sessionScope).map(({item,i})=>({
    // la clé se calcule sur la question d'origine, le mélange ne la perturbe pas
    item: (m === "qcm" || m === "tr") ? melangerQCM(item) : item,
    mode:m, subj:curSubj, key: cardKey(curSubj.id,m,item,i)
  }));
  if(!all.length) return;
  if(sessionScope === "erreurs"){
    queue = shuffle(all).slice(0, SERIE_MAX);
    sessionDueOnly = false;
  } else if(sessionScope === "grand"){
    // tout dedans : ce qui n'est pas validé d'abord, puis le reste
    queue = shuffle(all.filter(x=> !estAcquise(x.key) )).concat(shuffle(all.filter(x=> estAcquise(x.key) ))).slice(0, SERIE_MAX);
    sessionDueOnly = false;
  } else if(sessionScope !== "all"){
    // un chapitre : on reprend ce qui n'est pas encore validé, sinon tout en libre
    const aValider = shuffle(all.filter(x=> !estAcquise(x.key) ));
    queue = (aValider.length ? aValider : shuffle(all)).slice(0, SERIE_MAX);
    sessionDueOnly = false;
  } else {
    const due    = shuffle(all.filter(x=>  srsIsDue(x.key) ));
    const notDue = shuffle(all.filter(x=> !srsIsDue(x.key) ));
    queue = (due.length ? due : notDue).slice(0, SERIE_MAX);
    sessionDueOnly = due.length > 0;
  }
  clearInterval(timerInt);
  showScreen("session");
  renderSess();
}


// ── « Réviser cette matière » : une série qui mélange les exercices ──
// Surtout des QCM (ils font avancer « QCM validés »), plus quelques flashcards et textes à trous,
// glissés entre eux. Ce qui n'est pas encore validé passe d'abord. Pas de questions ouvertes : trop longues.
function startRevisionMatiere(subj, chs){
  exam = null; document.getElementById("sess-score").className = "nav-score";
  idx=0; score=0; answers=[]; rateesSession = new Set(); sessionFil = null;
  flipped=false; selOpt=null; confirmed=false; showAns=false; showHint=false; lastMotiv=""; oqEcrit="";
  globalSession = false; sessionScope = "grand"; sessionMix = subj.id; curSubj = subj; MIX_CHS = chs || null;
  const prend = m=>{
    const all = itemsDuScope(subj, m, "grand").filter(({item})=>!chs || !chs.length || chs.includes(item.ch)).map(({item,i})=>({ item:(m === "qcm" || m === "tr") ? melangerQCM(item) : item, mode:m, subj, key:cardKey(subj.id, m, item, i) }));
    return shuffle(all.filter(x=>!estAcquise(x.key))).concat(shuffle(all.filter(x=>estAcquise(x.key))));
  };
  const Q = prend("qcm"), F = prend("fc"), T = prend("tr");
  let nF = Math.min(5, F.length), nT = Math.min(5, T.length);
  const nQ = Math.min(Q.length, SERIE_MAX - nF - nT);
  // pas assez de QCM : on complète avec les autres exercices
  let reste = SERIE_MAX - nQ - nF - nT;
  while(reste > 0 && (nF < F.length || nT < T.length)){ if(nF < F.length){ nF++; reste--; } if(reste > 0 && nT < T.length){ nT++; reste--; } }
  // les autres exercices alternent, puis se répartissent régulièrement entre les QCM
  const autres = []; const f = F.slice(0, nF), t = T.slice(0, nT);
  while(f.length || t.length){ if(f.length) autres.push(f.shift()); if(t.length) autres.push(t.shift()); }
  const qs = Q.slice(0, nQ), total = qs.length + autres.length;
  queue = [];
  const pas = autres.length ? total / autres.length : 0;
  let prochain = pas ? pas / 2 : Infinity;
  for(let k = 0; k < total; k++){
    if(autres.length && (k >= prochain || !qs.length)){ queue.push(autres.shift()); prochain += pas; }
    else queue.push(qs.shift());
  }
  queue = queue.filter(Boolean);
  if(!queue.length) return false;
  sessionDueOnly = false; curMode = queue[0].mode;
  clearInterval(timerInt);
  showScreen("session");
  renderSess();
  return true;
}
// ── Session globale : toutes les cartes dues, toutes matières confondues ──
function startGlobalSession(){
  sessionMix = null;
  exam = null; document.getElementById("sess-score").className = "nav-score";
  idx=0; score=0; answers=[]; rateesSession = new Set(); sessionFil = null;
  flipped=false; selOpt=null; confirmed=false; showAns=false; showHint=false; lastMotiv=""; oqEcrit="";
  globalSession = true;
  sessionScope = "all";
  const { prio, all, neuf } = choixRevision();
  if(!all.length && !prio.length && !neuf.length) return false;
  queue = shuffle(prio).concat(shuffle(all), shuffle(neuf)).slice(0, SERIE_MAX);
  sessionDueOnly = true;
  clearInterval(timerInt);
  showScreen("session");
  renderSess();
  return true;
}
// Ce que la révision du jour va proposer : les chapitres des contrôles proches d'abord, puis ce qui est à revoir.
function choixRevision(){
  const all = [], prio = [], neuf = [];
  const semIds = new Set(hmMatieresSem().map(x=>x.id));
  // un contrôle dans les 14 jours : ses chapitres passent en premier (même pas encore « dus »)
  const cibles = {}, quand = {};
  try{
    pendingAlerts(true, false).forEach(e=>{
      const N = evNote(e) || {}; if(typeDevoir(N) !== "controle" || N.done) return;
      const j = hmJoursAvant(e.start); if(j < 0 || j > 14) return;
      const sj = matiereDeNote(e, N); if(!sj) return;
      const chs = Array.isArray(N.chs) && N.chs.length ? N.chs : null;
      if(!(sj.id in quand) || e.start < quand[sj.id]) quand[sj.id] = e.start;
      if(!(sj.id in cibles)) cibles[sj.id] = chs;
      else if(cibles[sj.id] === null || !chs) cibles[sj.id] = null;   // une fois « toute la matière », ça le reste
      else cibles[sj.id] = cibles[sj.id].concat(chs);
    });
  }catch(err){}
  SUBJECTS.forEach(s=>{
    ["fc","qcm","oq","tr"].forEach(m=>{
      exos(s, m).forEach((item,i)=>{
        const key = cardKey(s.id,m,item,i);
        const visee = m !== "oq" && (s.id in cibles) && (!cibles[s.id] || cibles[s.id].includes(item && item.ch));
        const entree = ()=>({ item: (m === "qcm" || m === "tr") ? melangerQCM(item) : item, mode:m, subj:s, key });
        if(visee && (srsIsDue(key) || !estAcquise(key))) prio.push(entree());
        else if(aRevoir(key)) all.push(entree());                                   // déjà fait, et son tour est revenu
        else if(!SRS[key] && semIds.has(s.id) && m !== "oq") neuf.push(entree());   // jamais fait : seulement le semestre en cours
      });
    });
  });
  return { prio, all, neuf, cibles, quand };
}
// « Prévention des conduites à risques » → « Prévention »
const nomBref = t=>String(t || "").split(/ (?:des|de|du|d'|et|à|aux|en|:) /)[0].replace(/^(Introduction à la|Introduction aux|Introduction à) /i, "");
// la phrase sous le bouton : ce que la série va contenir
function apercuRevision(){
  const { prio, all, neuf, quand } = choixRevision();
  const n = Math.min(SERIE_MAX, prio.length + all.length + neuf.length);
  if(!n) return { vide:true, txt:"Tout est à jour" };
  const mats = [...new Set(prio.map(x=>x.subj.id))].sort((a,b)=>quand[a] - quand[b]).map(id=>SUBJECTS.find(x=>x.id === id)).filter(Boolean);
  if(mats.length){
    const noms = mats.slice(0, 2).map(m=>"<b>" + esc(nomBref(m.title)) + "</b>").join(", ") + (mats.length > 2 ? " +" + (mats.length - 2) : "");
    return { txt:`Priorité : ${noms}` };
  }
  const a = Math.min(all.length, n), b = n - a;
  return { txt:[a ? `<b>${a}</b> à revoir` : "", b ? `<b>${b}</b> nouveau${b > 1 ? "x" : ""}` : ""].filter(Boolean).join(" · ") };
}
// Rien à revoir : une série libre, faite de ce qui n'est pas encore acquis (semestre en cours d'abord)
function startSerieLibre(){
  const sem = hmMatieresSem(), base = sem.length ? sem : SUBJECTS, pris = [];
  base.forEach(s=>["qcm","fc","tr"].forEach(m=>exos(s, m).forEach((item,i)=>{
    const key = cardKey(s.id,m,item,i);
    if(!estAcquise(key)) pris.push({ item:(m === "qcm" || m === "tr") ? melangerQCM(item) : item, mode:m, subj:s, key });
  })));
  if(!pris.length){ toast("Tout est acquis. Bravo !"); return; }
  sessionMix = null; exam = null; document.getElementById("sess-score").className = "nav-score";
  idx=0; score=0; answers=[]; rateesSession = new Set(); sessionFil = null;
  flipped=false; selOpt=null; confirmed=false; showAns=false; showHint=false; lastMotiv=""; oqEcrit="";
  globalSession = true; sessionScope = "all";
  queue = shuffle(pris).slice(0, SERIE_MAX);
  sessionDueOnly = false;
  clearInterval(timerInt);
  showScreen("session");
  renderSess();
}
// le bouton de l'accueil : la révision du jour, ou, s'il n'y a rien à revoir, deux propositions
function lancerRevisionJour(){
  if(startGlobalSession() !== false) return;
  const prochain = pendingAlerts(true, false).map(e=>({ e, N:evNote(e) || {} }))
    .filter(x=>typeDevoir(x.N) === "controle" && !x.N.done && hmJoursAvant(x.e.start) >= 0)
    .sort((a,b)=>a.e.start - b.e.start).map(x=>({ ...x, sj:matiereDeNote(x.e, x.N) })).find(x=>x.sj);
  openForm("Rien à revoir aujourd'hui", [], "Faire une série libre", ()=>{ setTimeout(startSerieLibre, 320); },
    null, prochain ? { label:"Réviser " + nomBref(prochain.sj.title) + " (contrôle " + (hmJoursAvant(prochain.e.start) <= 1 ? "demain" : "dans " + hmJoursAvant(prochain.e.start) + " jours") + ")",
      fn:()=>startRevisionMatiere(prochain.sj, Array.isArray(prochain.N.chs) && prochain.N.chs.length ? prochain.N.chs : null) } : null);
  const p = el("div","fs-hint");
  p.textContent = "Tout ce que tu as déjà travaillé est à jour. Tu peux quand même t'entraîner : une série libre reprend ce que tu ne maîtrises pas encore.";
  p.style.cssText = "margin:2px 4px 6px;font-size:14px;line-height:1.55;text-align:center";
  document.getElementById("fs-body").appendChild(p);
}
// le titre court d'une session : « CM 3 », « Grand QCM », « Mes erreurs »…
function titreSession(mode){
  const noms = { qcm:"QCM", fc:"Flashcards", tr:"Textes à trous", oq:"Questions" };
  if(sessionFil) return sessionFil.nom;
  if(globalSession) return "Révision";
  const sc = sessionScope || "all";
  if(sc.startsWith("ch:")){ const ser = libelleSerie(curSubj, mode, sc); return partiesChapitre(scopeSansSerie(sc).slice(3)).court + (ser ? " · " + ser : ""); }
  if(sc === "grand") return mode === "qcm" ? "Grand QCM" : "Tout";
  if(sc === "all") return noms[mode] || "Révision";
  return nomScope(sc);
}
// les secondes restantes, en petit en haut à droite
let SEC_MAX = 20;
function majSecondes(v, max){
  const sc = document.getElementById("sess-score"); if(!sc) return;
  if(max) SEC_MAX = max;
  if(!(v > 0)){ sc.innerHTML = ""; return; }
  const R = 20, C = 2 * Math.PI * R, part = Math.max(0, Math.min(1, v / SEC_MAX));
  let ch = sc.querySelector(".chrono");
  if(!ch){
    sc.innerHTML = `<span class="chrono" role="timer" aria-label="Temps restant"><svg viewBox="0 0 46 46"><circle class="chrono-fond" cx="23" cy="23" r="${R}"/><circle class="chrono-arc" cx="23" cy="23" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/></svg><b></b></span>`;
    ch = sc.querySelector(".chrono");
  }
  ch.querySelector("b").textContent = v;
  ch.querySelector(".chrono-arc").setAttribute("stroke-dashoffset", (C * (1 - part)).toFixed(2));
  ch.classList.toggle("red", v <= 5);
}
// l'explication d'un prof : si tu t'es trompée, pourquoi ton choix ne va pas, puis pourquoi la bonne réponse est juste
function renderSess(){
  if(idx>=queue.length){ showResults(); return; }
  const entry = queue[idx];
  const cur   = entry.item;
  const mode  = entry.mode;          // le mode vient de la carte (sessions multi-matières)
  curMode = mode;
  document.getElementById("sess-pos").textContent = (sessionMix ? "Révision" : titreSession(mode)) + " · " + (idx+1) + " / " + queue.length;
  const sc = document.getElementById("sess-score"); sc.className = "nav-score sx-temps"; sc.textContent = "";
  document.getElementById("sess-prog").style.width=(idx/queue.length*100)+"%";
  const body=document.getElementById("sess-body"); body.innerHTML="";
  // en session globale, on rappelle de quelle matière vient la carte
  if(globalSession || sessionFil){
    const tag=el("div","sess-subj");
    tag.innerHTML=`<span class="ss-num">${esc(entry.subj.ecue)}</span>${esc(entry.subj.title)}`;
    body.appendChild(tag);
  }
  if(lastMotiv){ const d=el("div","motiv"); d.textContent=lastMotiv; body.appendChild(d); }
  if(mode==="fc") renderFC(cur,body);
  else if(mode==="qcm") renderQCM(cur,body);
  else if(mode==="tr") renderTR(cur,body);
  else renderOQ(cur,body);
}
// libellé du prochain rappel, pour afficher sous les boutons
function nextLabel(key, grade){
  const c = srsGet(key);
  if(grade===0) return "aujourd'hui";
  const rep = c.rep + 1;
  let iv;
  if(grade===1){
    if(rep===1)      iv = 1;
    else if(rep===2) iv = 2;
    else             iv = Math.max(2, Math.round(c.interval * 1.4));
  } else {
    if(rep===1)      iv = 1;
    else if(rep===2) iv = 3;
    else             iv = Math.max(1, Math.round(c.interval * Math.min(2.8, c.ease + 0.1)));
  }
  if(iv===1) return "demain";
  if(iv<30)  return "dans "+iv+" j";
  return "dans "+Math.round(iv/30)+" mois";
}
// 3 boutons de notation (SM-2 simplifié)
function gradeRow(key, onGrade, reussi){
  const row=el("div","grade-row");
  // après une bonne réponse, « Pas su » n'a pas de sens : il reste Difficile / Facile
  const defs=[
    {g:0, lbl:"Pas su",    cls:"g-hard"},
    {g:1, lbl:"Difficile", cls:"g-mid"},
    {g:2, lbl:"Facile",    cls:"g-easy"},
  ].filter(d=>!(reussi && d.g === 0));
  defs.forEach(d=>{
    const b=el("button","grade-btn "+d.cls);
    b.innerHTML=`<span class="g-lbl">${d.lbl}</span><span class="g-next">${nextLabel(key,d.g)}</span>`;
    b.addEventListener("click",()=>{ haptic(); onGrade(d.g); });
    row.appendChild(b);
  });
  return row;
}
function renderFC(cur,body){
  const key = queue[idx].key;
  const scene=el("div","fc-scene rise");
  const fc=el("div","fc"+(flipped?" flipped":""));
  fc.innerHTML=`
    <div class="fc-face"><div class="fc-label">Question · touche pour retourner</div>${cur.ctx ? `<div class="fc-ctx">${esc(cur.ctx)}</div>` : ""}<div class="fc-text">${esc(cur.q).replace(/\n/g,"<br>")}</div></div>
    <div class="fc-face fc-back"><div class="fc-label">Réponse</div>${cur.ctx ? `<div class="fc-ctx">${esc(cur.ctx)}</div>` : ""}<div class="fc-text">${esc(cur.a).replace(/\n/g,"<br>")}</div></div>`;
  fc.addEventListener("click",()=>{ haptic(); flipped=!flipped; renderSess(); });
  scene.appendChild(fc); body.appendChild(scene);

  if(flipped){
    // Une fois la réponse vue : on peut balayer la carte pour la noter
    // ← gauche = pas su   |   droite = facile →
    const hint = el("div","swipe-hint");
    hint.innerHTML = `<span class="sh-l">← Pas su</span><span class="sh-r">Facile →</span>`;
    body.appendChild(hint);
    enableCardSwipe(scene, fc, key, cur.q);
    body.appendChild(gradeRow(key, g=>doGrade(g, cur.q)));
  }
}
// glisser la carte pour la noter, avec retour visuel pendant le mouvement
function enableCardSwipe(scene, cardEl, key, question){
  let x0=0, y0=0, dx=0, dragging=false;
  const LIMIT = 90;                       // distance pour valider la note
  scene.addEventListener("touchstart", e=>{
    if(e.touches.length!==1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    dx = 0; dragging = true;
    cardEl.style.transition = "none";
  }, {passive:true});
  scene.addEventListener("touchmove", e=>{
    if(!dragging) return;
    const t = e.touches[0];
    const ddx = t.clientX - x0;
    const ddy = t.clientY - y0;
    if(Math.abs(ddy) > Math.abs(ddx)) return;   // geste vertical : on laisse scroller
    dx = ddx;
    // la carte suit le doigt, avec une légère rotation
    cardEl.style.transform = `rotateY(180deg) translateX(${-dx}px) rotate(${-dx*0.03}deg)`;
    scene.classList.toggle("swipe-ko", dx < -30);
    scene.classList.toggle("swipe-ok", dx >  30);
  }, {passive:true});
  scene.addEventListener("touchend", ()=>{
    if(!dragging) return;
    dragging = false;
    cardEl.style.transition = "";
    scene.classList.remove("swipe-ko","swipe-ok");
    if(dx < -LIMIT){                       // ← pas su
      haptic(); doGrade(0, question); return;
    }
    if(dx >  LIMIT){                       // facile →
      haptic(); doGrade(2, question); return;
    }
    cardEl.style.transform = "";           // pas assez loin : la carte revient
  }, {passive:true});
}
function renderQCM(cur,body){
  const wrap=el("div","rise");
  if(!confirmed){
    timerVal=20;
    majSecondes(20, 20);
    const tt=el("div","timer-track"); tt.innerHTML=`<div class="timer-bar" id="tbar" style="width:100%"></div>`; wrap.appendChild(tt);
    clearInterval(timerInt);
    timerInt=setInterval(()=>{
      timerVal--;
      const l=document.getElementById("tlbl"), b=document.getElementById("tbar");
      majSecondes(timerVal);
      if(b){ b.style.width=(timerVal/20*100)+"%"; b.className="timer-bar"+(timerVal<=5?" red":""); }
      if(timerVal<=0){ clearInterval(timerInt); if(!confirmed) doQCM(-1,cur); }
    },1000);
  }
  const qb=el("div","q-box"); qb.innerHTML=`<div class="sx-qlbl">Question ${idx+1}</div><div class="q-text">${esc(cur.q)}</div>`; wrap.appendChild(qb);
  const opts=el("div","opts");
  cur.opts.forEach((o,i)=>{
    const b=el("button","opt");
    if(confirmed){ if(i===cur.c)b.classList.add("correct","qz-pop"); else if(i===selOpt)b.classList.add("wrong","qz-shake"); else b.classList.add("qz-dim"); b.disabled=true; }
    const letter=confirmed&&i===cur.c?"✓":confirmed&&i===selOpt?"✗":String.fromCharCode(65+i);
    b.innerHTML=`<span class="opt-letter">${letter}</span><span>${esc(o)}</span>`;
    b.addEventListener("click",()=>{ haptic(); doQCM(i,cur); });
    opts.appendChild(b);
  });
  wrap.appendChild(opts);
  body.appendChild(wrap);
  if(confirmed) feuilleReponse(cur, cur.q, body);
}
// ══════════════════════════════════════════════════
// COMPARAISON LOCALE : quelles notions du corrigé se retrouvent
// dans ce qui a été écrit. Aucun réseau, aucun coût.
// ══════════════════════════════════════════════════
const MOTS_VIDES = new Set(("le la les un une des du de d au aux et ou ou mais donc or ni car que qui quoi dont ou " +
  "a as ai est sont etre etait ete avoir avait ce cet cette ces son sa ses leur leurs il elle ils elles on nous vous " +
  "je tu me te se lui y en dans sur sous pour par avec sans vers chez entre plus moins tres tout tous toute toutes " +
  "meme aussi alors ainsi comme quand si ne pas non oui plutot peut peuvent doit doivent fait faire cela ceux celui " +
  "celle autre autres chaque leur lors apres avant deja encore bien beaucoup").split(" "));

function normMot(m){
  return m.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9-]/g,"");
}
// Racine grossière : « inégalités » et « inégalité » doivent se reconnaître.
function racine(m){
  return m.replace(/(aux|ales|elles|ements|ement|ations|ation|ismes|isme|istes|iste|ives|ive|eurs|eur|ees|ee|es|s|x)$/,"");
}
function motsClefs(txt){
  const vus = new Map();
  String(txt||"").split(/[\s'’,;.:!?()«»"]+/).forEach(m=>{
    const n = normMot(m);
    if(n.length < 4 || MOTS_VIDES.has(n)) return;
    const r = racine(n);
    if(!vus.has(r)) vus.set(r, m.replace(/[,;.:!?()«»"]/g,""));
  });
  return vus;
}

function comparerReponse(ecrit, modele){
  const cible = motsClefs(modele);
  const mien  = new Set([...motsClefs(ecrit).keys()]);
  const vus = [], rates = [];
  cible.forEach((mot, r)=>{ (mien.has(r) ? vus : rates).push(mot); });
  return { vus, rates, total: cible.size };
}

function renderOQ(cur,body){
  const wrap=el("div","rise");
  const qb=el("div","q-box"); qb.innerHTML=`<div class="sx-qlbl">Question ${idx+1}</div><div class="q-text">${esc(cur.q)}</div>`; wrap.appendChild(qb);
  if(!showAns){
    const ta=document.createElement("textarea"); ta.placeholder="Ta réponse ici…"; ta.id="oq-ta";
    ta.value = oqEcrit;
    ta.addEventListener("input",()=>{ oqEcrit = ta.value; });
    wrap.appendChild(ta);
    const row=el("div","btn-row");
    const hb=el("button","btn ghost"); hb.textContent=showHint?"Cacher l'indice":"Indice"; hb.addEventListener("click",()=>{showHint=!showHint;renderSess();});
    const sb=el("button","btn"); sb.textContent="Voir la correction"; sb.addEventListener("click",()=>{showAns=true;renderSess();});
    row.appendChild(hb); row.appendChild(sb); wrap.appendChild(row);
    if(showHint){ const h=el("div","hint-box"); h.textContent="Indice : "+cur.a.split("\n")[0].substring(0,90)+"…"; wrap.appendChild(h); }
  } else {
    const ab=el("div","ans-box"); ab.innerHTML=`<div class="ans-label">Réponse modèle</div><div class="ans-text">${esc(cur.a)}</div>`; wrap.appendChild(ab);

    // bilan : ce que tu as écrit, confronté au corrigé
    if(oqEcrit.trim().length > 8){
      const b = comparerReponse(oqEcrit, cur.a);
      const box = el("div","bilan");
      const pct = b.total ? Math.round(b.vus.length / b.total * 100) : 0;
      box.innerHTML = `<div class="bilan-titre">Ce que tu as couvert</div>
        <div class="bilan-score">${b.vus.length} notion${b.vus.length>1?"s":""} sur ${b.total} · ${pct} %</div>`;
      if(b.vus.length){
        const l = el("div","bilan-lbl"); l.textContent = "Présentes dans ta réponse";
        l.style.marginTop = "0";
        const z = el("div","bilan-mots");
        z.innerHTML = b.vus.slice(0,18).map(m=>`<span class="bmot vu">${esc(m)}</span>`).join("");
        box.appendChild(l); box.appendChild(z);
      }
      if(b.rates.length){
        const l = el("div","bilan-lbl"); l.textContent = "Absentes du texte que tu as écrit";
        const z = el("div","bilan-mots");
        z.innerHTML = b.rates.slice(0,18).map(m=>`<span class="bmot rate">${esc(m)}</span>`).join("");
        box.appendChild(l); box.appendChild(z);
      }
      const note = el("div","bilan-lbl");
      note.textContent = "Comparaison de mots, pas de sens : à toi de juger si l'idée y était.";
      box.appendChild(note);
      wrap.appendChild(box);
    }

    const sq=el("p","self-q"); sq.textContent="Tu t'en sortais comment ?"; wrap.appendChild(sq);
    wrap.appendChild(gradeRow(queue[idx].key, g=>doGrade(g, cur.q)));
  }
  body.appendChild(wrap);
}
function showResults(){
  clearInterval(timerInt);
  document.getElementById("sess-pos").textContent="Résultat";
  majSecondes(0);
  document.getElementById("sess-prog").style.width="100%";
  const body=document.getElementById("sess-body"); body.innerHTML="";
  // le score d'un chapitre ne doit pas écraser celui de la matière entière
  if(!globalSession && !sessionMix && curSubj && (sessionScope === "all" || sessionScope === "grand")) stats[curSubj.id+"_"+curMode]={score,total:queue.length};
  // reste à revoir : sur la matière (session simple) ou sur tout (session globale)
  const restant = sessionFil ? 0 : globalSession
    ? SUBJECTS.reduce((n,s)=>n+dueCount(s),0)
    : dueCount(curSubj);
  const wrap=el("div","results");
  // une question ratée revient en fin de session : on compte la première réponse de chaque question
  const premieres = new Map(); answers.forEach(a=>{ if(!premieres.has(a.q)) premieres.set(a.q, a); });
  const n = premieres.size, ok = [...premieres.values()].filter(a=>a.ok).length;
  const C = 2*Math.PI*32;
  const titre = !n ? "Terminé" : ok === n ? "Parfait" : ok / n >= .7 ? "Bien joué" : ok / n >= .5 ? "Pas mal" : "On continue";
  // questions ratées sans doublon (une question ratée revient en fin de session)
  const aRevoir = [...premieres.values()].filter(a=>!a.ok);
  let sous = aRevoir.length ? aRevoir.length + " question" + (aRevoir.length > 1 ? "s" : "") + " à revoir." : "Aucune erreur.";
  if(!globalSession && sessionScope === "erreurs"){
    const r = itemsDuScope(curSubj, curMode, "erreurs").length;
    sous = r ? "Il te reste " + r + " erreur" + (r > 1 ? "s" : "") + " à reprendre." : "Plus aucune erreur, bravo.";
  } else if(aRevoir.length && curMode === "qcm") sous += aRevoir.length > 1 ? " Elles iront dans « Mes erreurs »." : " Elle ira dans « Mes erreurs ».";
  wrap.className = "qz-end";
  const etoile = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.1 6.4 20l1.1-6.2L2.9 9.4l6.3-.9z"/></svg>';
  const nomSerie = sessionFil ? "Fil rouge" : globalSession ? "Révision du jour" : (curSubj ? curSubj.title : "");
  const doux = (!globalSession && !sessionFil && sessionScope === "erreurs") ? sous : !n ? "" : ok === n ? "Tu as tout bon. Cette série est validée." : "Les questions ratées reviendront plus tard, sans pression.";
  wrap.innerHTML = `<div class="qz-medal">${etoile}</div>
    <h2>${titre}${n && ok / n >= .5 ? " !" : ""}</h2><p>${esc(doux)}</p>
    <div class="hm-card qz-bilan"><span class="hm-ic hm-doux-g" style="flex-shrink:0">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M5 12l5 5 9-10"/></svg>'}</span><span><span class="t1">${ok} sur ${n}</span><span class="t2">${esc(nomSerie)}</span></span></div>
    ${aRevoir.length ? `<div class="results-detail"><div class="results-detail-label">Tes erreurs</div>${aRevoir.map(a=>`<div class="result-row ko"><span class="result-ic">✕</span><span class="result-q">${esc(a.q)}</span></div>`).join("")}</div>` : ""}`;
  if(n && ok / n >= .5){ setTimeout(confettis, 250);
    if(navigator.vibrate){ try{ navigator.vibrate([12,70,12,70,20]); }catch(e){} } else { haptic(); setTimeout(haptic, 130); setTimeout(haptic, 260); } }
  const row = el("div");
  const prim = (txt, fn)=>{ const b = el("button","hm-cta hm-press"); b.type = "button"; b.textContent = txt; b.addEventListener("click",()=>{ haptic(); fn(); }); row.appendChild(b); };
  const sec = (txt, fn)=>{ const b = el("button","qz-sec hm-press"); b.type = "button"; b.textContent = txt; b.addEventListener("click",()=>{ haptic(); fn(); }); row.appendChild(b); };
  if(sessionFil){
    const th = sessionFil;
    prim("Terminer", ()=>(FIL_RETOUR || renderFilPsycho)());
    sec("Recommencer", ()=>startFilSession(th));
  } else if(globalSession){
    prim("Retour à l'accueil", ()=>{ renderSemestres(); showScreen("semestres"); });
    if(restant > 0) sec("Continuer", startGlobalSession);
  } else {
    prim("Terminer", ()=>quitterSession());
    if(sessionMix){ const sj = SUBJECTS.find(x=>x.id === sessionMix), chs = MIX_CHS; sec("Recommencer", ()=>startRevisionMatiere(sj, chs)); }
    else sec("Recommencer", ()=>startSession(curMode));
  }
  wrap.appendChild(row);
  body.appendChild(wrap);
}
// Notation unique pour tous les modes (0 = pas su, 1 = difficile, 2 = facile)
function doGrade(grade, question){
  const key = queue[idx].key;
  srsReview(key, grade);
  // une question ratée va dans « Mes erreurs » et y reste jusqu'à une bonne réponse du premier coup,
  // dans une autre session : sinon la reprise en fin de session l'effaçait aussitôt
  const modeQ = queue[idx].mode || curMode;
  if(grade === 0 && modeQ === "qcm"){ rateesSession.add(key); ERREXAM[key] = Date.now(); errExamSave(); }
  else if(grade > 0 && ERREXAM[key] && !rateesSession.has(key)){ delete ERREXAM[key]; errExamSave(); }
  const ok = grade > 0;
  if(ok) score++;
  lastMotiv = ok ? pick(MOTIV_OK) : pick(MOTIV_KO);
  answers.push({ q: question, ok });
  // "pas su" → la carte revient en fin de session
  if(grade === 0) queue.push(queue[idx]);
  advance();
}
// ── Texte à trous : même moteur que le QCM, phrase à compléter et 15 s ──
function renderTR(cur,body){
  const wrap=el("div","rise");
  if(!confirmed){
    timerVal=15;
    majSecondes(15, 15);
    const tt=el("div","timer-track"); tt.innerHTML=`<div class="timer-bar" id="tbar" style="width:100%"></div>`; wrap.appendChild(tt);
    clearInterval(timerInt);
    timerInt=setInterval(()=>{
      timerVal--;
      const l=document.getElementById("tlbl"), b=document.getElementById("tbar");
      majSecondes(timerVal);
      if(b){ b.style.width=(timerVal/15*100)+"%"; b.className="timer-bar"+(timerVal<=5?" red":""); }
      if(timerVal<=0){ clearInterval(timerInt); if(!confirmed) doQCM(-1,cur); }
    },1000);
  }
  // la phrase, avec le trou remplacé au bon endroit
  const ok = confirmed && selOpt === cur.c;
  const mot = !confirmed ? `<span class="trou vide">?</span>`
            : ok ? `<span class="trou">${esc(cur.opts[cur.c])}</span>`
                 : `<span class="trou faux">${esc(selOpt >= 0 ? cur.opts[selOpt] : "…")}</span>`;
  const phrase = esc(cur.texte || "").replace(/_{2,}|\.\.\./, mot);
  const qb=el("div","q-box");
  qb.innerHTML=`<div class="sx-qlbl">Phrase ${idx+1}</div><div class="q-text">${phrase}</div>`;
  wrap.appendChild(qb);

  const opts=el("div","opts");
  cur.opts.forEach((o,i)=>{
    const b=el("button","opt");
    if(confirmed){ if(i===cur.c)b.classList.add("correct","qz-pop"); else if(i===selOpt)b.classList.add("wrong","qz-shake"); else b.classList.add("qz-dim"); b.disabled=true; }
    const letter=confirmed&&i===cur.c?"✓":confirmed&&i===selOpt?"✗":String.fromCharCode(65+i);
    b.innerHTML=`<span class="opt-letter">${letter}</span><span>${esc(o)}</span>`;
    b.addEventListener("click",()=>{ haptic(); doQCM(i,cur); });
    opts.appendChild(b);
  });
  wrap.appendChild(opts);

  if(confirmed && !ok){
    const bonne=el("div","q-box");
    bonne.innerHTML=`<div class="q-text">${esc(cur.texte||"").replace(/_{2,}|\.\.\./, `<span class="trou">${esc(cur.opts[cur.c])}</span>`)}</div>`;
    wrap.appendChild(bonne);
  }
  body.appendChild(wrap);
  // même notation que les autres modes, pour que le score et la mémorisation suivent
  if(confirmed) feuilleReponse(cur, cur.texte || "", body);
}


// Après une réponse (QCM, texte à trous) : la feuille qui monte du bas.
// Juste : « À retenir » puis Difficile / Facile. Faux : « Ta réponse », « À retenir », puis Suivante.
function feuilleReponse(cur, question, body){
  const ok = selOpt === cur.c, bonne = cur.opts[cur.c];
  document.getElementById("sess-prog").style.width = ((idx+1)/queue.length*100) + "%";
  const pourquoiPas = selOpt >= 0 && !ok && cur.w ? cur.w[cur.opts[selOpt]] : "";
  const coche = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  const croix = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  let h = `<div class="qz-verdict"><span class="vi" style="background:${ok ? "var(--ok)" : "var(--ko)"}">${ok ? coche : croix}</span>${ok ? "Bonne réponse" : selOpt < 0 ? "Temps écoulé" : "Pas tout à fait"}</div>`;
  if(!ok){
    if(pourquoiPas) h += `<p><b>Ta réponse :</b> ${esc(pourquoiPas)}</p>`;
    h += `<p><b>La bonne réponse :</b> ${esc(bonne)}</p>`;
  }
  if(cur.e) h += `<p><b>À retenir :</b> ${esc(cur.e)}</p>`;
  const veil = el("div","qz-veil");
  const sh = el("div","qz-sheet"); const inn = el("div","in"); inn.innerHTML = h; sh.appendChild(inn);
  const key = queue[idx].key;
  if(ok){
    // bonne réponse : on demande si c'était facile ou laborieux
    inn.appendChild(gradeRow(key, g=>doGrade(g, question), true));
  } else {
    // mauvaise réponse : la carte revient forcément
    const nb = el("button","hm-cta hm-press"); nb.type = "button";
    nb.textContent = idx+1 >= queue.length ? "Voir mon bilan" : "Question suivante";
    nb.addEventListener("click",()=>{ haptic(); doGrade(0, question); });
    inn.appendChild(nb);
  }
  body.appendChild(veil); body.appendChild(sh);
  if(navigator.vibrate){ try{ navigator.vibrate(ok ? 15 : [30,40,30]); }catch(e){} }
  else { haptic(); if(!ok) setTimeout(haptic, 140); }
}
function confettis(){
  if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = el("div","qz-conf");
  const cs = ["var(--accent)","var(--accent-2)","#f5a524","#14b87e","#3a86ff"];
  for(let k = 0; k < 60; k++){
    const i = document.createElement("i");
    i.style.left = Math.random()*100 + "%"; i.style.background = cs[k % 5];
    i.style.animationDelay = Math.random()*.6 + "s"; i.style.transform = "rotate(" + Math.random()*360 + "deg)";
    c.appendChild(i);
  }
  document.body.appendChild(c); setTimeout(()=>c.remove(), 3400);
}
function doQCM(i,cur){
  if(confirmed)return;
  clearInterval(timerInt);
  selOpt=i; confirmed=true;
  renderSess();
}
function advance(){ idx++; flipped=false; selOpt=null; confirmed=false; showAns=false; showHint=false; clearInterval(timerInt); renderSess(); }

// Déplacé depuis 03 : applyTheme appelle resolveAllLangs, défini dans 07.
(function initTheme(){
  let saved=null;
  try{ saved=localStorage.getItem(THEME_KEY); }catch(e){}
  if(saved){ applyTheme(saved); }
})();
