// ── Classes et partage, devoirs partagés, lecture à voix haute
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
// ══════════════════════════════════════════════════
// CLASSES ET PARTAGE
// ══════════════════════════════════════════════════
let toastTimer = null;
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("show"), 2600);
}

let MY_CLASSES = [];      // [{id,name,owner,role,code?}]
let curClass   = null;
let SHARED_CACHE = {};    // item_id → payload, rempli à l'ouverture
let SUB_ITEMS    = {};    // "classe|matière" → chapitres, pour les matières suivies

// Picker générique : une liste de choix dans une feuille qui monte.
// le + dans le titre d'une feuille : ajouter quelque chose à la liste affichée
function plusFeuille(label, fn){
  const t = document.getElementById("pick-title");
  t.querySelectorAll(".pick-plus").forEach(n=>n.remove());
  const b = el("button","pick-plus"); b.type = "button"; b.setAttribute("aria-label", label);
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
  b.addEventListener("click",()=>{ haptic(); closePicker(); setTimeout(fn, 320); });
  t.appendChild(b);
}
function openPicker(title, options, onPick){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  const box = document.getElementById("pick-list");
  document.querySelectorAll("#pick-sheet .fp-retour").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = title;
  box.innerHTML = "";
  if(!options.length){
    const p = el("div","fs-hint");
    p.textContent = "Rien à choisir ici pour l'instant.";
    box.appendChild(p);
  }
  options.forEach(o=>{
    const b = el("button","cal-row" + (o.deja ? " deja" : "") + (o.accent ? " accent" : ""));
    b.type = "button";
    b.innerHTML = `<div class="cal-txt"><div class="cal-name">${esc(o.label)}</div>` +
      (o.sub ? `<div class="cal-url">${esc(o.sub)}</div>` : "") + `</div>`;
    b.addEventListener("click",()=>{ haptic(); closePicker(); onPick(o.value); });
    box.appendChild(b);
  });
  document.getElementById("pick-sheet").classList.add("open");
}
// Feuille à choix multiples. Chaque ligne se coche ; deux boutons en bas :
// tout valider d'un coup, ou valider seulement la sélection.
// o.deja = déjà publié : la ligne est hachurée, mais reste cochable (pour mettre à jour).
const COCHE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function closePicker(){ document.getElementById("pick-sheet").classList.remove("open"); setTimeout(()=>{ if(!document.getElementById("pick-sheet").classList.contains("open")) document.querySelectorAll("#pick-sheet .fp-retour").forEach(n=>n.remove()); }, 350); }

const KIND_LABEL = { cm:"Cours magistraux", td:"Travaux dirigés", devoir:"Devoirs", revision:"Révisions" };


// Emballe une ligne pour qu'un glissement vers la gauche révèle « Retirer ».
function swipeRow(node, actions, flat){
  const larg  = 116 * actions.length;
  const wrap  = el("div","swipe" + (flat ? " flat" : ""));
  const acts  = el("div","swipe-acts");
  actions.forEach(a=>{
    const b = el("button","swipe-del" + (a.doux ? " soft" : ""));
    b.type = "button"; b.textContent = a.label;
    b.addEventListener("click",()=>{ haptic(); pose(false); a.fn(); });
    acts.appendChild(b);
  });
  const front = el("div","swipe-front");
  front.appendChild(node);
  wrap.appendChild(acts); wrap.appendChild(front);

  let x0 = 0, dx = 0, ouvert = false, actif = false, bouge = false;
  // le contenu glissé est un bouton : sans ça, chaque glissement finit par l'activer
  front.addEventListener("click", e=>{
    if(bouge || ouvert){ e.preventDefault(); e.stopPropagation(); bouge = false; if(ouvert) pose(false); }
  }, true);
  const pose = v => { front.style.transform = v ? `translateX(-${larg}px)` : "translateX(0)"; ouvert = v; };
  front.addEventListener("touchstart", e=>{
    x0 = e.touches[0].clientX; dx = 0; actif = true; bouge = false;
    front.style.transition = "none";
  }, { passive:true });
  front.addEventListener("touchmove", e=>{
    if(!actif) return;
    dx = e.touches[0].clientX - x0;
    if(Math.abs(dx) > 8) bouge = true;
    const base = ouvert ? -larg : 0;
    // on borne : pas de glissement vers la droite au-delà de la position fermée
    front.style.transform = "translateX(" + Math.max(-larg - 24, Math.min(0, base + dx)) + "px)";
  }, { passive:true });
  const fin = ()=>{
    if(!actif) return;
    actif = false;
    front.style.transition = "";
    pose(ouvert ? dx > 50 ? false : true : dx < -50);
  };
  front.addEventListener("touchend", fin);
  front.addEventListener("touchcancel", fin);
  return wrap;
}

// ── Liste de mes classes ──
async function openClasses(){
  showScreen("classes");
  const box = document.getElementById("classes-list");
  box.innerHTML = `<div class="empty-note">Chargement…</div>`;
  try{
    const out = await api("class_list");
    MY_CLASSES = out.classes || [];
  }catch(e){
    box.innerHTML = vide("alerte", "Impossible de charger tes classes", "Vérifie ta connexion, puis réessaie.");
    return;
  }
  box.innerHTML = "";
  donnerIconesClasses();
  if(!MY_CLASSES.length){
    box.innerHTML = vide("groupe", "Aucune classe pour l'instant", "Une classe, c'est un dossier de cours partagé. Crée la tienne, ou rejoins celle de quelqu'un avec son code.",
      `<div class="vide-actions"><button class="btn" type="button" id="cls-vide-new">Créer une classe</button><button class="btn ghost" type="button" id="cls-vide-join">Rejoindre avec un code</button></div>`);
    document.getElementById("cls-vide-new").addEventListener("click",()=>{ haptic(); createClass(); });
    document.getElementById("cls-vide-join").addEventListener("click",()=>{ haptic(); joinClass(); });
    return;
  }
  MY_CLASSES.forEach(c=>{
    const row = el("button","cls-row");
    row.type = "button"; row.dataset.cls = c.id;
    const tag = c.role === "owner" ? "CRÉATEUR" : c.role === "adjoint" ? "ADJOINT"
              : c.role === "pending" ? "EN ATTENTE" : "MEMBRE";
    const cc = (USER_SETTINGS.clsCouleurs || {})[c.id];
    if(cc && HM_HEX[cc]) row.style.setProperty("--cc", HM_HEX[cc]);
    row.innerHTML = `<div class="cls-ic">${icone(iconeClasse(c))}</div>
      <div class="cls-txt"><div class="cls-name">${esc(c.name)}</div>
      ${(()=>{ const o = c.role === "owner" ? "toi" : (c.owner || c.owner_pseudo || c.owner_name || c.created_by || ""); return o ? `<div class="cls-sub">créée par ${esc(o)}</div>` : ""; })()}</div>
      <span class="cls-tag">${tag}</span>`;
    row.addEventListener("click",()=>{
      haptic();
      if(c.role === "pending"){
        toast("Ta demande attend la validation du créateur.");
        return;
      }
      openClass(c);
    });
    // toucher l'icône, ou appui long sur la ligne : changer l'icône
    onLongPress(row, ()=>changerIconeClasse(c));
    row.querySelector(".cls-ic").addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); changerIconeClasse(c); });
    box.appendChild(row);
  });
  majPastillesClasses();
  rafraichirNouveautesClasses();
}

// ── Icône d'une classe : chacun choisit la sienne, gardée dans ses réglages ──
// Une nouvelle classe reçoit la première icône pas encore prise par une autre.
const CLS_ICONES = ["grp","edu","livre","boussole","ecole","cible","ampoule","com","globe","plume","rech","pousse"];
const estCleIcone = k=>!!(k && (UI_IC[k] || MAT_IC[k]));
function iconesClasses(){
  const m = USER_SETTINGS.clsIcones;
  return (m && typeof m === "object") ? m : {};
}
function iconeClasse(c){ const k = iconesClasses()[c.id]; return estCleIcone(k) ? k : CLS_ICONES[0]; }
function donnerIconesClasses(){
  const m = Object.assign({}, iconesClasses());
  let change = false;
  MY_CLASSES.forEach(c=>{
    if(estCleIcone(m[c.id])) return;
    delete m[c.id];
    const prises = new Set(MY_CLASSES.map(x=>m[x.id]).filter(estCleIcone));
    m[c.id] = CLS_ICONES.find(e=>!prises.has(e)) || CLS_ICONES[0];
    change = true;
  });
  if(change){ USER_SETTINGS.clsIcones = m; saveContent(); }
}
function changerIconeClasse(c){
  openForm(c.name, [
    { key:"couleur", label:"Couleur", type:"couleur", value:(USER_SETTINGS.clsCouleurs || {})[c.id] || "", defaut:"v" },
    { key:"icone", label:"Icône", type:"icone", value:iconeClasse(c),
      hint:"Seulement pour toi : les autres membres gardent les leurs." }
  ], "Enregistrer", v=>{
    if(!v.icone) return "Choisis une icône.";
    USER_SETTINGS.clsIcones = Object.assign({}, iconesClasses(), { [c.id]:v.icone });
    const c2 = Object.assign({}, USER_SETTINGS.clsCouleurs); if(v.couleur) c2[c.id] = v.couleur; else delete c2[c.id];
    USER_SETTINGS.clsCouleurs = c2;
    saveContent();
    const row = document.querySelector('#classes-list .cls-row[data-cls="' + c.id + '"]');
    if(row){ row.querySelector(".cls-ic").innerHTML = icone(v.icone); if(v.couleur) row.style.setProperty("--cc", HM_HEX[v.couleur]); else row.style.removeProperty("--cc"); }
  });
}

function classMenu(){
  openPicker("Mes classes", [
    { label:"Créer une classe", sub:"tu en deviens le créateur", value:"new" },
    { label:"Rejoindre avec un code", sub:"ta demande sera validée", value:"join" }
  ], v=>{ if(v === "new") createClass(); else joinClass(); });
}

function createClass(){
  openForm("Nouvelle classe", [
    { key:"name", label:"Nom de la classe", placeholder:"L3 SESS 2026" }
  ], "Créer", v=>{
    if(v.name.length < 2) return "Donne un nom à la classe.";
    api("class_create", { name:v.name })
      .then(()=>openClasses())
      .catch(()=>toast("Création impossible."));
  });
}

function joinClass(){
  openForm("Rejoindre une classe", [
    { key:"code", label:"Code de la classe", placeholder:"AB3K7P",
      hint:"Six caractères, donnés par le créateur. Ta demande devra être validée." }
  ], "Demander", v=>{
    if(v.code.length < 4) return "Ce code est trop court.";
    api("class_request", { class_code:v.code })
      .then(out=>{
        toast(out.statut === "pending" ? "Demande envoyée." : "Tu es déjà dans cette classe.");
        openClasses();
      })
      .catch(e=>toast(e.code === "classe_introuvable" ? "Aucune classe avec ce code." : "Échec."));
  });
}

// ── Une classe : ses membres, puis ses cours triés par matière et par type ──
// ── Nouveautés des classes : publié depuis ta dernière visite, et pas encore dans tes cours ──
// Même logique que les chapitres : pastille rose de l'accueil jusqu'au chapitre.
const CLSVUS_KEY = "revision_classes_vus_v1";
let CLSVUS = null;
function clsVus(){
  if(!CLSVUS){ try{ CLSVUS = JSON.parse(localStorage.getItem(CLSVUS_KEY) || "null"); }catch(e){ CLSVUS = null; } }
  if(!CLSVUS || typeof CLSVUS !== "object") CLSVUS = {};
  if(!CLSVUS.init || typeof CLSVUS.init !== "object") CLSVUS.init = {};
  if(!CLSVUS.vus  || typeof CLSVUS.vus  !== "object") CLSVUS.vus  = {};
  return CLSVUS;
}
function clsVusSave(sync){ try{ localStorage.setItem(CLSVUS_KEY, JSON.stringify(clsVus())); }catch(e){} if(sync !== false) scheduleSync(); }
// « chez moi » : ajouté à mes cours, ou publié par moi
function possedeItem(it){ return isFollowed(it.id) || !!subFollowOf(it) || it.author === whoAmI(); }
// la première fois qu'on ouvre une classe, ce qui y est déjà ne compte pas comme nouveau
function nouveauxClasse(c, items){
  const v = clsVus();
  if(!v.init[c.id]){ v.init[c.id] = 1; items.forEach(it=>{ v.vus[it.id] = 1; }); clsVusSave(); }
  return items.filter(it=>!v.vus[it.id] && !possedeItem(it));
}
function marquerItemVu(it){
  const v = clsVus();
  if(!it || v.vus[it.id]) return;
  v.vus[it.id] = 1; clsVusSave();
  // la pastille de sa classe se recalcule à la prochaine visite ; on retire déjà ce qu'on sait
  const o = clsNb(), k = it.class_id;
  if(k != null && o[k]){
    const reste = (CLS_ITEMS[k] || []).filter(x=>!v.vus[x.id] && !possedeItem(x));
    clsNbPoser(k, new Set(reste.map(x=>x.subject_title)).size + (CLS_ATTENTE[k] || 0));
  }
}
// dernière liste connue de chaque classe, pour recompter sans réseau
const CLS_ITEMS = {};
const CLS_ATTENTE = {};  // demandes en attente, par classe
// nombre de matières avec du nouveau, par classe
const CLSNB_KEY = "revision_classes_nb_v1";
function clsNb(){ try{ return JSON.parse(localStorage.getItem(CLSNB_KEY) || "{}") || {}; }catch(e){ return {}; } }
function clsNbPoser(classId, n){
  const o = clsNb();
  if(n) o[classId] = n; else delete o[classId];
  try{ localStorage.setItem(CLSNB_KEY, JSON.stringify(o)); }catch(e){}
  majPastillesClasses();
}
function pastille(parent, n, label){
  if(!parent) return;
  let p = parent.querySelector(":scope > .nb");
  if(!n){ if(p) p.remove(); return; }
  if(!p){ p = el("span","nb"); parent.appendChild(p); }
  p.textContent = n > 99 ? "99+" : n;
  p.setAttribute("aria-label", label || (n + " nouveau" + (n > 1 ? "x" : "")));
}
// La pastille de l'icône de l'app : les mêmes nouveautés que sur l'accueil (classes + devoirs).
// Le chiffre est aussi rangé pour sw.js, qui l'augmente quand une notification arrive app fermée.
var BADGE_APP = { cls:0, dev:0, proj:0, notifs:0 };
function poserBadgeApp(){
  // la pastille de l'icône dit la même chose que la cloche : les notifications pas encore lues
  const n = BADGE_APP.notifs || 0;
  try{
    if(navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(()=>{});
    if(window.caches) caches.open("revision-badge").then(c=>c.put("/__badge", new Response(String(n)))).catch(()=>{});
  }catch(e){}
}
function majPastillesClasses(){
  const o = clsNb();
  const connues = new Set(MY_CLASSES.map(c=>String(c.id)));
  const tot = Object.keys(o).filter(k=>!MY_CLASSES.length || connues.has(String(k))).reduce((s,k)=>s + (o[k] || 0), 0);
  BADGE_APP.cls = tot; poserBadgeApp(); try{ majTabbar(); }catch(e){}
  document.querySelectorAll("#classes-list .cls-row[data-cls]").forEach(r=>{
    const n = o[r.dataset.cls] || 0;
    pastille(r, n, n + " matière" + (n > 1 ? "s" : "") + " avec du nouveau");
  });
}
// en arrière-plan : de quoi poser les pastilles sans ouvrir les classes
let nouveautesEnCours = false;
async function rafraichirNouveautesClasses(){
  if(!syncOn || !PSEUDO || nouveautesEnCours) return;
  nouveautesEnCours = true;
  try{
    const out = await api("class_list");
    MY_CLASSES = out.classes || [];
    const base = {};                       // pastille de chaque classe avant les devoirs
    for(const c of MY_CLASSES){
      if(c.role === "pending") continue;
      try{
        const items = (await api("class_items", { class_id:c.id })).items || [];
        CLS_ITEMS[c.id] = items;
        // cours suivis : une matière apparue depuis rejoint mes matières
        if(suitCours(c.id)) await suivreToutesMatieres(c, items);
        // pour qui valide les entrées, une demande en attente compte aussi
        let attente = 0;
        if(c.role === "owner" || c.role === "adjoint"){
          try{ attente = ((await api("class_members", { class_id:c.id })).membres || []).filter(m=>m.role === "pending").length; }catch(e){}
        }
        CLS_ATTENTE[c.id] = attente;
        base[c.id] = new Set(nouveauxClasse(c, items).map(it=>it.subject_title)).size + attente;
        clsNbPoser(c.id, base[c.id]);
      }catch(e){}
    }
    // les devoirs, en une fois pour toutes les classes, puis posés dans l'agenda
    const ids = MY_CLASSES.filter(c=>c.role !== "pending").map(c=>c.id);
    // une classe quittée (ou dont on a été retiré) : ses devoirs reçus partent de l'agenda,
    // sauf ceux qu'on avait retouchés, qui restent comme les siens, sans lien
    const garde = new Set(MY_CLASSES.map(c=>c.id));
    let quitte = false;
    Object.keys(DEVCLS).forEach(cid=>{ if(!garde.has(cid) && (DEVCLS[cid] || []).length){ DEVCLS[cid] = []; quitte = true; } });
    Object.keys(agendaSuivi()).forEach(cid=>{ if(!garde.has(cid)){ delete agendaSuivi()[cid]; quitte = true; } });
    Object.keys(coursSuivis()).forEach(cid=>{ if(!garde.has(cid)){ delete coursSuivis()[cid]; quitte = true; } });
    if(quitte){ devclsSave(); saveContent(); }
    try{
      await chargerDevoirs(ids);
      appliquerDevoirsSuivis();
      MY_CLASSES.filter(c=>c.role !== "pending").forEach(c=>{
        const extra = nouveauxDevoirs(c, DEVCLS[c.id] || []).length;
        if(c.id in base) clsNbPoser(c.id, base[c.id] + extra);
      });
    }catch(e){}
  }catch(e){}
  nouveautesEnCours = false;
  majPastillesClasses();
}

const IC_MEMBRES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1.5a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3V19"/><circle cx="9.5" cy="8" r="3"/><path d="M21 19v-1.5a3 3 0 0 0-2.3-2.9"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/></svg>';
async function openClass(c){
  curClass = c; CLS_GERE = c.role === "owner" || c.role === "adjoint";
  showScreen("class");
  const ccl = (USER_SETTINGS.clsCouleurs || {})[c.id];   // l'en-tête à la couleur choisie pour la classe
  teinterEcran(document.getElementById("screen-class"), ccl && HM_HEX[ccl] ? HM_HEX[ccl] : null);
  document.getElementById("class-title").textContent = c.name;
  const box = document.getElementById("class-inner");
  box.innerHTML = `<div class="empty-note">Chargement…</div>`;

  let items = [], membres = [], monRole = c.role, projetsCls = [];
  try{
    const a = await api("class_items", { class_id:c.id });
    items = a.items || [];
    projetsCls = (a.projets || []).filter(it=>PROJETS[projetDeItem(it)]);
    // la liste des membres : seuls le créateur et ses adjoints la voient
    if(c.role === "owner" || c.role === "adjoint"){
      const b = await api("class_members", { class_id:c.id });
      membres = b.membres || []; monRole = b.monRole || monRole;
    }
  }catch(e){
    box.innerHTML = vide("alerte", "Impossible d'ouvrir cette classe", "Vérifie ta connexion, puis réessaie.");
    return;
  }
  // les devoirs : sans réseau, on garde la dernière liste connue
  let devs = DEVCLS[c.id] || [];
  try{ devs = (await chargerDevoirs([c.id]))[c.id] || []; }catch(e){}
  appliquerDevoirsSuivis();
  if(curClass !== c) return;                 // on a changé de page entre-temps
  if(suitCours(c.id)) await suivreToutesMatieres(c, items);
  box.innerHTML = "";
  CLS_ITEMS[c.id] = items;
  const gere = monRole === "owner" || monRole === "adjoint";
  CLS_GERE = gere; refreshFab("class");

  // sous le nom : les membres, en pastille. Une demande en attente y pose une pastille rose.
  const attente = gere ? membres.filter(m=>m.role === "pending") : [];
  CLS_ATTENTE[c.id] = attente.length;
  const dedans = membres.filter(m=>m.role !== "pending" && m.role !== "retire");
  const hdp = document.querySelector("#screen-class .hd-plus");
  let bar = hdp ? hdp.querySelector(".cls-hdbar") : null;
  if(hdp && !bar){ bar = el("div","cls-hdbar"); hdp.appendChild(bar); }
  if(!bar) bar = el("div","cls-bar");
  bar.innerHTML = "";
  // un simple membre ne voit pas qui d'autre est dans la classe
  if(gere){
    const mp = el("button","cls-pill"); mp.type = "button";
    mp.innerHTML = `${IC_MEMBRES}${dedans.length} membre${dedans.length > 1 ? "s" : ""}`;
    pastille(mp, attente.length, attente.length + " demande" + (attente.length > 1 ? "s" : "") + " en attente");
    mp.addEventListener("click",()=>{ haptic(); ouvrirMembres(c, membres, monRole); });
    bar.appendChild(mp);
  }

  // Cours / Devoirs : un seul bouton, comme le choix CM / TD d'une matière
  const nouv = nouveauxClasse(c, items);
  const nvDev = nouveauxDevoirs(c, devs);
  const nMat = new Set(nouv.map(it=>it.subject_title)).size;
  const vue = CLS_VUE[c.id] || "cours";
  const autre = vue === "cours" ? nvDev.length : nouv.length;
  // Cours / Devoirs : deux pastilles ; un point signale du nouveau dans l'autre
  [["cours","Cours", nouv.length],["devoirs","Devoirs", nvDev.length]].forEach(([v, nom, nn])=>{
    const b = el("button","cls-pill cls-vue-p" + (v === vue ? " on" : "")); b.type = "button";
    b.innerHTML = esc(nom) + (nn && v !== vue ? '<span class="tp-pt" aria-label="Du nouveau"></span>' : "");
    b.addEventListener("click",()=>{ haptic(); if(v !== vue){ CLS_VUE[c.id] = v; openClass(c); } });
    bar.appendChild(b);
  });
  if(!hdp) box.appendChild(bar);

  if(vue === "devoirs"){
    renderDevoirsClasse(c, box, gere, devs);
    // vus en ouvrant la liste : la pastille des devoirs s'éteint
    clsNbPoser(c.id, nMat + attente.length);
    return;
  }
  clsNbPoser(c.id, nMat + attente.length + nvDev.length);

  // Suivre les cours : comme les devoirs, toutes les matières de la classe arrivent dans les tiennes
  const suitC = suitCours(c.id);
  const swc = el("button","cls-suivre" + (suitC ? " on" : "")); swc.type = "button";
  swc.innerHTML = `<span class="ev-share-t"><b>Suivre les cours</b><small>Ils arrivent dans tes matières. Tu peux toujours les retirer.</small></span><span class="ev-sw"></span>`;
  swc.addEventListener("click", async ()=>{
    haptic();
    if(suitC){
      delete coursSuivis()[c.id];
      USER_SETTINGS.follows = follows().filter(f=>!(f.type === "subject" && f.class_id === c.id));
      await syncFollows();
      // les matières créées pour cette classe, restées vides, s'en vont avec elle
      const vides = SUBJECTS.filter(x=>x._cls === c.id && x._own &&
        ["cm","td","fc","qcm","oq","tr","dev"].every(k=>!(x[k] || []).some(y=>!y._shared)));
      vides.forEach(x=>{ SUBJECTS.splice(SUBJECTS.indexOf(x), 1); delete SEMESTRES[x.id]; });
      if(vides.length) nettoyerUEsVides();
      saveContent();
      try{ renderSemestres(); }catch(e){}
      toast("Tu ne suis plus les cours de cette classe.");
    }else{
      coursSuivis()[c.id] = true;
      saveContent();
      toast("Ajout à tes matières…");
      const n = await suivreToutesMatieres(c, items);
      toast(n ? (n > 1 ? n + " matières suivies." : "1 matière suivie.") + " Les prochains cours arriveront seuls." : "Les prochains cours arriveront seuls.");
    }
    openClass(c);
  });
  swc.style.marginBottom = "4px";
  box.appendChild(swc);

  // les projets partagés ici : chacun les ajoute à ses projets s'il le veut
  if(projetsCls.length){
    const lab = el("div","qc-group"); lab.textContent = "Projets"; box.appendChild(lab);
    projetsCls.forEach(it=>{
      const pid = projetDeItem(it), pj = PROJETS[pid];
      const dejaLa = mesProjets().includes(pid) || (pid === "psycho" && isCloseFriend());
      const card = el("button","ecue-card cls-mat cls-projet"); card.type = "button";
      card.innerHTML = `<div class="ecue-top"><div class="cls-projet-ic">${icone(pj.icone)}</div><div class="ecue-info"><div class="ecue-name">${esc(pj.titre)}</div>
        <div class="ecue-meta">${dejaLa ? `<span class="ecue-status ajour">✓ Dans tes projets</span>` : `<span class="cls-mat-n">Partagé par ${esc(it.author)} · touche pour l'ajouter</span>`}</div></div><span class="ecue-arrow">${dejaLa ? "→" : "+"}</span></div>`;
      card.addEventListener("click",()=>{
        haptic();
        if(dejaLa){ if(pid === "psycho" && isCloseFriend()) renderPsycho(); else renderProjet(pid); return; }
        follows().push({ type:"projet", item_id:it.id, class_id:c.id, projet:pid });
        saveContent();
        toast("« " + pj.titre + " » est dans tes projets, sur l'écran des semestres.");
        openClass(c);
      });
      box.appendChild(card);
    });
    const lab2 = el("div","qc-group"); lab2.textContent = "Cours"; box.appendChild(lab2);
  }
  if(!items.length){
    const e = el("div");
    e.innerHTML = vide("vide", "Aucun cours publié", gere ? "Touche « Publier un de mes cours » pour en partager un." : "Les cours partagés dans cette classe apparaîtront ici.");
    box.appendChild(e);
  }else{
    const parMatiere = {};
    items.forEach(it=>{ (parMatiere[it.subject_title] ||= []).push(it); });
    const titreM = el("div","hm-sec cls-sec"); titreM.innerHTML = `<h3>Matières</h3><span>${Object.keys(parMatiere).length}</span>`; box.appendChild(titreM);
    const liste = el("div","hm-card cls-liste"); box.appendChild(liste);
    const COUL = ["v","b","g","y","r"];
    Object.keys(parMatiere)
      .sort((x,y)=>x.localeCompare(y,"fr",{ sensitivity:"base" }))
      .forEach(mat=>{
        const tous = parMatiere[mat];
        const nv = nouv.filter(it=>it.subject_title === mat);
        const tout = tous.every(possedeItem);
        const nCh = tous.filter(it=>it.kind !== "revision").length;
        const aRev = tous.some(it=>it.kind === "revision");
        const detail = [nCh ? nCh + " chapitre" + (nCh > 1 ? "s" : "") : "", aRev ? "révisions" : ""].filter(Boolean).join(" · ");
        const ligne = el("button","cls-ligne"); ligne.type = "button";
        const sjm = SUBJECTS.find(x=>titreNu(x.title) === titreNu(mat));
        const cc = sjm ? hmCouleur(sjm) : COUL[hmHash(mat) % COUL.length];
        const icm = sjm ? iconeMatiere(sjm) : icone(themeMatiere({ title:mat }) || Object.keys(MAT_IC)[hmHash(titreNu(mat)) % Object.keys(MAT_IC).length]);
        const sous = nv.length ? `<em class="cls-nv">✦ ${nv.length === 1 ? "1 nouveau" : nv.length + " nouveaux"}</em>` : tout ? `<i>✓ dans tes cours</i>` : "";
        ligne.innerHTML = `<span class="cls-l-ic hm-doux-${cc}">${icm}</span><span class="cls-l-t"><b>${esc(mat)}</b><small>${esc(detail)}${detail && sous ? " · " : ""}${sous}${isSubFollowed(c.id, mat) && !suitC && !tout ? " · suivie" : ""}</small></span><span class="cls-l-ch">›</span>`;
        ligne.addEventListener("click",()=>{ haptic(); ouvrirMatiereClasse(c, mat, tous, monRole); });
        liste.appendChild(ligne);
      });
  }

  // publier sans quitter la classe : le + flottant
}

// ── Suivre tous les cours d'une classe ──
function coursSuivis(){
  if(!USER_SETTINGS.coursSuivis || typeof USER_SETTINGS.coursSuivis !== "object") USER_SETTINGS.coursSuivis = {};
  return USER_SETTINGS.coursSuivis;
}
function suitCours(cid){ return !!coursSuivis()[cid]; }
// Chaque matière de la classe est suivie et rangée dans la mienne du même nom,
// ou dans une matière créée à l'identique. Les miennes seules ne sont pas suivies : je les ai déjà.
async function suivreToutesMatieres(c, items){
  const parMat = {};
  items.forEach(it=>{ (parMat[it.subject_title] ||= []).push(it); });
  let n = 0;
  for(const mat of Object.keys(parMat)){
    if(isSubFollowed(c.id, mat)) continue;
    const autres = parMat[mat].filter(it=>it.author !== whoAmI());
    if(!autres.length) continue;
    const sj = SUBJECTS.find(x=>sansAccents(x.title) === sansAccents(mat));
    let id = sj ? sj.id : null;
    if(!id){
      id = creerMatiereDepuis(mat, (await metaDistante(autres[0].id)) || metaDepuisDonnees(mat));
      const cree = SUBJECTS.find(x=>x.id === id);
      if(cree) cree._cls = c.id;              // créée pour suivre cette classe : repart avec elle si elle reste vide
    }
    follows().push({ type:"subject", class_id:c.id, subject_title:mat, subject_id:id });
    n++;
  }
  if(n){ saveContent(); await syncFollows(); }
  return n;
}

const CLS_VUE = {};      // classId → « cours » ou « devoirs »

// Une matière de la classe : ses chapitres, dans la même feuille que le choix d'un CM.
// Point rose : nouveau. Point vert : déjà dans tes cours.
function ouvrirMatiereClasse(c, mat, tous, monRole){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = mat;
  const box = document.getElementById("pick-list");
  box.innerHTML = "";
  const suivie = isSubFollowed(c.id, mat);
  const ts = el("button","cal-row chap-ligne" + (suivie ? " actif" : ""));
  ts.type = "button";
  ts.innerHTML = `<span class="type-ic ic-box">${ICO(suivie ? "valide" : "groupe")}</span><div class="cal-txt"><div class="cal-name">${suivie ? "Matière suivie" : "Tout suivre"}</div>
    <div class="cal-url">${suivie ? "Les prochains chapitres arrivent seuls dans tes cours" : "Tout ajouter à tes cours, et les prochains aussi"}</div></div>`;
  ts.addEventListener("click",()=>{ haptic(); closePicker(); setTimeout(()=>followSubject(c, mat, tous[0] && tous[0].id), 320); });
  box.appendChild(ts);
  const vus = clsVus().vus;
  ["cm","td","devoir","revision"].forEach(k=>{
    const list = tous.filter(x=>x.kind === k);
    if(!list.length) return;
    const t = el("div","cls-kind"); t.textContent = KIND_LABEL[k] || k;
    box.appendChild(t);
    list.forEach(it=>{
      const parMatiere = !!subFollowOf(it);
      const dansMesCours = isFollowed(it.id) || parMatiere;
      const amoi = it.author === whoAmI();
      const nouveau = !possedeItem(it) && !vus[it.id];
      const r = el("button","cal-row chap-ligne" + (dansMesCours || amoi ? " revise" : "") + (nouveau ? " nouveau" : ""));
      r.type = "button";
      const etat = nouveau ? "Nouveau" : amoi ? "Publié par toi" : dansMesCours ? "Dans tes cours" : "";
      r.innerHTML = `<span class="rv-dot"></span><div class="cal-txt"><div class="cal-name">${esc(it.label ? libelleChapitre(it.label) : KIND_LABEL[it.kind] || "")}</div>
        <div class="cal-url">${etat ? etat + (amoi ? "" : " · ") : ""}${amoi ? "" : "par " + esc(it.author)}</div></div>`;
      r.addEventListener("click",()=>{ haptic(); closePicker(); setTimeout(()=>openSharedItem(it), 250); });
      // glisser vers la gauche : retirer de chez soi, et dépublier si c'est le sien
      const actions = [];
      if(parMatiere) actions.push({ label:"Ne plus suivre\ncette matière", doux:true, fn:()=>{
        closePicker();
        USER_SETTINGS.follows = follows().filter(f=>
          !(f.type === "subject" && f.class_id === it.class_id && f.subject_title === it.subject_title));
        saveContent();
        syncFollows().then(()=>{ toast("Matière retirée."); openClass(c); });
      }});
      else if(isFollowed(it.id)) actions.push({ label:"Retirer\nde mes cours", doux:true, fn:()=>{
        closePicker(); unfollowItem(it.id); toast("Retiré de tes cours."); openClass(c);
      }});
      if(amoi || monRole === "owner") actions.push({ label:"Dépublier", fn:()=>{ closePicker(); setTimeout(()=>depublier(c, it), 320); } });
      box.appendChild(actions.length ? swipeRow(r, actions) : r);
    });
  });
  if(tous.some(it=>it.author === whoAmI() || monRole === "owner")){
    const lg = el("div","pick-legend");
    lg.innerHTML = "<span>Glisse un chapitre vers la gauche pour le retirer.</span>";
    lg.style.margin = "12px 4px 2px";
    box.appendChild(lg);
  }
  document.getElementById("pick-sheet").classList.add("open");
}

// Les membres : la liste, les demandes à valider, les adjoints.
// la pastille d'un membre : l'initiale, à une couleur qui lui reste
function pastilleMembre(pseudo){
  const k = HM_COUL_AUTO[hmHash(String(pseudo)) % HM_COUL_AUTO.length];
  return `<span class="mem-ic hm-doux-${k}">${esc(String(pseudo || "?").charAt(0).toUpperCase())}</span>`;
}
function titreMembres(txt, n){ const t = el("div","hm-sec cls-sec mem-sec"); t.innerHTML = `<h3>${esc(txt)}</h3><span>${n}</span>`; return t; }
function ouvrirMembres(c, membres, monRole){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = "Membres";
  const box = document.getElementById("pick-list");
  box.innerHTML = "";
  const gere = monRole === "owner" || monRole === "adjoint";
  const role = (cible, r)=>{ closePicker(); setTimeout(()=>setRole(c, cible, r), 250); };
  const attente = gere ? membres.filter(m=>m.role === "pending") : [];
  if(attente.length){
    box.appendChild(titreMembres("Demandes en attente", attente.length));
    attente.forEach(m=>{
      const row = el("div","mem-row nouveau");
      row.insertAdjacentHTML("beforeend", pastilleMembre(m.pseudo));
      const nm = el("div","mem-name"); nm.textContent = m.pseudo;
      const ok = el("button","mem-act go"); ok.type = "button"; ok.textContent = "Accepter";
      ok.addEventListener("click",()=>role(m.pseudo, "membre"));
      const no = el("button","mem-act"); no.type = "button"; no.textContent = "Refuser";
      no.addEventListener("click",()=>role(m.pseudo, "retire"));
      row.appendChild(nm); row.appendChild(ok); row.appendChild(no);
      box.appendChild(row);
    });
  }
  const dedans = membres.filter(m=>m.role !== "pending" && m.role !== "retire");
  if(dedans.length){
    box.appendChild(titreMembres("Dans la classe", dedans.length));
    const ordre = { owner:0, adjoint:1, membre:2 };
    dedans.slice().sort((a,b)=>(ordre[a.role] ?? 3) - (ordre[b.role] ?? 3) || String(a.pseudo).localeCompare(String(b.pseudo), "fr"))
      .forEach(m=>{
        const row = el("div","mem-row");
        row.insertAdjacentHTML("beforeend", pastilleMembre(m.pseudo));
        const nm = el("div","mem-name");
        nm.innerHTML = esc(m.pseudo) + (m.pseudo === whoAmI() ? " <small>(toi)</small>" : "") +
          (m.role === "owner" ? '<small class="mem-role">créateur</small>' : m.role === "adjoint" ? '<small class="mem-role">adjoint</small>' : "");
        row.appendChild(nm);
        if(monRole === "owner" && m.role !== "owner"){
          const b = el("button","mem-act"); b.type = "button";
          b.textContent = m.role === "adjoint" ? "Retirer l'adjoint" : "Nommer adjoint";
          b.addEventListener("click",()=>role(m.pseudo, m.role === "adjoint" ? "membre" : "adjoint"));
          row.appendChild(b);
        }
        // retirer quelqu'un : le créateur, n'importe qui sauf lui-même ; un adjoint, les simples membres
        const peutRetirer = m.pseudo !== whoAmI() && m.role !== "owner" && (monRole === "owner" || (monRole === "adjoint" && m.role === "membre"));
        if(peutRetirer){
          const x = el("button","mem-act mem-retirer"); x.type = "button";
          x.setAttribute("aria-label", "Retirer " + m.pseudo + " de la classe");
          x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
          x.addEventListener("click",()=>{
            haptic(); closePicker();
            setTimeout(()=>confirmer("Retirer " + m.pseudo + " ?",
              m.pseudo + " ne verra plus les cours ni les devoirs de « " + c.name + " ». Pour revenir, il lui faudra redemander avec le code.",
              "Retirer", ()=>{ setRole(c, m.pseudo, "retire"); toast(m.pseudo + " a été retiré de la classe."); }), 260);
          });
          row.appendChild(x);
        }
        box.appendChild(row);
      });
  }
  if(!attente.length && !dedans.length) box.innerHTML = vide("groupe", "Personne pour l'instant", "Donne le code de la classe pour que d'autres la rejoignent.");
  // le code pour inviter : seul le créateur l'a, c'est lui qui le donne
  if(c.code){
    const row = el("div","mem-row mem-code");
    const nm = el("div","mem-name"); nm.innerHTML = `<small>Code pour inviter</small><b>${esc(c.code)}</b>`;
    const cp = el("button","mem-act"); cp.type = "button"; cp.textContent = "Copier";
    cp.setAttribute("aria-label", "Copier le code " + c.code);
    cp.addEventListener("click", async ()=>{
      haptic();
      try{ await navigator.clipboard.writeText(c.code); toast("Code copié. Donne-le à ta classe."); }
      catch(e){ toast("Code de la classe : " + c.code); }
    });
    row.insertAdjacentHTML("beforeend", `<span class="mem-ic hm-doux-v">${icone("lien")}</span>`);
    row.appendChild(nm); row.appendChild(cp);
    box.prepend(row);
  }
  if(monRole === "owner"){
    const lg = el("div","pick-legend");
    lg.innerHTML = "<span>Les adjoints peuvent publier et valider les demandes.</span>";
    lg.style.margin = "12px 4px 2px";
    box.appendChild(lg);
  }
  document.getElementById("pick-sheet").classList.add("open");
}

// ══════════════════════════════════════════════════
// DEVOIRS PARTAGÉS : l'agenda d'une classe
// ══════════════════════════════════════════════════
// Un devoir partagé est posé sur un cours précis de l'emploi du temps (jour, cours, heure).
// Ceux qui suivent les devoirs de la classe le reçoivent comme une annotation de ce cours.
// L'annotation garde le lien : src (id du devoir), cls (classe), v (version reçue), base (contenu reçu).
// Tant qu'on n'y touche pas, elle suit les mises à jour. Modifiée, elle devient la tienne :
// une nouvelle version de la classe ne l'écrase plus, elle se pose à côté (N.autres).
// Un cours déjà annoté garde ta note, et le devoir de la classe s'ajoute à côté.
const DEVCLS_KEY = "revision_devoirs_classes_v1";
let DEVCLS = {};                         // classId → devoirs de la classe (gardés pour le hors ligne)
try{ DEVCLS = JSON.parse(localStorage.getItem(DEVCLS_KEY) || "{}") || {}; }catch(e){ DEVCLS = {}; }
function devclsSave(){ try{ localStorage.setItem(DEVCLS_KEY, JSON.stringify(DEVCLS)); }catch(e){} }
function agendaSuivi(){
  if(!USER_SETTINGS.agendaSuivi || typeof USER_SETTINGS.agendaSuivi !== "object") USER_SETTINGS.agendaSuivi = {};
  return USER_SETTINGS.agendaSuivi;
}
function suitAgenda(cid){ return !!agendaSuivi()[cid]; }
function peutPublier(c){ return !!c && (c.role === "owner" || c.role === "adjoint"); }
function jourIso(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function devoirAVenir(it){ return !!(it.payload && it.payload.date && it.payload.date >= jourIso(new Date())); }
function chsSig(x){ return Array.isArray(x && x.chs) ? x.chs.slice().sort().join("¦") : ""; }
function sigDevoir(p){ return [p.type || "", String(p.note || "").trim(), p.date || "", p.heure || ""].join("|") + (p.fin ? "|" + p.fin : "") + (chsSig(p) ? "|" + chsSig(p) : ""); }
function memeContenu(a, b){ return (a.type || "") === (b.type || "") && String(a.note || "").trim() === String(b.note || "").trim() && chsSig(a) === chsSig(b); }
function chsDe(p){ return Array.isArray(p && p.chs) && p.chs.length ? { chs:p.chs.slice() } : {}; }
const LIEN_DEVOIR = ["src","cls","v","base","auteur","moi"];
function couperLien(N){ LIEN_DEVOIR.forEach(f=>delete N[f]); }
// « Garder les deux » : le devoir de la classe reste à côté du tien, dans N.autres.
// Il y suit les mises à jour de son auteur ; le tien ne bouge pas.
function autresDe(N){ return N && Array.isArray(N.autres) ? N.autres : []; }
// mis de côté (effacé, « garder le mien », retiré) tant que l'auteur n'a rien changé
function estIgnore(N, id, sig){
  if(!N) return false;
  if(N.ignore && N.ignore.id === id && N.ignore.v === sig) return true;
  return Array.isArray(N.ignores) && N.ignores.some(x=>x.id === id && x.v === sig);
}
function ignorer(N, id, sig){
  N.ignores = (Array.isArray(N.ignores) ? N.ignores : []).filter(x=>x.id !== id).concat([{ id, v:sig }]);
}
function noteVide(N){ return !N.type && !String(N.note || "").trim() && !N.subj && !N.done && !autresDe(N).length; }

async function chargerDevoirs(ids){
  ids = ids.filter(Boolean);
  if(!ids.length) return {};
  const out = await api("agenda_fetch", { class_ids:ids });
  const par = {};
  ids.forEach(id=>{ par[id] = []; });
  (out.items || []).forEach(it=>{ (par[it.class_id] ||= []).push(it); });
  Object.assign(DEVCLS, par);
  devclsSave();
  return par;
}

// le cours de MON emploi du temps qui correspond au devoir : même cours, sinon même matière
function creneauDuDevoir(it){
  const p = it.payload || {};
  if(!p.date) return null;
  if(p.jour){
    // déjà chez moi (la mienne, ou reçue) : on garde sa clé ; l'auteur a changé le jour : on la déplace
    let k = Object.keys(EDTNOTES).find(x=>x.startsWith("jour|") && EDTNOTES[x] && EDTNOTES[x].src === it.id);
    if(k && k.split("|")[1] !== p.date){
      const nk = "jour|" + p.date + "|" + k.split("|")[2];
      EDTNOTES[nk] = EDTNOTES[k]; delete EDTNOTES[k]; k = nk;
    }
    return echeanceEv(k || "jour|" + p.date + "|" + it.id);
  }
  const evs = eventsOn(new Date(p.date + "T12:00:00"));
  if(!evs.length) return null;
  const cours = plat(p.cours || ""), mat = plat(it.subject_title || "");
  const heure = l => l.find(e=>hhmm(e.start) === p.heure) || l[0];
  let l = cours ? evs.filter(e=>plat(nomCourt(e.title)) === cours) : [];
  if(l.length) return heure(l);
  l = evs.filter(e=>{ const sj = matiereDuCours(e); return sj && plat(sj.title) === mat; });
  return l.length ? heure(l) : null;
}

// Pose les devoirs suivis dans l'agenda. Appelé quand les devoirs ou l'emploi du temps changent.
function appliquerDevoirsSuivis(){
  if(typeof EDT === "undefined") return;
  const suivis = Object.keys(agendaSuivi()).filter(k=>agendaSuivi()[k]);
  const presents = new Set();            // devoirs encore publiés dans une classe suivie
  let change = false;
  suivis.forEach(cid=>(DEVCLS[cid] || []).forEach(it=>{
    presents.add(it.id);
    if(!devoirAVenir(it)) return;
    const e = creneauDuDevoir(it);
    if(!e) return;
    const k = evKey(e), p = it.payload, sig = sigDevoir(p);
    const N = EDTNOTES[k];
    const lien = { src:it.id, cls:it.class_id, v:sig, base:Object.assign({ type:p.type || "", note:p.note || "" }, chsDe(p)), auteur:it.author, moi:it.author === whoAmI() };
    if(e.jour) Object.assign(lien, { titre:it.subject_title, heure:p.heure || "", fin:p.fin || "" });
    const aCote = Object.assign({ src:it.id, cls:it.class_id, auteur:it.author, type:p.type || "", note:p.note || "", v:sig }, chsDe(p));
    // effacé exprès, ou « garder le mien » : on ne revient pas tant que l'auteur n'a rien changé
    if(estIgnore(N, it.id, sig)) return;
    // déjà gardé à côté de ta note : il suit simplement les mises à jour
    const a = autresDe(N).find(x=>x.src === it.id);
    if(a){
      if(a.v !== sig){ delete a.chs; Object.assign(a, { type:p.type || "", note:p.note || "", v:sig, auteur:it.author, modifie:true }, chsDe(p)); change = true; }
      return;
    }
    if(!N || (!N.type && !String(N.note || "").trim())){
      EDTNOTES[k] = Object.assign({ type:p.type || "", note:p.note || "", subj:(N && N.subj) || "", done:!!(N && N.done) }, chsDe(p), lien);
      change = true; return;
    }
    if(N.src === it.id){
      if(N.v === sig) return;
      // pas retouché depuis la dernière version reçue : on suit
      if(memeContenu(N, N.base || {}) || memeContenu(N, p)){
        delete N.chs; Object.assign(N, { type:p.type || "", note:p.note || "" }, chsDe(p), lien); change = true;
        if(!N.moi) N.modifie = true;
        return;
      }
      // retouché : ta version devient la tienne, la nouvelle de la classe se pose à côté
      couperLien(N);
    }else if(memeContenu(N, p)){ Object.assign(N, lien); change = true; return; }
    // déjà une note sur ce cours : les deux coexistent, chacun retire ce qu'il veut
    N.autres = autresDe(N).concat([aCote]);
    change = true;
  }));
  // ce qui n'est plus là : devoir retiré par l'auteur, ou classe plus suivie
  const charge = cid => Array.isArray(DEVCLS[cid]);
  Object.keys(EDTNOTES).forEach(k=>{
    const N = EDTNOTES[k];
    if(!N || typeof N !== "object") return;
    if(N.conflit){ delete N.conflit; change = true; }     // ancien modèle, sans objet
    // les devoirs gardés à côté : partis avec la classe, ou plus suivis
    if(autresDe(N).length){
      const reste = N.autres.filter(a=>suitAgenda(a.cls) && !(charge(a.cls) && !presents.has(a.src)));
      if(reste.length !== N.autres.length){
        N.autres = reste; change = true;
        if(!reste.length) delete N.autres;
        if(noteVide(N)){ delete EDTNOTES[k]; return; }
      }
    }
    if(!N.src || !N.cls) return;
    const parti = charge(N.cls) && !(DEVCLS[N.cls] || []).some(it=>it.id === N.src);
    const lache = !N.moi && !suitAgenda(N.cls);
    if(!parti && !lache) return;
    // reçu et jamais retouché : il part avec la classe. Retouché ou à moi : il reste, sans lien.
    if(!N.moi && memeContenu(N, N.base || {})){ N.type = ""; N.note = ""; }
    couperLien(N);
    if(noteVide(N)) delete EDTNOTES[k];
    change = true;
  });
  if(change){
    notesSave();
    try{ renderDashboard(); }catch(e){}
    const scr = document.getElementById("screen-edt");
    if(scr && scr.classList.contains("active")) renderEDT();
  }
  return change;
}
// (l'emploi du temps qui pose les devoirs suivis : à la fin de 05-agenda.js, après loadEDT)

// devoirs à venir publiés par d'autres et jamais vus
function nouveauxDevoirs(c, items){
  const v = clsVus();
  if(!v.initDev || typeof v.initDev !== "object") v.initDev = {};
  if(!v.initDev[c.id]){ v.initDev[c.id] = 1; items.forEach(it=>{ v.vus[it.id] = 1; }); clsVusSave(); }
  return items.filter(it=>devoirAVenir(it) && it.author !== whoAmI() && !v.vus[it.id]);
}
const TAG_DEVOIR = { controle:"Contrôle", devoir:"À rendre", "":"Note" };

// ── Partager depuis l'annotation d'un cours ──
let evPartage = null;                 // classe choisie dans la feuille du cours
function classesPublication(){ return MY_CLASSES.filter(peutPublier); }
function renderEvPartage(e, n, opts){
  const box = document.getElementById("ev-partage");
  if(!box) return;
  box.innerHTML = "";
  const k = evKey(e);
  // les devoirs de la classe gardés à côté du tien
  autresDe(n).forEach(a=>{
    const c = MY_CLASSES.find(x=>x.id === a.cls);
    const r = el("div","ev-autre");
    r.innerHTML = `<div class="ev-autre-t"><small>Aussi pour ce cours · ${esc(c ? c.name : "ta classe")} · par ${esc(a.auteur || "?")}</small>
      <p><b class="cf-tag ${a.type || "note"}">${TAG_DEVOIR[a.type || ""]}</b>${a.note ? " " + noteAvecLiens(a.note) : ""}</p></div>`;
    const x = el("button","ev-autre-x"); x.type = "button"; x.textContent = "Retirer";
    x.addEventListener("click",()=>{
      haptic();
      const N = EDTNOTES[k];
      if(!N) return;
      N.autres = autresDe(N).filter(y=>y.src !== a.src);
      if(!N.autres.length) delete N.autres;
      ignorer(N, a.src, a.v);
      notesSave(); r.remove(); renderEDT(); renderDashboard();
      toast("Retiré. Il reviendra seulement s'il est modifié.");
    });
    r.appendChild(x);
    box.appendChild(r);
  });
  // reçu d'une classe
  if(n && n.src && !n.moi){
    const c = MY_CLASSES.find(x=>x.id === n.cls);
    const i = el("div","ev-recu");
    i.textContent = "Reçu de " + (c ? c.name : "ta classe") + " · par " + (n.auteur || "?") + ". Si tu le modifies, il devient le tien.";
    box.appendChild(i);
    evPartage = null;
    return;                              // un devoir reçu ne se repartage pas : il existe déjà dans la classe
  }
  const cls = classesPublication();
  evPartage = (opts && opts.partager) || (n && n.moi && n.src ? n.cls : null);
  if(!cls.length) return;
  // depuis l'agenda : pas d'interrupteurs, la fiche reste simple. Un devoir déjà partagé
  // le signale d'une ligne, et ses modifications partent quand même vers la classe.
  if(!(opts && (opts.partager || opts.classe))){
    if(evPartage){
      const c = MY_CLASSES.find(x=>x.id === evPartage);
      const i = el("div","ev-recu"); i.textContent = "Partagé avec " + (c ? c.name : "ta classe") + ". Tes modifications y seront envoyées.";
      box.appendChild(i);
    }
    return;
  }
  const lbl = el("div","ev-label"); lbl.textContent = "Partager";
  box.appendChild(lbl);
  cls.forEach(c=>{
    const r = el("button","ev-share" + (evPartage === c.id ? " on" : "")); r.type = "button";
    r.innerHTML = `<span class="ev-share-t"><b>Avec ${esc(c.name)}</b><small>Ceux qui suivent les devoirs le recevront</small></span><span class="ev-sw"></span>`;
    r.addEventListener("click",()=>{
      haptic();
      evPartage = evPartage === c.id ? null : c.id;
      box.querySelectorAll(".ev-share").forEach(x=>x.classList.remove("on"));
      if(evPartage) r.classList.add("on");
    });
    box.appendChild(r);
  });
}
async function partagerAnnotation(k, e, cid, silence){
  const N = EDTNOTES[k];
  const plein = !!(N && (N.type || String(N.note || "").trim()));
  const nomCls = id => (MY_CLASSES.find(x=>x.id === id) || {}).name || "la classe";
  try{
    // retiré du partage, déplacé vers une autre classe, ou vidé : on dépublie
    if(N && N.moi && N.src && (cid !== N.cls || !plein)){
      const ancien = N.src, acls = N.cls;
      await api("item_delete", { item_id:ancien });
      DEVCLS[acls] = (DEVCLS[acls] || []).filter(it=>it.id !== ancien); devclsSave();
      couperLien(N);
      if((!cid || !plein) && !silence) toast("Retiré de " + nomCls(acls) + ".");
    }
    if(!cid || !plein) return true;
    const sj = e.jour ? (N.subj ? SUBJECTS.find(x=>x.id === N.subj) : null) : matiereDuCours(e);
    const payload = e.jour
      ? Object.assign({ label:e.iso, date:e.iso, heure:N.heure || "", jour:true, type:N.type || "", note:String(N.note || "").trim().slice(0, 400), cours:"" }, N.fin ? { fin:N.fin } : {}, chsDe(N))
      : Object.assign({ label:jourIso(e.start), date:jourIso(e.start), heure:hhmm(e.start), type:N.type || "", note:String(N.note || "").trim().slice(0, 400), cours:nomCourt(e.title) }, chsDe(N));
    const titre = e.jour ? nomDevoirJour(N, sj) : sj ? sj.title : nomCourt(e.title).replace(/\s+(CM|TD)(\s*\d+)?$/i, "");
    let id = N.moi && N.src && N.cls === cid ? N.src : null;
    if(id) await api("item_update", { item_id:id, payload });
    else id = ((await api("item_publish", { class_id:cid, kind:"agenda", subject_title:titre, payload })).item || {}).id;
    if(!id) throw new Error("sans id");
    Object.assign(N, { src:id, cls:cid, moi:true, auteur:whoAmI(), v:sigDevoir(payload), base:Object.assign({ type:payload.type, note:payload.note }, chsDe(payload)) });
    const it = { id, class_id:cid, author:whoAmI(), kind:"agenda", subject_title:titre, label:payload.label, payload };
    DEVCLS[cid] = (DEVCLS[cid] || []).filter(x=>x.id !== id).concat([it]); devclsSave();
    clsVus().vus[id] = 1; clsVusSave();
    if(!silence) toast("Partagé avec " + nomCls(cid) + ".");
    return true;
  }catch(err){
    if(!silence) toast("Le partage n'a pas marché. Vérifie ta connexion, puis réessaie.");
    return false;
  }finally{
    notesSave();
  }
}

// ── La vue Devoirs d'une classe ──
function renderDevoirsClasse(c, box, gere, devs){
  const cid = c.id;
  const suit = suitAgenda(cid);
  const sw = el("button","cls-suivre" + (suit ? " on" : "")); sw.type = "button";
  sw.innerHTML = `<span class="ev-share-t"><b>Suivre les devoirs</b><small>Ils arrivent dans ton agenda. Tu peux toujours les modifier.</small></span><span class="ev-sw"></span>`;
  sw.addEventListener("click",()=>{
    haptic();
    agendaSuivi()[cid] = !suit;
    if(suit) delete agendaSuivi()[cid];
    saveContent();
    appliquerDevoirsSuivis();
    toast(suit ? "Tu ne suis plus les devoirs de cette classe." : "Les devoirs arrivent dans ton agenda.");
    openClass(c);
  });
  box.appendChild(sw);

  const zonePasses = el("div"); box.appendChild(zonePasses);   // rempli plus bas, affiché en haut
  const avenir = devs.filter(devoirAVenir).sort((a,b)=>(a.payload.date + (a.payload.heure || "")).localeCompare(b.payload.date + (b.payload.heure || "")));
  const vus = clsVus().vus;
  if(!avenir.length){
    const e = el("div");
    e.innerHTML = vide("calendrier", "Aucun devoir à venir", gere ? "Touche « Ajouter un devoir » pour en partager un." : "Les devoirs partagés dans cette classe apparaîtront ici.");
    box.appendChild(e);
  }
  // une liste de devoirs, une carte par semaine (à venir, ou l'historique), comme à l'accueil
  const lister = (liste, cible, passe)=>{
  let semaine = null, carte = null;
  liste.forEach(it=>{
    const p = it.payload;
    const d = new Date(p.date + "T12:00:00"), l = mondayOf(d);
    if(semaine === null || l.getTime() !== semaine){
      semaine = l.getTime();
      const t = el("div","av-semaine"); t.textContent = nomSemaine(l, passe);
      cible.appendChild(t);
      carte = el("div","av-carte" + (passe ? " av-passe" : "")); cible.appendChild(carte);
    }
    const cle = p.type === "controle" ? "controle" : p.type === "devoir" ? "devoir" : "note";
    const nouveau = !passe && it.author !== whoAmI() && !vus[it.id];
    const kn = cleDuDevoir(it.id), N = kn ? EDTNOTES[kn] : null;
    const fait = !!(N && N.done), modifie = !!(N && (N.src === it.id ? N.modifie : autresDe(N).some(a=>a.src === it.id && a.modifie)));
    const row = el("div","av-row dv-carte " + cle + (fait ? " fait" : "")); row.setAttribute("role","button"); row.tabIndex = 0;
    const jD = hmJoursAvant(d), chsP = Array.isArray(p.chs) ? p.chs.map(x=>String(x).split(" · ")[0]) : [];
    let note = String(p.note || "").split("\n")[0];
    if(p.jour && note.trim() === it.subject_title) note = String(p.note || "").split("\n")[1] || "";   // le nom vient déjà de la note
    note = note.replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, u=>libelleUrl(u).split("/")[0]);   // une adresse : juste son site
    // fait ou pas : on le voit comme à l'accueil (nom barré, « Fait » en vert), on coche depuis l'accueil ou la fiche
    const quand = JOURS[d.getDay()].toLowerCase() + " " + d.getDate() + (p.heure ? " · " + p.heure + (p.jour && p.fin ? " → " + p.fin : "") : "");
    row.innerHTML = `<span class="dv-j">${passe ? d.getDate() + "/" + String(d.getMonth()+1).padStart(2,"0") : jD <= 0 ? "Auj." : "J-" + jD}<small>${passe ? "" : jD === 1 ? "demain" : jD > 1 ? HM_JOURS[d.getDay()] : ""}</small></span><span class="av-txt"><b>${esc(it.subject_title)}</b>
      <small><i>${fait ? "Fait" : TAG_DEVOIR[p.type || ""]}</i> · ${esc(quand)}</small>${note ? `<small class="av-note">${esc(note)}</small>` : ""}${it.author === whoAmI() ? "" : `<small>par ${esc(it.author)}</small>`}${chsP.length ? `<span class="dv-chs">${chsP.map(x=>`<span>${esc(x)}</span>`).join("")}</span>` : ""}</span>` +
      (nouveau ? `<span class="chap-pick-new">Nouveau</span>` : modifie ? `<span class="chap-pick-new">Modifié</span>` : `<span class="av-fl">›</span>`);
    row.addEventListener("click",()=>{
      haptic();
      const e = creneauDuDevoir(it);
      if(e) return openEvSheet(e, { classe:c.id });
      toast("Ce cours n'est pas dans ton emploi du temps.");
    });
    carte.appendChild(row);
  });
  };
  // l'historique en haut, pour garder l'ordre chronologique : du plus ancien au plus récent. Plié : juste le titre et sa flèche.
  const passes = devs.filter(it=>it.payload && it.payload.date && !devoirAVenir(it))
    .sort((a,b)=>(a.payload.date + (a.payload.heure || "")).localeCompare(b.payload.date + (b.payload.heure || "")));
  if(passes.length){
    let ouvert = false; try{ ouvert = localStorage.getItem("revision_devoirs_passes") === "1"; }catch(e){}
    const tete = el("button","av-tete av-tete-passes"); tete.type = "button";
    tete.setAttribute("aria-expanded", ouvert ? "true" : "false");
    tete.classList.add("cls-sec-dev");
    tete.innerHTML = `<h3>Passés</h3><span class="cls-nb">${passes.length}</span><span class="av-plier${ouvert ? " ouvert" : ""}">${IC_CHEV_BAS}</span>`;
    tete.addEventListener("click",()=>{
      haptic();
      try{ localStorage.setItem("revision_devoirs_passes", ouvert ? "0" : "1"); }catch(e){}
      openClass(c);
    });
    zonePasses.appendChild(tete);
    if(ouvert) lister(passes, zonePasses, true);
  }

  if(avenir.length){ const t = el("div","hm-sec cls-sec"); t.innerHTML = `<h3>À venir</h3><span>${avenir.length}</span>`; box.appendChild(t); }
  lister(avenir, box, false);
  // vus : la pastille s'éteint, l'étiquette « Nouveau » reste jusqu'à la prochaine visite
  let marque = false;
  avenir.forEach(it=>{ if(!vus[it.id]){ vus[it.id] = 1; marque = true; } });
  if(marque) clsVusSave();
}
// Retirer plusieurs publications d'un coup (un chapitre publié deux fois, ou toute une matière).
function depublierPlusieurs(c, its, nom){
  if(!its || !its.length) return;
  if(its.length === 1 && its[0].label === nom) return depublier(c, its[0]);
  confirmer("Dépublier « " + nom + " » ?",
    (its.length > 1 ? its.length + " éléments seront retirés de la classe. " : "Il sera retiré de la classe. ") + "Ceux qui l'avaient ajouté ne l'auront plus.",
    "Dépublier", async ()=>{
    let ko = 0;
    for(const it of its){ try{ await api("item_delete", { item_id:it.id }); }catch(e){ ko++; } }
    toast(ko ? "Certains n'ont pas pu être retirés." : "Retiré de la classe.");
    openClass(c);
  });
}
// Retirer un chapitre de la classe. Il disparaît aussi de chez ceux qui le suivaient.
function depublier(c, it){
  confirmer("Dépublier « " + it.label + " » ?",
    "Il sera retiré de la classe. Ceux qui l'avaient ajouté ne l'auront plus.",
    "Dépublier", ()=>{
    api("item_delete", { item_id:it.id })
      .then(()=>{ toast("Retiré de la classe."); openClass(c); })
      .catch(()=>toast("Action refusée."));
  });
}

function setRole(c, cible, role){
  haptic();
  api("class_role", { class_id:c.id, cible, role })
    .then(()=>openClass(c))
    .catch(()=>toast("Action refusée."));
}

// Publie, ou met à jour si le même élément existe déjà dans cette classe.
// Sans ça, republier crée un doublon et ceux qui suivaient l'ancien
// restent bloqués sur la version périmée.
async function publierOuMettreAJour(classId, kind, subjectTitle, payload){
  let existant = null;
  try{
    const out = await api("class_items", { class_id:classId });
    existant = (out.items||[]).find(it=>
      it.kind === kind &&
      it.subject_title === subjectTitle &&
      (kind === "revision" || it.label === payload.label) &&
      it.author === whoAmI()
    );
  }catch(e){}
  if(existant){
    await api("item_update", { item_id:existant.id, payload });
    return "maj";
  }
  await api("item_publish", { class_id:classId, kind, subject_title:subjectTitle, payload });
  return "neuf";
}

// ══════════════════════════════════════════════════
// Feuille « à partager » : même modèle pour les devoirs et pour les cours.
// Des groupes (un jour, une matière), une ligne par élément, son état à droite.
// Point vert : déjà dans la classe. Point de couleur : prêt à partager.
// Toucher une ligne la partage ; « Tout » dans l'en-tête fait tout le groupe.
// ══════════════════════════════════════════════════
function feuillePartage(titre, legende, groupes, nav){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = titre;
  const box = document.getElementById("pick-list");
  const haut = nav && nav.enHaut ? 0 : box.scrollTop;
  box.innerHTML = "";
  // le retour au niveau d'avant, au-dessus du titre (comme en haut des pages)
  document.querySelectorAll("#pick-sheet .fp-retour").forEach(n=>n.remove());
  if(nav && nav.retour){
    const b = el("button","fp-retour"); b.type = "button";
    b.innerHTML = chevronL + esc(nav.retour.txt);
    b.addEventListener("click",()=>{ haptic(); nav.retour.fn(); });
    document.getElementById("pick-title").before(b);
  }
  if(legende){ const lg = el("div","pick-legend"); lg.innerHTML = "<span>" + legende + "</span>"; box.appendChild(lg); }
  groupes.forEach(g=>{
    const h = el("div","fp-tete");
    h.innerHTML = `<span>${esc(g.titre)}${g.sous ? `<small>${esc(g.sous)}</small>` : ""}</span>`;
    if(g.tout){
      const b = el("button","fp-tout"); b.type = "button"; b.textContent = g.tout.label;
      b.addEventListener("click",()=>{ haptic(); g.tout.fn(); });
      h.appendChild(b);
    }
    box.appendChild(h);
    if(g.actions && g.actions.length){
      const row = el("div","fp-actions");
      g.actions.forEach(a=>{ const b = el("button","fp-act" + (a.discret ? " discret" : "")); b.type = "button"; b.textContent = a.label;
        b.addEventListener("click",()=>{ haptic(); a.fn(); }); row.appendChild(b); });
      box.appendChild(row);
    }
    g.lignes.forEach(l=>{
      const r = el("button","cal-row chap-ligne fp-ligne" + (l.cls ? " " + l.cls : "")); r.type = "button";
      r.innerHTML = `<span class="rv-dot"></span><div class="cal-txt"><div class="cal-name">${esc(l.nom)}</div>${l.sous ? `<div class="cal-url">${esc(l.sous)}</div>` : ""}</div>` +
        (l.etat ? `<span class="fp-etat ${l.etat.cls || ""}">${esc(l.etat.txt)}</span>` : "") +
        (l.chev ? `<span class="fp-chev">${IC_CHEV_DROITE}</span>` : "");
      if(l.ic){ r.classList.add("fp-avec-ic"); r.querySelector(".rv-dot").outerHTML = `<span class="fp-ic">${icone(l.ic)}</span>`; }
      r.addEventListener("click",()=>{ haptic(); l.onTap(r); });
      box.appendChild(l.actions && l.actions.length ? swipeRow(r, l.actions) : r);
    });
  });
  box.scrollTop = haut;
  document.getElementById("pick-sheet").classList.add("open");
}

// ── Devoirs : les cours à venir, ceux déjà notés dans ton agenda sont prêts ──
function choisirCoursDevoir(c){
  const auj = new Date(); auj.setHours(0,0,0,0);
  const groupes = [], tousPrets = [];
  // jusqu'au dernier cours de l'emploi du temps (ou au dernier devoir posé), pas seulement six semaines
  let fin = auj.getTime() + 42 * 86400000;
  EDT.forEach(e=>{ if(e.start && e.start.getTime() > fin) fin = e.start.getTime(); });
  Object.keys(EDTNOTES).forEach(k=>{ if(k.startsWith("jour|")){ const t = new Date(k.split("|")[1] + "T12:00:00").getTime(); if(t > fin) fin = t; } });
  const nbJours = Math.min(400, Math.ceil((fin - auj.getTime()) / 86400000) + 1);
  for(let i = 0; i < nbJours; i++){
    const d = new Date(auj); d.setDate(d.getDate() + i);
    const evs = joursOn(d);
    if(!evs.length) continue;
    const prets = [];
    const lignes = evs.map(e=>{
      const N = evNote(e), k = evKey(e);
      const recu = !!(N && N.src && !N.moi);
      const marque = !!(N && (N.type || String(N.note || "").trim()) && !recu);
      const partage = !!(marque && N.moi && N.src && N.cls === c.id);
      if(marque && !partage) prets.push([k, e]);
      const note = N && (marque || recu) && !e.titreNote ? String(N.note || "").split("\n")[0] : "";
      return {
        nom:nomCourt(e.title),
        sous:(e.jour && !e.aHeure ? "Sans cours" : hhmm(e.start) + (e.end ? " → " + hhmm(e.end) : "")) + (note ? " · " + note : ""),
        cls:partage ? "fait" : marque ? "m-" + (N.type || "note") : "",
        etat:partage ? { txt:"✓ Partagé", cls:"ok" } : marque ? { txt:TAG_DEVOIR[N.type || ""], cls:N.type || "note" } : recu ? { txt:"Reçu", cls:"mute" } : null,
        // la feuille du cours s'ouvre déjà remplie, le partage activé : il ne reste qu'à enregistrer
        onTap:()=>{ closePicker(); setTimeout(()=>openEvSheet(e, { partager:recu ? null : c.id }), 320); }
      };
    });
    tousPrets.push(...prets);
    groupes.push({
      titre:JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()], lignes,
      tout:prets.length ? { label:prets.length > 1 ? "Tout partager (" + prets.length + ")" : "Partager", fn:async ()=>{
        toast("Partage en cours…");
        let ok = 0;
        for(const [k, e] of prets) if(await partagerAnnotation(k, e, c.id, true)) ok++;
        toast(ok ? (ok > 1 ? ok + " devoirs partagés." : "Devoir partagé.") : "Le partage n'a pas marché. Vérifie ta connexion.");
        choisirCoursDevoir(c);
        openClass(c);
      }} : null
    });
  }
  feuillePartage("Pour quel cours ?", "Les cours où tu as déjà noté quelque chose sont prêts. Touche-en un pour le partager.", groupes);
  // un devoir pour un jour précis, qui ne dépend d'aucun cours
  const box = document.getElementById("pick-list");
  plusFeuille("Un devoir sans cours, pour un jour précis", ()=>nouvelleEcheance({ partager:c.id }));
  // comme « Tout publier » pour les cours : tous les devoirs prêts d'un coup, tous jours confondus
  if(tousPrets.length){
    const h = el("div","fp-tete fp-tous");
    h.innerHTML = `<span>${tousPrets.length} devoir${tousPrets.length > 1 ? "s" : ""} prêt${tousPrets.length > 1 ? "s" : ""} à partager</span>`;
    const b = el("button","fp-tout"); b.type = "button";
    b.textContent = tousPrets.length > 1 ? "Tout partager (" + tousPrets.length + ")" : "Partager";
    b.addEventListener("click", async ()=>{
      haptic();
      let ok = 0;
      for(let i = 0; i < tousPrets.length; i++){
        if(tousPrets.length > 1) toast(`Partage ${i + 1} sur ${tousPrets.length}…`);
        if(await partagerAnnotation(tousPrets[i][0], tousPrets[i][1], c.id, true)) ok++;
      }
      toast(ok === tousPrets.length ? (ok > 1 ? ok + " devoirs partagés." : "Devoir partagé.") : ok ? (tousPrets.length - ok) + " n'ont pas pu être partagés." : "Le partage n'a pas marché. Vérifie ta connexion.");
      choisirCoursDevoir(c);
      openClass(c);
    });
    h.appendChild(b);
    box.prepend(h);
  }
  if(!groupes.length){
    const v = el("div","fs-hint"); v.style.margin = "14px 4px";
    v.textContent = "Ajoute ton emploi du temps pour poser aussi un devoir sur un cours précis.";
    box.appendChild(v);
  }
}

// ── Cours : tes matières, chapitre par chapitre, ce qui est déjà dans la classe en vert ──
async function publishFromClass(c){
  const mats = SUBJECTS.filter(s=>((s.cm||[]).concat(s.td||[])).some(ch=>!ch._shared));
  const projs = projetsPubliables();
  if(!mats.length && !projs.length){ toast("Aucun chapitre à publier pour l'instant."); return; }
  let items = [];
  try{ const o = await api("class_items", { class_id:c.id }); items = (o.items || []).concat(o.projets || []); }catch(e){}
  const dejaPar = {};                       // clé → { mien, miens, auteurs }
  items.forEach(it=>{
    const k = cleEnvoi(it.kind, it.subject_title, it.label);
    const d = dejaPar[k] || (dejaPar[k] = { mien:null, miens:[], auteurs:[] });
    if(it.author === whoAmI()){ d.mien = it; d.miens.push(it); }
    if(!d.auteurs.includes(it.author)) d.auteurs.push(it.author);
  });
  // les lignes publiables d'une matière
  const lignesDe = sj=>{
    const out = [];
    ["cm","td"].forEach(t=>(sj[t]||[]).forEach((ch,i)=>{
      if(!ch._shared) out.push({ val:t + ":" + i, kind:t, nom:libelleChapitre(ch.label), cle:cleEnvoi(t, sj.title, ch.label), sous:t === "cm" ? "Cours magistral" : "Travaux dirigés" });
    }));
    const r = payloadRevision(sj);
    if(r.fc.length + r.qcm.length + r.oq.length + r.dev.length + r.tr.length){
      out.push({ val:"revision", kind:"revision", nom:"Exercices de révision", cle:cleEnvoi("revision", sj.title),
        sous:[r.fc.length ? r.fc.length + " fiches" : "", r.qcm.length ? nbQCM(r.qcm) + " QCM" : "", r.tr.length ? r.tr.length + " trous" : ""].filter(Boolean).join(" · ") });
    }
    return out;
  };
  // semestre en cours d'abord, puis par nom
  const tri = mats.slice().sort((a,b)=>(SEMESTRES[b.id] || 0) - (SEMESTRES[a.id] || 0) || a.title.localeCompare(b.title, "fr", { sensitivity:"base" }));
  // comme sur l'accueil : d'abord le semestre, puis la matière, puis ses chapitres
  const niv = { sem:null, mat:null };
  const sems = [...new Set(tri.map(sj=>SEMESTRES[sj.id] || 0))].sort((a,b)=>b - a);
  if(sems.length === 1 && !projs.length) niv.sem = sems[0];
  const compte = sj=>{ const ls = lignesDe(sj); return { n:ls.length, k:ls.filter(l=>dejaPar[l.cle]).length,
    m:ls.filter(l=>{ const d = dejaPar[l.cle]; return d && d.mien && !ligneAJour(sj, l, d); }).length }; };
  const etatDe = (n, k, m)=>!n ? null : m ? { txt:m + " à mettre à jour", cls:"maj" } : k === n ? { txt:"✓ Tout publié", cls:"ok" } : k ? { txt:k + " sur " + n, cls:"mute" } : null;
  // Mettre à jour d'un coup tout ce que j'ai déjà publié et qui a changé depuis, pour une ou plusieurs matières
  const aMettreAJour = mats=>{ const out = []; mats.forEach(sj=>lignesDe(sj).forEach(l=>{ const d = dejaPar[l.cle]; if(d && d.mien && !ligneAJour(sj, l, d)) out.push([sj, l]); })); return out; };
  const miensDe = mats=>{ const out = []; mats.forEach(sj=>lignesDe(sj).forEach(l=>{ const d = dejaPar[l.cle]; if(d && d.mien) out.push(...d.miens); })); return out; };
  const actionsDe = (mats, nom)=>{
    const acts = [];
    const maj = aMettreAJour(mats);
    if(maj.length) acts.push({ label:"↻ Tout mettre à jour (" + maj.length + ")", fn:async ()=>{
      let ok = 0;
      for(let i = 0; i < maj.length; i++){
        if(maj.length > 1) toast(`Mise à jour ${i + 1} sur ${maj.length}…`);
        if(await publierLigne(c, maj[i][0], maj[i][1], dejaPar, true)) ok++;
      }
      saveContent();
      toast(ok === maj.length ? (ok > 1 ? ok + " mis à jour. La classe a la nouvelle version." : "Mis à jour.") : (maj.length - ok) + " n'ont pas pu être mis à jour.");
      rendre(); openClass(c);
    }});
    const miens = miensDe(mats);
    if(miens.length) acts.push({ label:"Tout dépublier", discret:true, fn:()=>{ closePicker(); setTimeout(()=>depublierPlusieurs(c, miens, nom), 320); } });
    return acts;
  };
  // tout ce qui n'est pas encore dans la classe, pour une ou plusieurs matières
  const toutPublier = mats=>{
    const reste = [];
    mats.forEach(sj=>lignesDe(sj).forEach(l=>{ if(!dejaPar[l.cle]) reste.push([sj, l]); }));
    if(!reste.length) return null;
    return { label:reste.length > 1 ? "Tout publier (" + reste.length + ")" : "Publier", fn:async ()=>{
      let ok = 0;
      for(let i = 0; i < reste.length; i++){
        if(reste.length > 1) toast(`Publication ${i + 1} sur ${reste.length}…`);
        if(await publierLigne(c, reste[i][0], reste[i][1], dejaPar)) ok++;
      }
      toast(ok === reste.length ? (ok > 1 ? ok + " publiés." : "Publié.") : (reste.length - ok) + " n'ont pas pu être publiés.");
      rendre(); openClass(c);
    }};
  };
  const groupeMatiere = sj=>{
      const ls = lignesDe(sj);
      return {
        titre:"Chapitres", sous:"",
        tout:toutPublier([sj]),
        actions:actionsDe([sj], sj.title),
        lignes:ls.map(l=>{
          const d = dejaPar[l.cle];
          return {
            nom:l.nom, sous:l.sous + (d && !d.mien ? " · par " + d.auteurs.join(", ") : ""),
            cls:d ? "fait" : "",
            etat:d ? (d.mien && !ligneAJour(sj, l, d) ? { txt:"↻ À mettre à jour", cls:"maj" } : { txt:d.mien ? "✓ Publié" : "✓ Déjà là", cls:"ok" }) : null,
            onTap:async ()=>{
              if(d && !d.mien){ toast("Déjà publié par " + d.auteurs.join(", ") + "."); return; }
              const ok = await publierLigne(c, sj, l, dejaPar);
              toast(ok ? (d ? "Mis à jour." : "Publié.") : "La publication n'a pas marché. Vérifie ta connexion.");
              if(ok){ rendre(); openClass(c); }
            },
            // le mien : glisser vers la gauche pour le retirer
            actions:d && d.mien ? [{ label:"Dépublier", fn:()=>{ closePicker(); setTimeout(()=>depublierPlusieurs(c, d.miens, l.nom), 320); } }] : null
          };
        })
      };
  };
  const rendre = (enHaut)=>{
    // 3. les chapitres d'une matière
    if(niv.mat){
      const sj = niv.mat;
      feuillePartage(sj.title, "Touche un chapitre pour le publier. En orange : il a changé depuis, touche-le pour envoyer la nouvelle version.", [groupeMatiere(sj)],
        { enHaut, retour:{ txt:niv.sem ? titreSemestre(niv.sem) : "Matières", fn:()=>{ niv.mat = null; rendre(true); } } });
      return;
    }
    // 2. les matières d'un semestre
    if(niv.sem !== null){
      const sem = niv.sem;
      const lignes = tri.filter(sj=>(SEMESTRES[sj.id] || 0) === sem).map(sj=>{
        const { n, k, m } = compte(sj);
        const ls = lignesDe(sj), nCh = ls.filter(l=>l.kind !== "revision").length, rev = ls.length > nCh;
        return { nom:sj.title, sous:nCh + " chapitre" + (nCh > 1 ? "s" : "") + (rev ? " · exercices" : ""), cls:n && k === n ? "fait" : "", etat:etatDe(n, k, m), chev:true,
          onTap:()=>{ niv.mat = sj; rendre(true); } };
      });
      feuillePartage(sem ? titreSemestre(sem) : "Autres matières", "Choisis une matière. En vert : tout est déjà dans la classe.",
        [{ titre:nomAnneeSem(sem), lignes, tout:toutPublier(tri.filter(sj=>(SEMESTRES[sj.id] || 0) === sem)),
           actions:actionsDe(tri.filter(sj=>(SEMESTRES[sj.id] || 0) === sem), sem ? titreSemestre(sem) : "Autres matières") }],
        sems.length > 1 ? { enHaut, retour:{ txt:"Semestres", fn:()=>{ niv.sem = null; rendre(true); } } } : { enHaut });
      return;
    }
    // 1. les semestres, rangés par année, du plus récent au plus ancien
    const groupes = [];
    sems.forEach(sem=>{
      const nom = nomAnneeSem(sem);
      let g = groupes.find(x=>x.titre === nom); if(!g){ g = { titre:nom, lignes:[] }; groupes.push(g); }
      const ms = tri.filter(sj=>(SEMESTRES[sj.id] || 0) === sem);
      let n = 0, k = 0, m = 0; ms.forEach(sj=>{ const x = compte(sj); n += x.n; k += x.k; m += x.m; });
      g.lignes.push({ nom:sem ? titreSemestre(sem) : "Autres matières", ic:sem ? (tuileDe("sem:" + sem).icone || iconeSemestre(sem)) : "dossier",
        sous:ms.length + " matière" + (ms.length > 1 ? "s" : ""), cls:n && k === n ? "fait" : "", etat:etatDe(n, k, m), chev:true,
        onTap:()=>{ niv.sem = sem; rendre(true); } });
    });
    // les projets se publient d'un geste, comme une matière entière
    if(projs.length){
      groupes.push({ titre:"Projets", lignes:projs.map(pid=>{
        const pj = PROJETS[pid], cle = cleEnvoi("revision", "projet:" + pid), d = dejaPar[cle];
        return { nom:pj.titre, ic:pj.icone, sous:pj.sous, cls:d ? "fait" : "",
          etat:d ? { txt:d.mien ? "✓ Publié" : "✓ Déjà là", cls:"ok" } : null,
          onTap:async ()=>{
            if(d){ toast(d.mien ? "Déjà publié. Glisse vers la gauche pour le retirer." : "Déjà publié par " + d.auteurs.join(", ") + "."); return; }
            try{
              const it = (await api("item_publish", { class_id:c.id, kind:"revision", subject_title:"projet:" + pid, payload:{ projet:pid, label:pj.titre } })).item || { id:"", author:whoAmI() };
              dejaPar[cle] = { mien:it, miens:[it], auteurs:[whoAmI()] };
              toast("Publié. Les membres peuvent l'ajouter à leurs projets.");
              rendre(); openClass(c);
            }catch(e){ toast("La publication n'a pas marché. Vérifie ta connexion."); }
          },
          actions:d && d.mien ? [{ label:"Dépublier", fn:()=>{ closePicker(); setTimeout(()=>depublierPlusieurs(c, d.miens, pj.titre), 320); } }] : null };
      }) });
    }
    if(groupes.length){ const tout = aMettreAJour(tri); if(tout.length) groupes[0].actions = actionsDe(tri, "tout").filter(a=>!a.discret); }
    feuillePartage("Que publier ?", projs.length ? "Choisis un semestre, puis une matière. Ou partage un projet." : "Choisis un semestre, puis une matière.", groupes, { enHaut });
  };
  rendre();
}
// Ce que contient une ligne publiable, tel qu'il partirait dans la classe
function payloadLigne(sj, l){
  if(l.val === "revision") return payloadRevision(sj);
  const [type, idx] = l.val.split(":");
  const ch = (type === "cm" ? sj.cm : sj.td)[Number(idx)];
  return { label:ch.label, sections:ch.sections || [], recap:ch.recap || [] };
}
// Une empreinte du contenu envoyé : si mon cours change ensuite, la ligne passe « À mettre à jour ».
// Gardée dans mes réglages, elle suit sur tous mes appareils.
function empreinteContenu(payload){
  const t = JSON.stringify(payload, (k, v)=>k === "meta" || k === "_own" || k === "maj" || k === "majNote" ? undefined : v);
  let h = 5381; for(let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + "." + t.length;
}
function envois(){ USER_SETTINGS.envois = (USER_SETTINGS.envois && typeof USER_SETTINGS.envois === "object") ? USER_SETTINGS.envois : {}; return USER_SETTINGS.envois; }
function ligneAJour(sj, l, d){ return !!(d && d.mien && envois()[d.mien.id] === empreinteContenu(payloadLigne(sj, l))); }
// Publie (ou met à jour) une seule ligne, et le note dans dejaPar.
// Mettre à jour garde le même élément : ceux qui l'ont ajouté reçoivent la nouvelle version, sans rien refaire.
async function publierLigne(c, sj, l, dejaPar, sansSauver){
  const payload = payloadLigne(sj, l);
  const emp = empreinteContenu(payload);
  payload.meta = metaMatiere(sj);
  const d = dejaPar[l.cle];
  try{
    let id;
    if(d && d.mien){ await api("item_update", { item_id:d.mien.id, payload }); id = d.mien.id; }
    else{
      const it = (await api("item_publish", { class_id:c.id, kind:l.kind, subject_title:sj.title, payload })).item || { id:"", author:whoAmI() };
      dejaPar[l.cle] = { mien:it, miens:[it], auteurs:[whoAmI()] };
      id = it.id;
    }
    if(id){ envois()[id] = emp; if(!sansSauver) saveContent(); }
    return true;
  }catch(e){ return false; }
}

// Choisir une matière, puis un ou plusieurs de ses chapitres, et les publier ici.
// Ce qui est déjà dans la classe apparaît hachuré.
// Ce qui permet à quelqu'un d'autre de recréer la matière à l'identique.
function metaMatiere(sj){
  if(!sj) return null;
  const u = UES[sj.ue] || {};
  return { ecue:sj.ecue || "", ue_num:String(u.num || ""), ue_title:u.title || "",
           sem:u.sem || SEMESTRES[sj.id] || null,
           profs:{ cm:profDe(sj, "cm"), td:profDe(sj, "td") } };
}

function cleEnvoi(kind, subjectTitle, label){
  return kind === "revision" ? "revision|" + subjectTitle : kind + "|" + subjectTitle + "|" + label;
}

function payloadRevision(sj){
  return {
    label: "Révisions",
    fc:  (sj.fc ||[]).filter(x=>!x._shared),
    qcm: (sj.qcm||[]).filter(x=>!x._shared),
    oq:  (sj.oq ||[]).filter(x=>!x._shared),
    dev: (sj.dev||[]).filter(x=>!x._shared),
    tr:  (sj.tr ||[]).filter(x=>!x._shared),
    auteurs: (sj.auteurs||[]).filter(x=>!x._shared)
  };
}



// ── Lecture d'un chapitre partagé ──
async function openSharedItem(it){
  marquerItemVu(it);
  showScreen("shared");
  document.getElementById("shared-title").textContent = it.label;
  document.getElementById("shared-sub").textContent =
    `${it.subject_title} · ${KIND_LABEL[it.kind] || it.kind} · par ${it.author}`;
  const box = document.getElementById("shared-inner");
  box.innerHTML = `<div class="empty-note">Chargement…</div>`;
  let payload = SHARED_CACHE[it.id];
  if(!payload){
    try{
      const out = await api("items_fetch", { ids:[it.id] });
      payload = (out.items||[])[0]?.payload;
      if(payload) SHARED_CACHE[it.id] = payload;
    }catch(e){}
  }
  box.innerHTML = "";
  if(!payload){ box.innerHTML = vide("alerte", "Contenu indisponible", "Il a peut-être été retiré de la classe."); return; }
  if(it.kind === "revision"){
    const n = c => (payload[c]||[]).length;
    const d = el("div","empty-note");
    d.innerHTML = `${n("fc")} fiches · ${nbQCM(payload.qcm)} QCM · ${n("tr")} textes à trous · ${n("oq")} questions ouvertes · ${n("dev")} devoirs<br>
      Ajoute-les à une de tes matières pour les réviser.`;
    box.appendChild(d);
  }else{
    renderSectionsInto(box, payload);
  }

  const suivre = el("button","add-inline");
  const parMat = subFollowOf(it);
  const dedans = isFollowed(it.id);
  const sjMat  = parMat && SUBJECTS.find(x=>x.id === parMat.subject_id);
  suivre.textContent = parMat
    ? "Via la matière « " + it.subject_title + " »  ·  modifier"
    : dedans ? "Dans « " + (matiereDeSuivi(it.id) || "tes cours") + " »  ·  modifier"
             : "+  Ajouter à mes cours";
  suivre.addEventListener("click",()=>{
    haptic();
    if(parMat){
      openPicker("Matière suivie", [
        { label:"Ranger la matière ailleurs", sub:sjMat ? "actuellement dans « " + sjMat.title + " »" : "", value:"move" },
        { label:"Ne plus suivre cette matière", sub:"tous ses chapitres quittent tes cours", value:"off" }
      ], v=>{
        if(v === "off"){
          USER_SETTINGS.follows = follows().filter(f=>f !== parMat);
          saveContent();
          syncFollows().then(()=>{ toast("Matière retirée."); openSharedItem(it); });
        }else{
          setTimeout(()=>pickMatiere("La ranger dans quelle matière ?", subjId=>{
            parMat.subject_id = subjId;
            saveContent(); injectFollowed(); toast("Déplacée."); openSharedItem(it);
          }, { title:it.subject_title, itemId:it.id }), 320);
        }
      });
      return;
    }
    if(!dedans){ followItem(it); return; }
    openPicker("Ce chapitre", [
      { label:"Le ranger ailleurs", sub:"choisir une autre matière", value:"move" },
      { label:"Le retirer de mes cours", sub:"il reste dans la classe", value:"off" }
    ], v=>{
      if(v === "off"){ unfollowItem(it.id); toast("Retiré de tes cours."); openSharedItem(it); }
      else setTimeout(()=>moveFollow(it), 320);
    });
  });
  box.appendChild(suivre);
}

// ── LECTURE À VOIX HAUTE ──
// Utilise les voix déjà installées sur l'appareil (Web Speech API) :
// gratuit, sans serveur, et ça marche même hors ligne.
// On lit phrase par phrase : Safari et Chrome coupent les textes trop longs.
// Chaque mot lu garde un lien vers sa place dans la page : c'est ce qui permet
// de le surligner, et de reprendre la lecture là où on touche le texte.
var TTS_OK = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
var LEC = { phrases:[], i:0, depuis:0, blocs:[], racine:null, actif:false, pause:false, jeton:0,
            voix:null, bar:null, blocCourant:-1, motsSignales:false, minuteur:null, toucheA:0 };
const LEC_VITESSES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
function lecLire(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lecEcrire(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
LEC.vitesse = parseFloat(lecLire("lec-vitesse")) || 1;
if(!LEC_VITESSES.includes(LEC.vitesse))
  LEC.vitesse = LEC_VITESSES.reduce((a,b)=>Math.abs(b-LEC.vitesse) < Math.abs(a-LEC.vitesse) ? b : a, 1);
// La liste des voix arrive par morceaux sur iPhone. On ne change JAMAIS de voix en cours de route :
// on garde l'identifiant de celle qui a été choisie, et on ne fait que rafraîchir son objet.
if(TTS_OK && "onvoiceschanged" in speechSynthesis) speechSynthesis.onvoiceschanged = ()=>{ lecVoixActuelle(); };
function lecIdVoix(v){ return v ? (v.voiceURI || v.name) : ""; }
// « Voix de l'iPhone » : on ne désigne aucune voix, l'iPhone prend sa voix française par défaut,
// celle choisie dans Réglages. C'est souvent la plus belle, et Safari ne la montre pas dans sa liste.
var VOIX_SYSTEME = "__systeme__";
function lecVoixActuelle(){
  const vs = voixFrancaises();
  if(LEC.voixId === VOIX_SYSTEME){ LEC.voix = null; return null; }
  if(LEC.voixId){
    // la même voix, avec un objet tout frais : Safari ignore parfois un objet trop ancien
    const meme = vs.find(v=>lecIdVoix(v) === LEC.voixId);
    if(meme) LEC.voix = meme;
    return LEC.voix;
  }
  const v = choisirVoix();
  if(v === VOIX_SYSTEME){ LEC.voix = null; LEC.voixId = VOIX_SYSTEME; return null; }
  if(v){ LEC.voix = v; LEC.voixId = lecIdVoix(v); }
  return LEC.voix;
}

function voixFrancaises(){
  return TTS_OK ? speechSynthesis.getVoices().filter(v=>/^fr/i.test(v.lang)) : [];
}
// La qualité se lit dans l'identifiant de la voix (ex. com.apple.voice.enhanced.fr-FR.Thomas).
function lecQualite(v){
  const id = ((v.voiceURI || "") + " " + (v.name || "")).toLowerCase();
  if(/premium/.test(id)) return "premium";
  if(/enhanced|amélior|neural|natural/.test(id)) return "améliorée";
  if(/compact|super-?compact/.test(id)) return "compacte";
  return "";
}
function choisirVoix(){
  const memo = lecLire("lec-voix");
  if(memo === VOIX_SYSTEME) return VOIX_SYSTEME;
  const vs = voixFrancaises();
  if(!vs.length) return VOIX_SYSTEME;
  const rang = v => ({ premium:3, "améliorée":2, "":1, compacte:0 })[lecQualite(v)];
  // choix mémorisé par identifiant ; sinon par nom, en prenant la meilleure version de cette voix
  const perso = vs.find(v=>v.voiceURI && v.voiceURI === memo)
    || vs.filter(v=>v.name === memo).sort((a,b)=>rang(b)-rang(a))[0];
  if(perso) return perso;
  // aucune belle voix dans la liste de Safari : la voix par défaut de l'iPhone sera meilleure
  if(!vs.some(v=>lecQualite(v) === "premium" || lecQualite(v) === "améliorée")) return VOIX_SYSTEME;
  // les voix « améliorées » d'iOS sont bien plus naturelles : on les préfère
  // la qualité passe avant tout : une belle voix québécoise vaut mieux qu'une voix compacte de France
  const score = v => (/fr[-_]FR/i.test(v.lang) ? 2 : 0)
    + (lecQualite(v) === "premium" ? 12 : lecQualite(v) === "améliorée" ? 8 : lecQualite(v) === "compacte" ? -4 : 0)
    + (/Amélie|Audrey|Aurélie|Marie|Thomas|Denise|Julie/i.test(v.name) ? 2 : 0)
    + (v.localService ? 1 : 0);
  return vs.slice().sort((a,b)=>score(b)-score(a))[0];
}

const LEC_MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
// Ce qui s'affiche bien mais se lit mal. Appliqué mot par mot,
// pour que chaque morceau prononcé corresponde toujours à un mot de la page.
function motPourLaVoix(m){
  if(/^https?:\/\//.test(m)) return "";
  if(m === "→" || m === "⇒") return ", puis,";
  if(m === "·") return ".";
  if(m === "+") return "plus";
  if(m === "p.") return "page";
  return m
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\((?:\.\.\.|…)\)/g, "")
    .replace(/^CàR/, "conduites à risque")
    .replace(/^XVIIIe/, "dix-huitième").replace(/^XIXe/, "dix-neuvième")
    .replace(/^XXIe/, "vingt-et-unième").replace(/^XXe/, "vingtième")
    .replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (x,j,mo,a)=>{
      const k = +mo;
      if(k < 1 || k > 12 || +j < 1 || +j > 31) return x;
      return (+j === 1 ? "premier" : String(+j)) + " " + LEC_MOIS[k-1] + (a ? " " + (a.length === 2 ? "20" + a : a) : "");
    })
    .replace(/(\d)[-–](\d)/g, "$1 à $2")
    .trim();
}

// Découpe un élément de la page en mots, en gardant pour chacun sa position exacte.
function motsDe(elem){
  const txt = [], pos = [];          // pos[k] = { n: nœud texte, o: décalage } pour chaque caractère
  const w = document.createTreeWalker(elem, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while((n = w.nextNode())){
    if(n.nodeType === 1){ if(n.tagName === "BR"){ txt.push("\n"); pos.push(null); } continue; }
    const v = n.nodeValue;
    for(let k = 0; k < v.length; k++){ txt.push(v[k]); pos.push({ n, o:k }); }
  }
  const brut = txt.join("");
  const mots = [];
  const re = /\S+/g; let m, fin = 0;
  while((m = re.exec(brut))){
    const a = pos[m.index], z = pos[m.index + m[0].length - 1];
    const ligne = /\n/.test(brut.slice(fin, m.index));   // un <br> avant ce mot : nouvelle phrase
    fin = m.index + m[0].length;
    if(!a || !z) continue;
    mots.push({ brut:m[0], dit:motPourLaVoix(m[0]), n1:a.n, o1:a.o, n2:z.n, o2:z.o + 1, ligne });
  }
  return mots;
}
// Regroupe les mots en phrases courtes.
function phrasesDe(mots, b){
  const out = [];
  let cur = [], long = 0;
  const pousser = ()=>{ if(cur.some(t=>t.dit)) out.push({ b, toks:cur }); cur = []; long = 0; };
  mots.forEach(t=>{
    if(t.ligne && cur.length) pousser();
    cur.push(t); long += t.dit.length + 1;
    if(/[.!?…][»")\]]*$/.test(t.brut) && t.brut !== "p.") pousser();
    else if(long > 200 && /[,;:]$/.test(t.brut)) pousser();
    else if(long > 320) pousser();
  });
  pousser();
  return out;
}
// Dans un PDF, un retour à la ligne n'est pas une fin de phrase,
// et un mot coupé en fin de ligne (« connais- sance ») se lit en entier.
function motsPdf(elem){
  const mots = motsDe(elem);
  mots.forEach((m,k)=>{
    const s = mots[k+1];
    if(s && s.ligne && m.dit && /[a-zà-öø-ÿ]-$/i.test(m.brut)){ s.dit = m.dit.replace(/-$/, "") + s.dit; m.dit = ""; }
  });
  mots.forEach(m=>{ m.ligne = false; });
  return mots;
}
function lecEstPdf(){ return !!(LEC.racine && LEC.racine.classList.contains("pdf-pages")); }
// On lit ce qui est affiché : titres, textes, listes, puis « À retenir ».
function construireFile(root){
  if(root.classList.contains("pdf-pages")){
    const blocs = [...root.querySelectorAll(".pdf-page")], phrases = [];
    blocs.forEach((b,bi)=>{ const t = b.querySelector(".pdf-texte"); if(t) phrasesDe(motsPdf(t), bi).forEach(p=>phrases.push(p)); });
    return { blocs, phrases };
  }
  const blocs = [...root.querySelectorAll(".section, .recap")];
  const phrases = [];
  blocs.forEach((b,bi)=>{
    const morceaux = b.classList.contains("recap")
      ? [b.querySelector(".recap-label"), ...b.querySelectorAll(".recap-item > span:last-child")]
      : [b.querySelector(".section-title"), b.querySelector(".card-body"), ...b.querySelectorAll(".card-list .li-text")];
    morceaux.filter(Boolean).forEach(e=>phrasesDe(motsDe(e), bi).forEach(p=>phrases.push(p)));
  });
  return { blocs, phrases };
}

function lecPlage(t1, t2){
  try{ const r = document.createRange(); r.setStart(t1.n1, t1.o1); r.setEnd(t2.n2, t2.o2); return r; }
  catch(e){ return null; }
}
// Surlignage dessiné par-dessus le texte, avec des rectangles qu'on efface
// vraiment à chaque mot. (L'API Highlight laissait des traces sur iPhone.)
const LEC_CALQUES = {};
function lecSurligner(nom, r){
  let calque = LEC_CALQUES[nom];
  if(!r){ if(calque) calque.innerHTML = ""; return; }
  if(!calque) calque = LEC_CALQUES[nom] = el("div","lec-calque " + nom);
  // dans un PDF, le calque vit dans la zone qui défile ; sinon dans la page
  const hote = lecEstPdf() ? LEC.racine : document.body;
  if(calque.parentNode !== hote) hote.appendChild(calque);
  let dx = scrollX, dy = scrollY;
  if(hote !== document.body){
    const z = hote.getBoundingClientRect();
    dx = hote.scrollLeft - z.left - hote.clientLeft; dy = hote.scrollTop - z.top - hote.clientTop;
  }
  // une boîte par ligne : on fusionne les morceaux d'une même ligne
  const lignes = [];
  [...r.getClientRects()].forEach(b=>{
    if(b.width < 1 || b.height < 1) return;
    const l = lignes.find(x=>Math.abs(x.top - b.top) < b.height * 0.5);
    if(l){ l.left = Math.min(l.left, b.left); l.right = Math.max(l.right, b.right);
           l.top = Math.min(l.top, b.top); l.bottom = Math.max(l.bottom, b.bottom); }
    else lignes.push({ left:b.left, right:b.right, top:b.top, bottom:b.bottom });
  });
  calque.innerHTML = "";
  lignes.forEach(l=>{
    const d = document.createElement("div");
    d.style.cssText = `left:${l.left + dx - 2}px;top:${l.top + dy}px;` +
                      `width:${l.right - l.left + 4}px;height:${l.bottom - l.top}px`;
    calque.appendChild(d);
  });
}
function lecMarquerBloc(bi){
  if(bi === LEC.blocCourant) return;
  LEC.blocs.forEach(b=>b.classList.remove("tts-on"));
  LEC.blocCourant = bi;
  if(LEC.blocs[bi]) LEC.blocs[bi].classList.add("tts-on");
}
// Faire suivre la page, sauf si la personne est en train de faire défiler elle-même.
function lecSuivre(r){
  if(!r || Date.now() - LEC.toucheA < 4000) return;
  const box = r.getBoundingClientRect();
  if(!box.height) return;
  if(lecEstPdf()){
    const z = LEC.racine.getBoundingClientRect();
    if(box.top < z.top + 40 || box.bottom > z.bottom - 130)
      LEC.racine.scrollBy({ top: box.top - z.top - z.height * 0.33, behavior:"smooth" });
    return;
  }
  if(box.top < 170 || box.bottom > innerHeight - 130)
    window.scrollBy({ top: box.top - innerHeight * 0.33, behavior:"smooth" });
}
function lecMot(p, k){
  const t = p.toks[k];
  if(t) lecSurligner("lec-mot", lecPlage(t, t));
}
function lecArreterMinuteur(){ if(LEC.minuteur){ clearTimeout(LEC.minuteur); LEC.minuteur = null; } }

function lecDire(){
  lecNoterPosition();
  if(!LEC.actif || LEC.pause) return;
  if(LEC.i >= LEC.phrases.length){ const cle = lecCle(LEC.racine); if(cle){ const t = lecPositions(); delete t[cle]; lecEcrire(LEC_POS_CLE, JSON.stringify(t)); } lecteurStop(); toast("Lecture terminée."); return; }
  const p = LEC.phrases[LEC.i];
  const depuis = Math.min(LEC.depuis || 0, p.toks.length - 1);
  LEC.depuis = 0;
  // le texte prononcé, et où commence chaque mot dedans
  let texte = "";
  const debuts = [];
  for(let k = depuis; k < p.toks.length; k++){
    const d = p.toks[k].dit;
    debuts.push({ k, a: texte.length + (texte && d ? 1 : 0) });
    if(d) texte += (texte ? " " : "") + d;
  }
  if(!texte.trim()){ LEC.i++; lecDire(); return; }
  if(!/[.!?…:;,]$/.test(texte)) texte += ".";

  lecMarquerBloc(p.b);
  const rPhrase = lecPlage(p.toks[depuis], p.toks[p.toks.length - 1]);
  lecSurligner("lec-phrase", rPhrase);
  lecMot(p, debuts.find(x=>p.toks[x.k].dit) ? debuts.find(x=>p.toks[x.k].dit).k : depuis);
  lecSuivre(rPhrase);

  const u = new SpeechSynthesisUtterance(texte);
  lecVoixActuelle();
  // la langue doit être celle de la voix : sinon l'iPhone ignore la voix choisie
  u.lang = LEC.voix ? LEC.voix.lang : "fr-FR";
  if(LEC.voix) u.voice = LEC.voix;
  const taux = lecTauxEnvoye();
  u.rate = taux;
  let debutParole = 0;
  const jeton = LEC.jeton;
  const motA = ci => { let k = debuts[0].k; debuts.forEach(x=>{ if(x.a <= ci && p.toks[x.k].dit) k = x.k; }); return k; };
  // la voix signale chaque mot : on suit exactement
  u.onboundary = e=>{
    if(jeton !== LEC.jeton || (e.name && e.name !== "word")) return;
    LEC.motsSignales = true; lecArreterMinuteur();
    lecMot(p, motA(e.charIndex));
  };
  // certaines voix ne signalent rien : on avance à l'estimation
  u.onstart = ()=>{
    debutParole = performance.now();
    if(jeton !== LEC.jeton || LEC.motsSignales) return;
    const cps = lecVitesseCible();          // caractères prononcés par seconde
    let j = 0;
    const suite = ()=>{
      if(jeton !== LEC.jeton || LEC.motsSignales || LEC.pause) return;
      const x = debuts[j]; if(!x) return;
      if(p.toks[x.k].dit) lecMot(p, x.k);
      const nxt = debuts[j + 1];
      j++;
      if(nxt) LEC.minuteur = setTimeout(suite, Math.max(90, (nxt.a - x.a) / cps * 1000));
    };
    suite();
  };
  const apres = ()=>{
    if(jeton !== LEC.jeton || !LEC.actif || LEC.pause) return;   // interrompu volontairement
    lecArreterMinuteur();
    LEC.i++; lecDire();
  };
  u.onend = ()=>{
    // phrase lue en entier : on mesure la vitesse réelle pour corriger la suivante
    if(jeton === LEC.jeton && debutParole) lecMesurer(taux, texte.length, performance.now() - debutParole);
    apres();
  };
  u.onerror = apres;
  speechSynthesis.speak(u);
}
// ── Vitesse réelle ──
// L'iPhone ne respecte pas la vitesse demandée de façon proportionnelle
// (au-dessus de 1, il accélère bien plus fort). On mesure donc la vitesse
// réelle de chaque phrase, et on corrige la valeur envoyée jusqu'à ce que
// « 1,5× » soit vraiment une fois et demie la vitesse normale.
// Les réglages appris sont gardés par voix, sur le téléphone.
const LEC_CAL_CLE = "lec-calibrage-v1";
const LEC_CPS_DEFAUT = 14;      // vitesse normale d'une voix française, en caractères/seconde
let LEC_CAL = {};
try{ LEC_CAL = JSON.parse(lecLire(LEC_CAL_CLE) || "{}") || {}; }catch(e){ LEC_CAL = {}; }
// les anciens réglages appris pouvaient dériver (trop lent, trop rapide) : on les oublie
Object.values(LEC_CAL).forEach(c=>{ if(c) c.envoi = {}; });
function lecCal(){
  const v = LEC.voix;
  const k = v ? (v.voiceURI || v.name) : "defaut";
  return LEC_CAL[k] || (LEC_CAL[k] = { base:0, envoi:{} });
}
function lecVitesseCible(){ return (lecCal().base || LEC_CPS_DEFAUT) * LEC.vitesse; }   // pour suivre les mots à l'estimation
// L'iPhone (Safari) n'accélère pas en proportion : au-dessus de 1, un petit écart suffit à aller beaucoup plus vite,
// et au-dessous il ralentit peu. Cette table donne, pour chaque vitesse affichée, la valeur à envoyer pour l'obtenir.
// Ailleurs (Chrome, Android, ordinateur), la vitesse demandée est respectée telle quelle.
const LEC_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const LEC_TABLE_IOS = { 0.75:0.8, 0.9:0.93, 1:1, 1.1:1.05, 1.25:1.11, 1.5:1.21, 1.75:1.3, 2:1.38 };
function lecTauxEnvoye(){
  const m = LEC.vitesse;
  if(m === 1) return 1;
  return LEC_IOS ? (LEC_TABLE_IOS[m] || m) : m;
}
function lecMesurer(taux, nbCar, ms){
  if(ms < 600 || nbCar < 25) return;          // trop court pour être fiable
  const cps = nbCar / (ms / 1000);
  const c = lecCal();
  // on ne mesure plus que la vitesse normale de la voix : elle sert à suivre les mots quand la voix ne les signale pas
  if(taux === 1) c.base = c.base ? c.base * 0.7 + cps * 0.3 : cps;
  lecEcrire(LEC_CAL_CLE, JSON.stringify(LEC_CAL));
}
// Couper la phrase en cours sans déclencher la suivante.
function lecCouper(){ LEC.jeton++; lecArreterMinuteur(); try{ speechSynthesis.cancel(); }catch(e){} }
function lecRelancer(){
  lecCouper();
  // Safari ignore parfois un speak() collé à un cancel()
  setTimeout(lecDire, 80);
}

// Toucher un mot pendant la lecture : on reprend à ce mot.
function lecPositionTouchee(x, y){
  if(document.caretPositionFromPoint){
    const c = document.caretPositionFromPoint(x, y);
    return c ? { n:c.offsetNode, o:c.offset } : null;
  }
  if(document.caretRangeFromPoint){
    const r = document.caretRangeFromPoint(x, y);
    return r ? { n:r.startContainer, o:r.startOffset } : null;
  }
  return null;
}
function lecToucher(e){
  if(!LEC.actif) return;
  if(e.target.closest("a, button, input, textarea, img, figure, .cours-pdf")) return;   // une image, un lien, un document : ils s'ouvrent
  const bloc = e.target.closest(".section, .recap, .pdf-page");
  if(!bloc || !LEC.racine || !LEC.racine.contains(bloc)) return;
  const pos = lecPositionTouchee(e.clientX, e.clientY);
  let pi = -1, ti = 0;
  if(pos && pos.n && pos.n.nodeType === 3){
    // le mot touché, ou à défaut le premier mot qui suit dans ce nœud
    for(let i = 0; i < LEC.phrases.length && pi < 0; i++){
      const toks = LEC.phrases[i].toks;
      for(let k = 0; k < toks.length; k++){
        const t = toks[k];
        const dedans = (t.n1 === pos.n && t.o1 <= pos.o && (t.n2 !== pos.n || pos.o <= t.o2))
                    || (t.n2 === pos.n && t.n1 !== pos.n && pos.o <= t.o2);
        if(dedans || (t.n1 === pos.n && t.o1 >= pos.o)){ pi = i; ti = k; break; }
      }
    }
  }
  if(pi < 0){
    const bi = LEC.blocs.indexOf(bloc);
    pi = LEC.phrases.findIndex(p=>p.b === bi);
    ti = 0;
  }
  if(pi < 0) return;
  e.preventDefault(); e.stopPropagation();
  haptic();
  LEC.i = pi; LEC.depuis = ti; LEC.pause = false; LEC.toucheA = 0;
  lecMajBarre(); lecGarderEcran();
  lecCouper();
  lecDire();                       // dans le geste : Safari laisse parler
}
function lecDefilementManuel(){ LEC.toucheA = Date.now(); }

// Garder l'écran allumé pendant la lecture : sinon la mise en veille automatique
// verrouille le téléphone, et l'iPhone coupe la voix.
let lecVerrou = null;
async function lecGarderEcran(){
  try{
    if(!("wakeLock" in navigator) || lecVerrou) return;
    lecVerrou = await navigator.wakeLock.request("screen");
    lecVerrou.addEventListener("release", ()=>{ lecVerrou = null; });
  }catch(e){ lecVerrou = null; }
}
function lecLibererEcran(){
  try{ if(lecVerrou) lecVerrou.release(); }catch(e){}
  lecVerrou = null;
}

// où on en était dans chaque chapitre ou document (gardé sur le téléphone, même si l'app est fermée)
const LEC_POS_CLE = "lec-positions-v1";
function lecPositions(){ try{ return JSON.parse(lecLire(LEC_POS_CLE) || "{}") || {}; }catch(e){ return {}; } }
function lecCle(root){ return root ? (root.dataset.lecCle || root.dataset.cle || "") : ""; }
function lecNoterPosition(){
  const cle = lecCle(LEC.racine); if(!cle || !LEC.phrases.length) return;
  const t = lecPositions(); t[cle] = { i:LEC.i, n:LEC.phrases.length, t:Date.now() };
  const k = Object.keys(t).sort((a,b)=>t[b].t - t[a].t).slice(0, 40), garde = {};
  k.forEach(x=>garde[x] = t[x]);
  lecEcrire(LEC_POS_CLE, JSON.stringify(garde));
}
// la section affichée à l'écran : la première dont le bas dépasse l'en-tête
function lecBlocVisible(blocs){
  const haut = blocs[0] && blocs[0].classList.contains("pdf-page") ? 60 : 130;
  const i = blocs.findIndex(b=>{ const r = b.getBoundingClientRect(); return r.bottom > haut + 40 && r.height > 0; });
  return i < 0 ? 0 : i;
}
function lecteurStart(root){
  if(!TTS_OK){ toast("La lecture à voix haute n'est pas disponible sur cet appareil."); return; }
  lecteurStop();
  const f = construireFile(root);
  if(!f.phrases.length){ toast(root.classList.contains("pdf-pages") ? "Pas de texte à lire dans ce document." : "Rien à lire dans ce chapitre."); return; }
  // on commence au début de la section affichée ; si on s'était arrêté dans cette section, on reprend à la phrase exacte
  const bv = lecBlocVisible(f.blocs);
  let i0 = Math.max(0, f.phrases.findIndex(p=>p.b === bv));
  const sv = lecPositions()[lecCle(root)];
  if(sv && sv.n === f.phrases.length && f.phrases[sv.i]){
    // l'endroit où on s'était arrêté est encore à l'écran : on y reprend
    const r = f.blocs[f.phrases[sv.i].b].getBoundingClientRect();
    if(r.bottom > 100 && r.top < innerHeight - 80) i0 = sv.i;
  }
  Object.assign(LEC, { phrases:f.phrases, blocs:f.blocs, racine:root, i:i0, depuis:0,
                       actif:true, pause:false, blocCourant:-1, toucheA:0 });
  root.addEventListener("click", lecToucher, true);
  window.addEventListener("touchmove", lecDefilementManuel, { passive:true });
  window.addEventListener("wheel", lecDefilementManuel, { passive:true });
  lecBarre();
  document.body.classList.add("lec-on");
  lecDire();                                  // dans le geste : iOS l'exige pour le premier son
  lecGarderEcran();
}
// La pastille « Écouter » : sur un chapitre qui a du texte, quand la lecture n'est pas lancée
function majPastilleAudio(){
  let p = document.getElementById("audio-pill");
  const ecran = document.documentElement.getAttribute("data-screen");
  const pane = document.querySelector("#screen-split .pane.active");
  const ok = TTS_OK && ecran === "split" && pane && pane.querySelector(".section") && !LEC.bar
    && !document.querySelector(".pdf-voile, .img-voile, .sheet-overlay.open, #pick-sheet.open, #form-sheet.open");
  if(!ok){ if(p) p.hidden = true; return; }
  if(!p){
    p = el("button","pomo-pill audio-pill"); p.id = "audio-pill"; p.type = "button";
    p.setAttribute("aria-label", "Écouter ce chapitre");
    p.innerHTML = LEC_ICO.voix;
    p.addEventListener("click", ()=>{ if(p._glisse) return; const pn = document.querySelector("#screen-split .pane.active"); if(pn){ haptic(); lecteurStart(pn); } });
    document.body.appendChild(p);
    rendreDeplacable(p, "audio", "droite");
  }
  p.hidden = false;
}
setInterval(()=>{ try{ majPastilleAudio(); }catch(e){} }, 700);
// Une pastille qu'on déplace au doigt : elle se cale sur le bord le plus proche, et garde sa place
function rendreDeplacable(p, nom, coteDefaut){
  const CLE = "pastille-" + nom;
  const poser = ()=>{
    let pos = null; try{ pos = JSON.parse(localStorage.getItem(CLE) || "null"); }catch(e){}
    if(!pos) return;
    const h = window.innerHeight, w = p.offsetWidth || 120;
    const y = Math.max(70, Math.min(h - (p.offsetHeight || 44) - 20, pos.y * h));
    p.style.top = y + "px"; p.style.bottom = "auto";
    if(pos.cote === "gauche"){ p.style.left = "16px"; p.style.right = "auto"; }
    else { p.style.right = "16px"; p.style.left = "auto"; }
  };
  if(coteDefaut === "droite" && !localStorage.getItem(CLE)){ p.style.right = "calc(env(safe-area-inset-right) + 16px)"; p.style.left = "auto"; }
  poser();
  addEventListener("resize", poser);
  let x0 = 0, y0 = 0, bx = 0, by = 0, actif = false, bouge = false;
  p.style.touchAction = "none";
  p.addEventListener("pointerdown", e=>{
    const r = p.getBoundingClientRect();
    x0 = e.clientX; y0 = e.clientY; bx = r.left; by = r.top; actif = true; bouge = false; p._glisse = false;
  });
  addEventListener("pointermove", e=>{
    if(!actif) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if(!bouge && Math.hypot(dx, dy) < 8) return;
    bouge = true; p._glisse = true; p.classList.add("glisse");
    p.style.left = Math.max(4, Math.min(innerWidth - p.offsetWidth - 4, bx + dx)) + "px"; p.style.right = "auto";
    p.style.top = Math.max(50, Math.min(innerHeight - p.offsetHeight - 10, by + dy)) + "px"; p.style.bottom = "auto";
  });
  const fin = ()=>{
    if(!actif) return; actif = false;
    p.classList.remove("glisse");
    if(!bouge) return;
    const r = p.getBoundingClientRect();
    const cote = r.left + r.width / 2 < innerWidth / 2 ? "gauche" : "droite";
    try{ localStorage.setItem(CLE, JSON.stringify({ cote, y:r.top / innerHeight })); }catch(e){}
    haptic(); poser();
    setTimeout(()=>{ p._glisse = false; }, 60);   // le geste ne compte pas comme un appui
  };
  addEventListener("pointerup", fin); addEventListener("pointercancel", fin);
}
function lecteurStop(){
  if(!LEC || (!LEC.actif && !LEC.bar)) return;
  lecCouper();
  LEC.actif = false; LEC.pause = false;
  // sans choix personnel, la prochaine lecture reprendra la meilleure voix disponible
  if(!lecLire("lec-voix")) LEC.voixId = "";
  lecLibererEcran();
  if(LEC.racine) LEC.racine.removeEventListener("click", lecToucher, true);
  window.removeEventListener("touchmove", lecDefilementManuel);
  window.removeEventListener("wheel", lecDefilementManuel);
  lecSurligner("lec-phrase", null); lecSurligner("lec-mot", null);
  LEC.blocs.forEach(b=>b.classList.remove("tts-on"));
  LEC.blocs = []; LEC.phrases = []; LEC.blocCourant = -1; LEC.racine = null;
  if(LEC.bar){ LEC.bar.remove(); LEC.bar = null; }
  lecPleinFermer();
  document.body.classList.remove("lec-on");
}
function lecPlayPause(){
  if(LEC.pause){ LEC.pause = false; LEC.toucheA = 0; lecMajBarre(); lecDire(); lecGarderEcran(); }
  else{ LEC.pause = true; lecCouper(); lecMajBarre(); lecLibererEcran(); lecNoterPosition(); }
}
function lecAller(sens){
  const bi = LEC.phrases[LEC.i] ? LEC.phrases[LEC.i].b : 0;
  const debut = b => LEC.phrases.findIndex(p=>p.b === b);
  let cible;
  if(sens > 0){
    cible = LEC.phrases.findIndex(p=>p.b > bi);
    if(cible < 0){ lecteurStop(); return; }
  }else{
    const d = debut(bi);
    // en début de section, on remonte à la précédente ; sinon on reprend celle-ci
    cible = (LEC.i - d > 1 || bi === 0) ? d : debut(LEC.phrases[d - 1].b);
  }
  LEC.i = cible; LEC.depuis = 0; LEC.pause = false; LEC.toucheA = 0;
  lecMajBarre(); lecRelancer();
}
// Au-delà de 2×, Safari plafonne : inutile de proposer plus.
function lecVitesse(){
  const enCours = !LEC.pause;
  if(enCours){ LEC.pause = true; lecCouper(); lecMajBarre(); }
  const fmt = v => String(v).replace(".", ",") + "×";
  openPicker("Vitesse de lecture", LEC_VITESSES.map(v=>({
    label: fmt(v) + (v === LEC.vitesse ? "  ✓" : ""),
    sub: v === 1 ? "vitesse normale" : v < 1 ? "plus lent" : "plus rapide",
    value: String(v)
  })), v=>{
    LEC.vitesse = parseFloat(v);
    lecEcrire("lec-vitesse", String(LEC.vitesse));
    if(LEC.actif){ LEC.pause = false; lecMajBarre(); lecRelancer(); }
  });
}
function lecChoixVoix(){
  const vs = voixFrancaises();
  const cur = lecVoixActuelle() || {};
  const actuelle = LEC.voixId === VOIX_SYSTEME ? VOIX_SYSTEME : (cur.voiceURI || cur.name);
  if(!LEC.pause){ LEC.pause = true; lecCouper(); lecMajBarre(); }
  openPicker("Choisir une voix", [{
    label: "Voix de l'iPhone" + (actuelle === VOIX_SYSTEME ? "  ✓" : ""),
    sub: "celle de Réglages › Accessibilité › Contenu énoncé · souvent la plus naturelle",
    value: VOIX_SYSTEME
  }].concat(vs.map(v=>({
    label: v.name + ((v.voiceURI || v.name) === actuelle ? "  ✓" : ""),
    sub: [lecQualite(v) ? "voix " + lecQualite(v) : "", v.lang, v.localService ? "sur l'appareil" : "en ligne"]
           .filter(Boolean).join(" · "),
    value: v.voiceURI || v.name
  }))), nom=>{
    lecEcrire("lec-voix", nom);
    LEC.voix = nom === VOIX_SYSTEME ? null : (vs.find(v=>(v.voiceURI || v.name) === nom) || null);
    LEC.voixId = nom === VOIX_SYSTEME ? VOIX_SYSTEME : (LEC.voix ? lecIdVoix(LEC.voix) : "");
    LEC.motsSignales = false;              // la nouvelle voix signale peut-être autrement
    toast("Voix choisie.");
    if(LEC.actif){ LEC.pause = false; lecMajBarre(); lecRelancer(); }
  });
}

const LEC_ICO = {
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14"/><path d="M18 6l-8 6 8 6z" fill="currentColor"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5v14"/><path d="M6 6l8 6-8 6z" fill="currentColor"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  voix:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
};
// Le lecteur : une pilule (section précédente, pause entourée de la progression, suivante, vitesse, fermer).
// Un appui sur la vitesse ou sur le fond de la pilule ouvre le lecteur complet.
function lecBarre(){
  if(LEC.bar) LEC.bar.remove();
  const bar = el("div","lec-bar");
  const b = (cls, html, label, fn, dans)=>{
    const x = el("button","lec-btn " + cls);
    x.type = "button"; x.innerHTML = html; x.setAttribute("aria-label", label);
    x.addEventListener("click", e=>{ e.stopPropagation(); haptic(); fn(); });
    (dans || bar).appendChild(x); return x;
  };
  const unite = lecEstPdf() ? "Page" : "Section";
  b("lec-prev", LEC_ICO.prev, unite + " précédente", ()=>lecAller(-1));
  const anneau = el("span","lec-anneau");
  anneau.innerHTML = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" class="lec-anneau-fond"/><circle cx="24" cy="24" r="22" class="lec-anneau-val"/></svg>`;
  bar.appendChild(anneau);
  b("lec-play", LEC_ICO.pause, "Pause", lecPlayPause, anneau);
  b("lec-next", LEC_ICO.next, unite + " suivante", ()=>lecAller(1));
  b("lec-speed", "", "Vitesse et lecteur complet", lecPleinOuvrir);
  b("lec-close", LEC_ICO.close, "Arrêter la lecture", lecteurStop);
  bar.addEventListener("click", ()=>{ haptic(); lecPleinOuvrir(); });
  document.body.appendChild(bar);
  LEC.bar = bar;
  lecMajBarre();
  clearInterval(LEC.suivi); LEC.suivi = setInterval(()=>{ if(!LEC.bar){ clearInterval(LEC.suivi); return; } lecMajProgression(); }, 400);
  requestAnimationFrame(()=>bar.classList.add("show"));
}
function lecMajBarre(){
  if(!LEC.bar) return;
  const p = LEC.bar.querySelector(".lec-play");
  p.innerHTML = LEC.pause ? LEC_ICO.play : LEC_ICO.pause;
  p.setAttribute("aria-label", LEC.pause ? "Reprendre" : "Pause");
  LEC.bar.querySelector(".lec-speed").textContent = String(LEC.vitesse).replace(".", ",") + "×";
  lecMajProgression();
}
// Où on en est : l'anneau de la pilule, et le lecteur complet s'il est ouvert
function lecSecondes(n){ return n / (LEC_CPS_DEFAUT * (LEC.vitesse || 1)); }
function lecDuree(sec){ const m = Math.round(sec / 60); return m < 1 ? "moins d'une minute" : m === 1 ? "1 min" : m + " min"; }
function lecNomBloc(bi){
  const b = LEC.blocs[bi]; if(!b) return "";
  if(lecEstPdf()) return "Page " + (bi + 1);
  const t = b.querySelector(".section-title, .recap-label");
  return t ? t.textContent.replace(/\s+/g, " ").trim() : "Section " + (bi + 1);
}
function lecMajProgression(){
  if(!LEC.bar || !LEC.phrases.length) return;
  const n = LEC.phrases.length, i = Math.max(0, Math.min(n - 1, LEC.i || 0));
  const v = LEC.bar.querySelector(".lec-anneau-val");
  if(v) v.style.strokeDashoffset = String(138.2 * (1 - i / n));
  const pl = document.getElementById("lec-plein");
  if(!pl || !pl.classList.contains("open")) return;
  const bi = LEC.phrases[i].b, nb = LEC.blocs.length;
  const longueur = p => (p.toks || []).reduce((x, m)=>x + (m.dit || "").length + 1, 0);
  let avant = 0, reste = 0;
  LEC.phrases.forEach((p, k)=>{ if(k < i) avant += longueur(p); else reste += longueur(p); });
  pl.querySelector(".lp-k").textContent = (lecEstPdf() ? "PAGE " : "SECTION ") + (bi + 1) + " SUR " + nb;
  pl.querySelector(".lp-titre").textContent = lecNomBloc(bi);
  const prog = pl.querySelector(".lp-prog");
  if(prog.children.length !== nb) prog.innerHTML = "<i></i>".repeat(nb);
  const debut = LEC.phrases.findIndex(p=>p.b === bi), fin = LEC.phrases.filter(p=>p.b === bi).length;
  [...prog.children].forEach((x, k)=>{
    x.style.setProperty("--p", k < bi ? "100%" : k > bi ? "0%" : Math.round(100 * (i - debut) / Math.max(1, fin)) + "%");
  });
  pl.querySelector(".lp-ecoule").textContent = lecDuree(lecSecondes(avant)).replace("moins d'une minute", "0 min") + " écoutées";
  pl.querySelector(".lp-reste").textContent = "encore " + lecDuree(lecSecondes(reste));
  pl.querySelector(".lp-play").innerHTML = LEC.pause ? LEC_ICO.play : LEC_ICO.pause;
  pl.querySelectorAll(".lp-vit button").forEach(x=>x.classList.toggle("on", parseFloat(x.dataset.v) === LEC.vitesse));
  const voix = lecVoixActuelle();
  pl.querySelector(".lp-voix em").textContent = LEC.voixId === VOIX_SYSTEME || !voix ? "Voix de l'iPhone" : voix.name;
}
// Une phrase avant ou après
function lecPhrase(sens){
  if(!LEC.phrases.length) return;
  LEC.i = Math.max(0, Math.min(LEC.phrases.length - 1, (LEC.i || 0) + sens));
  LEC.depuis = 0; LEC.pause = false; LEC.toucheA = 0;
  lecMajBarre(); lecRelancer();
}
// Le lecteur complet : la section lue, la progression section par section, les phrases, toutes les vitesses, la voix
function lecPleinOuvrir(){
  let pl = document.getElementById("lec-plein");
  if(!pl){
    pl = el("div","lec-plein"); pl.id = "lec-plein";
    pl.innerHTML = `<div class="lp-voile"></div><div class="lp-feuille" role="dialog" aria-label="Lecteur">
      <div class="lp-poignee"></div>
      <div class="lp-k"></div><div class="lp-titre"></div>
      <div class="lp-prog"></div><div class="lp-temps"><span class="lp-ecoule"></span><span class="lp-reste"></span></div>
      <div class="lp-ctl">
        <button type="button" class="lp-b" data-a="sec-">${LEC_ICO.prev}</button>
        <button type="button" class="lp-b lp-ph" data-a="ph-">‹ phrase</button>
        <button type="button" class="lp-b lp-play" data-a="play"></button>
        <button type="button" class="lp-b lp-ph" data-a="ph+">phrase ›</button>
        <button type="button" class="lp-b" data-a="sec+">${LEC_ICO.next}</button>
      </div>
      <div class="lp-k">VITESSE</div>
      <div class="lp-vit">${LEC_VITESSES.map(v=>`<button type="button" data-v="${v}">${String(v).replace(".", ",")}×</button>`).join("")}</div>
      <button type="button" class="lp-voix">${LEC_ICO.voix}<span>Voix</span><em></em><b>›</b></button>
      <button type="button" class="lp-stop">Arrêter la lecture</button>
    </div>`;
    document.body.appendChild(pl);
    pl.querySelector(".lp-voile").addEventListener("click", lecPleinFermer);
    pl.querySelectorAll(".lp-ctl button").forEach(x=>x.addEventListener("click", ()=>{
      haptic(); const a = x.dataset.a;
      if(a === "play") lecPlayPause(); else if(a === "sec-") lecAller(-1); else if(a === "sec+") lecAller(1);
      else lecPhrase(a === "ph+" ? 1 : -1);
      lecMajProgression();
    }));
    pl.querySelectorAll(".lp-vit button").forEach(x=>x.addEventListener("click", ()=>{
      haptic(); LEC.vitesse = parseFloat(x.dataset.v); lecEcrire("lec-vitesse", String(LEC.vitesse));
      if(LEC.actif && !LEC.pause) lecRelancer();
      lecMajBarre();
    }));
    pl.querySelector(".lp-voix").addEventListener("click", ()=>{ haptic(); lecPleinFermer(); lecChoixVoix(); });
    pl.querySelector(".lp-stop").addEventListener("click", ()=>{ haptic(); lecPleinFermer(); lecteurStop(); });
    // glisser vers le bas pour fermer
    const f = pl.querySelector(".lp-feuille"); let y0 = null;
    f.addEventListener("touchstart", e=>{ y0 = e.touches[0].clientY; }, { passive:true });
    f.addEventListener("touchmove", e=>{ if(y0 === null) return; const d = e.touches[0].clientY - y0; if(d > 0) f.style.transform = `translateY(${d}px)`; }, { passive:true });
    f.addEventListener("touchend", e=>{ const d = (e.changedTouches[0].clientY - (y0 ?? 0)); f.style.transform = ""; y0 = null; if(d > 80) lecPleinFermer(); });
  }
  pl.classList.add("open");
  lecMajProgression();
}
function lecPleinFermer(){ const pl = document.getElementById("lec-plein"); if(pl) pl.classList.remove("open"); }
// Le bouton posé en haut d'un chapitre.
function lecteurBouton(root, icone){
  const x = el("button", icone ? "chap-share chap-ecoute" : "lec-start");
  x.type = "button";
  x.innerHTML = icone ? LEC_ICO.voix : LEC_ICO.voix + "<span>Écouter ce chapitre</span>";
  x.setAttribute("aria-label", "Écouter ce chapitre");
  x.addEventListener("click",()=>{ haptic(); lecteurStart(root); });
  return x;
}
// Écran verrouillé ou app en arrière-plan : iOS coupe la voix, on se met en pause.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden && LEC.actif){ if(!LEC.pause){ LEC.pause = true; lecCouper(); lecMajBarre(); lecLibererEcran(); } lecNoterPosition(); }
});
