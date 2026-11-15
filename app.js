// ══════════════════════════════════════════════════
// ⚙️ CONFIG SUPABASE — à remplir
// ══════════════════════════════════════════════════
const SUPA_URL = "https://dcasxxrwmoguxxubktwh.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjYXN4eHJ3bW9ndXh4dWJrdHdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTE4NDMsImV4cCI6MjA5OTY4Nzg0M30.ypqfkisM4GGJCfVbwCug0RIY0fZwqV3LZUw9yJ3_XXw";
const PSEUDO_KEY = "revision_pseudo_v1";
let PSEUDO = null;
let syncOn = false;

// ══════════════════════════════════════════════════
// 📅 CONFIG EMPLOI DU TEMPS (liens iCal U-PEC)
// ══════════════════════════════════════════════════
const EDT_URLS = {
  purple: "https://mon-edt.u-pec.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?data=8af2d3acaab2e3f8f7ecc482dce660b1599d09a9810a48832611823d9bee9931470de3789da5cc78c5ea70a36fb595da1ba3b83632f13b929ebcbb79a6eca9bb11503a7e92842fe7406f9470d8017754,1",
  girly:  "https://mon-edt.u-pec.fr/jsp/custom/modules/plannings/anonymous_cal.jsp?data=8e11890a9d1ec9ee2ec3316296f2ea28dc699bd03883ae0d3f47cb21b108f1527a22d5f9af0404d29c35144f94851de110150945a1cad8715352c2d7c46ba0d618f1d101d03012f832d1cd77261c806415aef6e62da593145b09edad16903aac,1"
};
const EDT_CACHE_KEY = "revision_edt_v1";
// nom exact de ta fonction Supabase (Edge Functions)
const EDT_FN_NAME = "smooth-responder";
// fonction qui garde la table users : seul chemin vers la base
const API_FN_NAME = "revision-api";

// Réglages de l'utilisateur connecté : { edt_url, news_url }
let USER_SETTINGS = {};
// page d'actualités par défaut : la scolarité L3 SESS de l'UPEC
const NEWS_URL_DEFAULT = "https://sess-staps.u-pec.fr/scolarite/licence-sess/l3-sess";

// Les calendriers de la personne connectée : [{ id, label, url }].
// On accepte encore l'ancien réglage à lien unique, pour ne rien perdre.
function edtCalendars(){
  const st = USER_SETTINGS || {};
  if(Array.isArray(st.edt_urls) && st.edt_urls.length){
    return st.edt_urls.filter(c=>c && c.url);
  }
  if(st.edt_url){
    return [{ id:"main", label:"Mon emploi du temps", url:String(st.edt_url).trim() }];
  }
  const who = isCiva() ? "purple" : isNana() ? "girly" : null;
  if(who && EDT_URLS[who]) return [{ id:"theme", label:"Mon emploi du temps", url:EDT_URLS[who] }];
  return [];
}
// Passe au format liste dès la première modification.
function edtCalendarsWritable(){
  const st = USER_SETTINGS;
  if(!Array.isArray(st.edt_urls)){
    st.edt_urls = edtCalendars().map(c=>({ id:c.id==="theme" ? newId() : c.id, label:c.label, url:c.url }));
    delete st.edt_url;
  }
  return st.edt_urls;
}
function newsUrl(){ return (USER_SETTINGS && USER_SETTINGS.news_url) || NEWS_URL_DEFAULT; }

// ══════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════
// ── Les données (UES, SUBJECTS, SEMESTRES, PSYCHO_*) sont dans data.js,
//    chargé juste avant ce script. Voir la balise <script src="data.js">.

// ══════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════
const THEME_KEY = "revision_theme_v1";
const SRS_KEY   = "revision_srs_v1";

// ══════════════════════════════════════════════════
// RÉVISION ESPACÉE (SM-2 simplifié)
// ══════════════════════════════════════════════════
// Pour chaque carte on garde : intervalle (jours), facilité, prochaine échéance.
// Note : 0 = pas su · 1 = difficile · 2 = facile
let SRS = {};
function srsLoad(){ try{ SRS = JSON.parse(localStorage.getItem(SRS_KEY) || "{}"); }catch(e){ SRS = {}; } }
function srsSave(){ try{ localStorage.setItem(SRS_KEY, JSON.stringify(SRS)); }catch(e){} scheduleSync(); }
srsLoad();

// Chapitres marqués « révisé » par moi : { "matière|cm|libellé": date }
var REVISES_KEY = "revision_revises_v1";
var REVISES = {};
try{ REVISES = JSON.parse(localStorage.getItem(REVISES_KEY) || "{}") || {}; }catch(e){ REVISES = {}; }
function revisesSave(){ try{ localStorage.setItem(REVISES_KEY, JSON.stringify(REVISES)); }catch(e){} scheduleSync(); }
function cleRevise(subj, type, ch){ return subj.id + "|" + type + "|" + (ch && ch.label || ""); }
function estRevise(subj, type, ch){ return !!REVISES[cleRevise(subj, type, ch)]; }
// Questions ratées (QCM et mode examen) : { clé de carte: date }. Elles forment « Mes erreurs ».
var ERREXAM_KEY = "revision_erreurs_examen_v1";
var ERREXAM = {};
try{ ERREXAM = JSON.parse(localStorage.getItem(ERREXAM_KEY) || "{}") || {}; }catch(e){ ERREXAM = {}; }
function errExamSave(){ try{ localStorage.setItem(ERREXAM_KEY, JSON.stringify(ERREXAM)); }catch(e){} scheduleSync(); }
// une erreur : la dernière réponse était fausse (QCM), ou ratée à l'examen et pas encore reprise
function estErreur(key){ return !!ERREXAM[key] || !!(SRS[key] && SRS[key].rep === 0 && SRS[key].due); }
// Mes notes sur un chapitre : { "matière|cm|libellé": { t:texte, d:date } }
var CHNOTES_KEY = "revision_notes_chap_v1";
var CHNOTES = {};
try{ CHNOTES = JSON.parse(localStorage.getItem(CHNOTES_KEY) || "{}") || {}; }catch(e){ CHNOTES = {}; }
function chNotesSave(){ try{ localStorage.setItem(CHNOTES_KEY, JSON.stringify(CHNOTES)); }catch(e){} scheduleSync(); }
function noteDe(cle){ return (CHNOTES[cle] && CHNOTES[cle].t) || ""; }
// Profs saisis par moi : { "id matière|cm": { nom, mail } }.
// Une entrée vide masque le prof prévu par défaut.
var PROFS_KEY = "revision_profs_v1";
var PROFS = {};
try{ PROFS = JSON.parse(localStorage.getItem(PROFS_KEY) || "{}") || {}; }catch(e){ PROFS = {}; }
function profsSave(){ try{ localStorage.setItem(PROFS_KEY, JSON.stringify(PROFS)); }catch(e){} scheduleSync(); }
function profDe(subj, type){
  if(!subj) return null;
  const k = subj.id + "|" + type;
  const plein = p=>p && (p.nom || p.mail) ? p : null;
  if(k in PROFS) return plein(PROFS[k]);
  const d = plein(subj.profs && subj.profs[type]);
  if(d) return d;
  // chapitres reçus d'une classe : l'auteur a pu indiquer le prof
  const recu = (subj[type]||[]).find(ch=>ch._shared && ch.meta && ch.meta.profs && plein(ch.meta.profs[type]));
  return recu ? recu.meta.profs[type] : null;
}
function basculerRevise(subj, type, ch){
  const k = cleRevise(subj, type, ch);
  if(REVISES[k]) delete REVISES[k]; else REVISES[k] = Date.now();
  revisesSave();
  return !!REVISES[k];
}

// ══════════════════════════════════════════════════
// ANNOTATIONS DE COURS (contrôle, note perso, matière liée)
// ══════════════════════════════════════════════════
// Clé = identifiant stable du créneau (titre + date/heure de début).
// { type:"controle"|"devoir"|"", note:"", subj:"e192", done:false }
const NOTES_KEY = "revision_edt_notes_v1";
let EDTNOTES = {};
function notesLoad(){ try{ EDTNOTES = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"); }catch(e){ EDTNOTES = {}; } }
function notesSave(){ try{ localStorage.setItem(NOTES_KEY, JSON.stringify(EDTNOTES)); }catch(e){} scheduleSync(); }
notesLoad();

// identifiant d'un créneau, stable même si l'EDT est rechargé
function evKey(e){
  if(e && e.cle) return e.cle;               // un devoir posé sur un jour, sans cours : « jour|AAAA-MM-JJ|id »
  return (e.title||"cours").slice(0,40) + "@" + (e.start ? e.start.toISOString().slice(0,16) : "?");
}
function evNote(e){ return EDTNOTES[evKey(e)] || null; }

// ══════════════════════════════════════════════════
// MÉMO : tâches à cocher + bloc-notes libre
// ══════════════════════════════════════════════════
const MEMO_KEY = "revision_memo_v1";
let MEMO = { todos: [], note: "" };
function memoLoad(){
  try{
    const m = JSON.parse(localStorage.getItem(MEMO_KEY) || "null");
    if(m && typeof m === "object"){
      MEMO = { todos: Array.isArray(m.todos) ? m.todos : [], note: typeof m.note === "string" ? m.note : "" };
    }
  }catch(e){ MEMO = { todos: [], note: "" }; }
}
function memoSave(){ try{ localStorage.setItem(MEMO_KEY, JSON.stringify(MEMO)); }catch(e){} scheduleSync(); }
memoLoad();

// Annotations devenues orphelines : le créneau annoté n'existe plus dans l'EDT
// (cours déplacé ou annulé par la fac). On ne regarde QUE la période couverte
// par le calendrier, sinon tout serait signalé comme orphelin.
function orphanNotes(){
  if(!EDT.length) return [];
  const keys = new Set(EDT.map(evKey));
  // fenêtre en jours entiers : un cours déplacé dans la journée ne doit pas
  // faire sortir son annotation de la période couverte.
  const dayStart = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const dayEnd   = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  const first = dayStart(EDT[0].start), last = dayEnd(EDT[EDT.length-1].start);
  const out = [];
  Object.keys(EDTNOTES).forEach(k=>{
    if(keys.has(k)) return;                       // toujours là : rien à signaler
    const n = EDTNOTES[k] || {};
    if(!n.type && !n.note && !n.subj) return;     // annotation vide
    if(n.done) return;                            // déjà réglée
    if(n.dismissed) return;                       // écartée par l'utilisatrice
    // date encodée dans la clé : "Titre@2026-09-08T10:30"
    const at = k.lastIndexOf("@");
    const d  = at >= 0 ? new Date(k.slice(at+1)) : null;
    if(!d || isNaN(d)) return;
    if(d < first || d > last) return;             // hors période du calendrier
    out.push({ key:k, note:n, title:k.slice(0,at), when:d });
  });
  return out.sort((a,b)=>a.when-b.when);
}

const DAY = 86400000;
function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
// clé unique et stable d'une carte
function cardKey(subjId, mode, item, i){
  const base = (item && item.q) ? item.q
             : (item && item.texte) ? item.texte
             : (item && item.nom) ? item.nom : String(i);
  let h=0; for(let k=0;k<base.length;k++){ h=(h*31+base.charCodeAt(k))|0; }
  return subjId+"_"+mode+"_"+h;
}
function srsGet(key){
  return SRS[key] || { rep:0, interval:0, ease:2.5, due:0 };
}
// met à jour une carte après réponse
function srsReview(key, grade){
  const c = srsGet(key);
  if(grade === 0){                       // pas su : on repart
    c.rep = 0;
    c.interval = 0;                      // à revoir dans la même session
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = today0();                    // due aujourd'hui
  } else {
    c.rep += 1;
    if(grade === 1){                     // difficile : progresse, mais lentement
      c.ease = Math.max(1.3, c.ease - 0.15);
      if(c.rep === 1)      c.interval = 1;
      else if(c.rep === 2) c.interval = 2;
      else                 c.interval = Math.max(2, Math.round(c.interval * 1.4));
    } else {                             // facile
      c.ease = Math.min(2.8, c.ease + 0.1);
      if(c.rep === 1)      c.interval = 1;
      else if(c.rep === 2) c.interval = 3;
      else                 c.interval = Math.max(1, Math.round(c.interval * c.ease));
    }
    c.due = today0() + c.interval * DAY;
  }
  c.last = today0();
  SRS[key] = c;
  try{ noterJourRevision(); }catch(e){}
  srsSave();
  return c;
}
function srsIsDue(key){ const c = SRS[key]; return !c || c.due <= today0(); }
// nombre de questions à revoir aujourd'hui pour une matière (tous modes confondus) :
// seulement celles déjà faites qui reviennent. Une question jamais vue n'est pas « à revoir ».
function aRevoir(key){ const c = SRS[key]; return !!c && c.due <= today0(); }
function dueCount(subj){
  let n = 0;
  ["fc","qcm","oq","tr"].forEach(m=>{
    exos(subj, m).forEach((item,i)=>{ if(aRevoir(cardKey(subj.id,m,item,i))) n++; });
  });
  return n;
}
// nombre total de cartes d'une matière
function totalCards(subj){
  return (subj.fc?.length||0)+(subj.qcm?.length||0)+(subj.oq?.length||0)+(subj.tr?.length||0);
}
// notions "en cours d'acquisition" : révisées au moins une fois avec succès.
// (donne un feedback immédiat ; une notion vraiment ancrée a un intervalle long)
// avancement d'une liste de matières : chapitres de cours (CM, TD) marqués révisés
function avancementCours(list){
  let lus = 0, tot = 0;
  (list||[]).forEach(s=>["cm","td"].forEach(t=>(s[t]||[]).forEach(ch=>{ tot++; if(estRevise(s, t, ch)) lus++; })));
  return { lus, tot };
}
let curSemestre = 5;
let curSubj = null;
let curTab = 0;                 // 0=CM 1=TD 2=Train
let curCmIdx = 0, curTdIdx = 0;
let curMode = null, queue = [], idx = 0, score = 0, answers = [];
// les questions ratées pendant la session en cours : les réussir au second passage ne les sort pas de « Mes erreurs »
let rateesSession = new Set();
let flipped = false, selOpt = null, confirmed = false;
let sessionDueOnly = false;
let globalSession = false;
let sessionMix = null, MIX_CHS = null;   // id de la matière quand la série mélange QCM, flashcards et textes à trous
// session lancée depuis un thème du fil psycho (questions de plusieurs matières)
let sessionFil = null;
let showAns = false, showHint = false, lastMotiv = "";
let oqEcrit = "";   // ce qui est tapé dans une question ouverte, gardé le temps de la carte
let timerVal = 20, timerInt = null;
const stats = {};

const pick = a => a[Math.floor(Math.random() * a.length)];

// ── RETOUR HAPTIQUE ──
// iOS Safari n'expose pas navigator.vibrate. Astuce connue : "cliquer" un
// <label> associé à un <input switch> déclenche le moteur haptique natif.
let _hapticLabel = null;
(function initHaptics(){
  const lbl = document.createElement("label");
  lbl.id = "haptic-sw";
  lbl.setAttribute("aria-hidden","true");
  lbl.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
  lbl.innerHTML = '<input type="checkbox" switch style="pointer-events:none"/>';
  document.body.appendChild(lbl);
  _hapticLabel = lbl;
})();
function haptic(){
  try{
    if(navigator.vibrate){ navigator.vibrate(10); return; }    // Android / Chrome
    if(_hapticLabel){ _hapticLabel.click(); }                  // iOS : clic sur le label
  }catch(e){}
}
const shuffle = a => [...a].sort(() => Math.random() - .5);
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const chevronL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const chevronR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

// ══════════════════════════════════════════════════
// TEXTE DE COURS : nettoyage puis liens cliquables
// Le contenu peut venir d'une classe partagée : on ne fait
// confiance à personne, on retire ce qui peut exécuter du code.
// ══════════════════════════════════════════════════
function nettoyerHtml(t){
  return String(t || "")
    .replace(/<\s*\/?\s*(script|iframe|object|embed|link|meta|style|form|input)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "");
}

// [texte](adresse) et adresses collées telles quelles deviennent cliquables.
// Les liens de PDF et d'ENT contiennent souvent des parenthèses, des accents
// ou des paramètres : la reconnaissance doit rester large.
function urlComplete(u){
  return /^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^\/\//, "");
}
function libelleUrl(u){
  const court = u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  try{ return decodeURI(court.length > 44 ? court.slice(0,42) + "…" : court); }
  catch(e){ return court.length > 44 ? court.slice(0,42) + "…" : court; }
}
function balise(url, label){
  return `<a class="lien" href="${urlComplete(url).replace(/"/g,"%22")}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function liensCliquables(t){
  let out = String(t || "");
  // Les liens déjà fabriqués sont mis de côté le temps du traitement,
  // sinon la passe suivante irait re-transformer l'adresse à l'intérieur.
  const jetons = [];
  const garder = html => "\u0000" + (jetons.push(html) - 1) + "\u0000";

  // 0. liens déjà écrits en HTML dans le cours
  out = out.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, m => garder(m));

  // 1. forme nommée : [mon texte](adresse). L'adresse peut contenir des parenthèses,
  //    la capture gourmande recule jusqu'à la dernière fermante valable.
  out = out.replace(/\[([^\]\n]{1,140})\]\(\s*(\S+)\s*\)/g,
    (m, label, url) => garder(balise(url, label)));

  // 2. adresse collée seule, avec ou sans http, y compris les .pdf
  out = out.replace(/(^|[\s(>«"'])((?:https?:\/\/|www\.)[^\s<>"']+)/gi, (m, avant, url) => {
    let fin = "", u = url;
    while(u.length && /[.,;:!?»]$/.test(u)){ fin = u.slice(-1) + fin; u = u.slice(0, -1); }
    // parenthèse fermante non appariée : elle ferme la phrase, pas l'adresse
    while(u.endsWith(")") && (u.split("(").length - 1) < (u.split(")").length - 1)){
      fin = ")" + fin; u = u.slice(0, -1);
    }
    return avant + garder(balise(u, libelleUrl(u))) + fin;
  });

  return out.replace(/\u0000(\d+)\u0000/g, (m, i) => jetons[Number(i)]);
}

function texteCours(t){ return liensCliquables(nettoyerHtml(t)); }
// une note tapée à la main : le texte est protégé, les adresses deviennent des liens
function noteAvecLiens(t){ return liensCliquables(esc(t || "")); }
function liensDe(t){ return (String(t || "").match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).map(u=>u.replace(/[.,;:!?»)]+$/, "")); }

function el(tag, cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }

// ══════════════════════════════════════════════════
// ÉDITION DU CONTENU (réservée aux comptes autres que Civa :
// le contenu de Civa vit dans data.js, pas sur le serveur)
// ══════════════════════════════════════════════════
// Tout le monde peut créer. On ne modifie que ce qu'on a créé soi-même :
// une matière venue de data.js n'a pas de crayon, sinon mes mises à jour l'écraseraient.
function canEdit(){ return !!whoAmI(); }
function isOwn(x){ return !!(x && x._own); }
// Modifiable : tout sauf un chapitre venu d'une classe.
// Mes cours à moi le sont aussi désormais, sous forme de retouches.
function modifiable(ch){ return !!ch && !ch._shared && canEdit(); }
// Note la retouche pour que pushState l'enregistre.
function marquerRetouche(type){
  if(!curSubj || curSubj._own) return;
  curSubj._over = curSubj._over || {};
  if(!curSubj._over[type]){
    curSubj["_orig_" + type] = curSubj["_orig_" + type] ||
      (curSubj[type]||[]).filter(ch=>!ch._own && !ch._shared).map(ch=>JSON.parse(JSON.stringify(ch)));
    curSubj._over[type] = true;
  }
}
// Rétablit ma version d'origine pour un type de chapitres.
function retablirOriginal(type){
  if(!curSubj || !curSubj._over || !curSubj._over[type]) return;
  const gardes = (curSubj[type]||[]).filter(ch=>ch._own || ch._shared);
  curSubj[type] = (curSubj["_orig_" + type] || []).map(normChapitre).concat(gardes);
  delete curSubj._over[type];
  if(!Object.keys(curSubj._over).length) delete curSubj._over;
  if(type === "cm") curCmIdx = 0; else curTdIdx = 0;
  saveContent(); renderCoursePane(type);
  toast("Version d'origine rétablie.");
}
function semIsOwn(sem){
  const keys = Object.keys(UES).filter(k=>UES[k].sem === sem);
  return keys.length > 0 && keys.every(k=>!(k in DATA_UES));
}

// Enregistre et rafraîchit. pushState() renvoie UES + SUBJECTS au serveur.
function saveContent(){ scheduleSync(); }

// Formulaire générique.
// fields : [{ key, label, type:"text"|"number"|"area", placeholder, hint, value }]
let fsSubmit = null, fsDelete = null, fsExtra = null, fsDelArmed = false;
function openForm(title, fields, okLabel, onSubmit, onDelete, extra){
  const body = document.getElementById("fs-body");
  const del  = document.getElementById("fs-del");
  const ex   = document.getElementById("fs-extra");
  ex.hidden = !extra;
  if(extra) ex.textContent = extra.label;
  fsExtra = extra ? () => { closeForm(); extra.fn(); } : null;
  document.getElementById("fs-title").textContent = title;
  document.getElementById("fs-ok").textContent = okLabel || "Créer";
  document.getElementById("fs-ok").classList.remove("danger");
  document.getElementById("fs-err").textContent = "";
  // La suppression demande deux touches : la première arme, la seconde exécute.
  fsDelArmed = false;
  del.textContent = "Supprimer";
  del.hidden = !onDelete;
  fsDelete = onDelete ? () => {
    if(!fsDelArmed){
      fsDelArmed = true;
      del.textContent = "Confirmer ?";
      document.getElementById("fs-err").textContent = "Cette suppression est définitive.";
      return;
    }
    onDelete();
    closeForm();
  } : null;
  body.innerHTML = "";
  fields.forEach(f=>{
    const w = el("div","fs-field");
    const l = el("div","fs-label"); l.textContent = f.label; w.appendChild(l);
    let inp;
    if(f.type === "choice"){
      // rangée de boutons : plus lisible qu'un menu déroulant sur téléphone
      inp = el("input","fs-input");
      inp.type = "hidden";
      inp.value = f.value || (f.options[0] && f.options[0].v) || "";
      const row = el("div","fs-choice");
      f.options.forEach(o=>{
        const b = el("button","fs-opt" + (String(o.v) === String(inp.value) ? " on" : ""));
        b.type = "button"; b.textContent = o.label;
        b.addEventListener("click",()=>{
          inp.value = o.v;
          row.querySelectorAll(".fs-opt").forEach(x=>x.classList.remove("on"));
          b.classList.add("on");
        });
        row.appendChild(b);
      });
      w.appendChild(row);
      w.appendChild(inp);   // le champ caché doit être dans la page, sinon la valeur est perdue
    }else{
      inp = f.type === "area" ? el("textarea","fs-area") : el("input","fs-input");
      if(f.type !== "area") inp.type = f.type || "text";
      if(f.type === "number"){ inp.inputMode = "numeric"; }
      inp.placeholder = f.placeholder || "";
      inp.value = f.value || "";
      w.appendChild(inp);
    }
    inp.id = "fs-f-" + f.key;
    if(f.hint){ const h = el("div","fs-hint"); h.textContent = f.hint; w.appendChild(h); }
    body.appendChild(w);
  });
  fsSubmit = () => {
    const vals = {};
    fields.forEach(f=>{ vals[f.key] = (document.getElementById("fs-f-"+f.key).value || "").trim(); });
    const err = onSubmit(vals);          // une chaîne = message d'erreur, sinon on ferme
    if(err){ document.getElementById("fs-err").textContent = err; return; }
    closeForm();
  };
  document.getElementById("form-sheet").classList.add("open");
  setTimeout(()=>{ const first = body.querySelector("input,textarea"); if(first) first.focus(); }, 320);
}
// Une confirmation claire : un texte, « Annuler » et un seul bouton d'action.
function confirmer(titre, texte, action, fn, danger){
  openForm(titre, [], action, ()=>{ fn(); }, null);
  if(texte){
    const p = el("div","fs-hint");
    p.textContent = texte;
    p.style.cssText = "margin:2px 4px 6px;font-size:14px;line-height:1.55;text-align:center";
    document.getElementById("fs-body").appendChild(p);
  }
  if(danger !== false) document.getElementById("fs-ok").classList.add("danger");
}
function closeForm(){
  document.getElementById("form-sheet").classList.remove("open");
  fsSubmit = null; fsDelete = null; fsExtra = null; fsDelArmed = false;
}

// ── Mes calendriers ──
function reloadEDT(){
  try{ localStorage.removeItem(EDT_CACHE_KEY); }catch(e){}
  renderEDT();
  loadEDT(true).then(()=>{ renderEDT(); renderTodayCourses(); majTuileDevoirs(pendingAlerts(true, true)); });
}

function openCalSheet(){
  const list = document.getElementById("cal-list");
  list.innerHTML = "";
  const nb = planning().cours.length;
  const perso = el("button","cal-row");
  perso.type = "button";
  perso.innerHTML = `<div class="cal-txt"><div class="cal-name">Mon planning</div>
    <div class="cal-url">${nb ? nb + " créneau" + (nb>1?"x":"") + " saisis à la main" : "saisir mon emploi du temps à la main"}</div></div>
    <span class="cal-pen">${IC_PEN}</span>`;
  perso.addEventListener("click",()=>{ haptic(); closeCalSheet(); setTimeout(renderPlanning, 300); });
  list.appendChild(perso);
  const cals = edtCalendars();
  if(cals.length){
    const t = el("div","fs-hint cal-sep");
    t.textContent = "Calendriers importés";
    t.style.margin = "14px 4px 8px";
    list.appendChild(t);
  }
  cals.forEach(c=>{
    const row = el("button","cal-row");
    row.type = "button";
    row.innerHTML = `<div class="cal-txt"><div class="cal-name">${esc(c.label||"Calendrier")}</div>
      <div class="cal-url">${esc(c.url)}</div></div><span class="cal-pen">${IC_PEN}</span>`;
    row.addEventListener("click",()=>{ haptic(); editCalendar(c.id); });
    list.appendChild(row);
  });
  document.getElementById("cal-sheet").classList.add("open");
}
function closeCalSheet(){ document.getElementById("cal-sheet").classList.remove("open"); }

function editCalendar(id){
  const arr = edtCalendarsWritable();
  const i   = arr.findIndex(c=>c.id === id);
  const c   = i >= 0 ? arr[i] : null;
  closeCalSheet();
  openForm(c ? "Modifier le calendrier" : "Nouveau calendrier", [
    { key:"label", label:"Nom", value:c ? c.label : "",
      placeholder:"Cours, Langues, Stage…" },
    { key:"url", label:"Lien iCal", value:c ? c.url : "",
      placeholder:"https://…/calendar.ics",
      hint:"Sur l'ENT, cherche « exporter », « s'abonner » ou « iCal ». Le lien finit souvent par .ics." }
  ], "Enregistrer", v=>{
    if(!v.url) return "Colle le lien de ton calendrier.";
    if(!/^https?:\/\//i.test(v.url)) return "Le lien doit commencer par http.";
    if(arr.some((x,j)=>x.url === v.url && j !== i)) return "Ce calendrier est déjà dans la liste.";
    const label = v.label || "Calendrier";
    if(c){ c.label = label; c.url = v.url; }
    else  { arr.push({ id:newId(), label, url:v.url }); }
    saveContent();
    reloadEDT();
  }, c ? ()=>{
    arr.splice(i,1);
    saveContent();
    reloadEDT();
  } : null);
}

// ── Mes sites : raccourcis vers les sites utiles (fac, ENT, Eprel…) ──
// Une liste propre à chaque personne, enregistrée avec ses réglages.
// Toucher : ouvrir. Glisser vers la gauche : supprimer. Appui long : modifier.
function mesSites(){
  if(!Array.isArray(USER_SETTINGS.sites)){
    // première ouverture : je retrouve ma page de scolarité ; un autre compte part d'une liste vide
    USER_SETTINGS.sites = isCiva() ? [{ nom:"Scolarité", url:newsUrl() }] : [];
  }
  return USER_SETTINGS.sites;
}
function domaineDe(url){
  try{ return new URL(url).hostname.replace(/^www\./, ""); }catch(e){ return url; }
}
function normaliserUrl(u){
  u = (u || "").trim();
  if(u && !/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}
// Mes sites : une page entière, pour qu'on la retrouve en revenant d'un site
function openSitesSheet(){ renderSites(); showScreen("sites"); window.scrollTo(0, 0); }
function renderSites(){
  const box = document.getElementById("sites-liste"); if(!box) return;
  box.innerHTML = "";
  const sites = mesSites();
  if(!sites.length) box.innerHTML = vide("lien", "Aucun site pour l'instant", "Ajoute ceux où tu vas souvent : ENT, Moodle, scolarité, emploi du temps…");
  const grille = el("div","st-grille");
  const COUL = ["v","b","g","y","r"];
  sites.forEach((site,i)=>{
    const nom = site.nom || domaineDe(site.url);
    const t = el("button","st-tuile"); t.type = "button";
    const c = COUL[hmHash(nom) % COUL.length];
    const ini = nom.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").slice(0, 2) || "•";
    t.innerHTML = `<span class="st-ic hm-doux-${c}">${esc(ini.charAt(0).toUpperCase() + ini.slice(1).toLowerCase())}</span><b>${esc(nom)}</b><small>${esc(domaineDe(site.url))}</small><span class="st-plus" role="button" aria-label="Modifier ${esc(nom)}">•••</span>`;
    t.querySelector(".st-plus").addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); editSite(i); });
    t.addEventListener("click",()=>{ if(t._long) { t._long = false; return; } haptic(); window.open(site.url, "_blank", "noopener"); });
    onLongPress(t, ()=>{ t._long = true; editSite(i); });
    grille.appendChild(t);
  });
  const aj = el("button","st-tuile st-ajout"); aj.type = "button"; aj.innerHTML = `<span>+ Ajouter</span>`;
  aj.addEventListener("click",()=>{ haptic(); editSite(-1); });
  grille.appendChild(aj);
  box.appendChild(grille);
  if(sites.length){
    const h = el("div","fs-hint");
    h.textContent = "Touche ••• (ou appui long) pour modifier ou supprimer un site.";
    h.style.cssText = "margin:12px 4px 4px;text-align:center";
    box.appendChild(h);
  }
}
// i = -1 : nouveau site
function editSite(i){
  const sites = mesSites();
  const cur = i >= 0 ? sites[i] : { nom:"", url:"" };
  openForm(i >= 0 ? "Modifier le site" : "Ajouter un site", [
    { key:"nom", label:"Nom", value:cur.nom, placeholder:"Eprel, ENT, Scolarité…" },
    { key:"url", label:"Adresse", value:cur.url, placeholder:"https://…" }
  ], i >= 0 ? "Enregistrer" : "Ajouter", v=>{
    const url = normaliserUrl(v.url);
    if(!url) return "Il faut une adresse.";
    try{ new URL(url); }catch(e){ return "Cette adresse ne semble pas valide."; }
    const site = { nom:(v.nom || "").trim() || domaineDe(url), url };
    if(i >= 0) sites[i] = site; else sites.push(site);
    saveContent();
    renderSites();
  }, i >= 0 ? ()=>{
    sites.splice(i, 1);
    saveContent();
    renderSites();
  } : null);
}

// ── Lien de la page d'actualités ──

// Appui long : sert à ouvrir un réglage sans encombrer l'écran d'un bouton de plus.
function onLongPress(node, fn){
  let t = null, moved = false, declenche = false;
  const start = () => {
    moved = false; declenche = false;
    t = setTimeout(()=>{ if(!moved){ declenche = true; haptic(); fn(); } }, 500);
  };
  const stop  = () => { if(t) clearTimeout(t); t = null; };
  node.addEventListener("touchstart", start, { passive:true });
  node.addEventListener("touchmove", ()=>{ moved = true; stop(); }, { passive:true });
  node.addEventListener("touchend", stop);
  node.addEventListener("touchcancel", stop);
  // sans ça, l'appui long ouvrirait le panneau ET activerait le bouton en dessous
  node.addEventListener("click", e=>{
    if(declenche){ e.preventDefault(); e.stopPropagation(); declenche = false; }
  }, true);
  node.addEventListener("contextmenu", e=>e.preventDefault());
}

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
    // appui long : changer l'icône, comme pour les tuiles des semestres
    onLongPress(row, ()=>changerIconeClasse(c));
    box.appendChild(row);
  });
  majPastillesClasses();
  rafraichirNouveautesClasses();
}

// ── Icône d'une classe : chacun choisit la sienne, gardée dans ses réglages ──
// Une nouvelle classe reçoit la première icône pas encore prise par une autre.
const CLS_ICONES = ["📚","🎓","🧠","✏️","💡","🧭","🌱","🎯","🔬","🗂️","📐","🌍"];
function iconesClasses(){
  const m = USER_SETTINGS.clsIcones;
  return (m && typeof m === "object") ? m : {};
}
function iconeClasse(c){ return iconesClasses()[c.id] || CLS_ICONES[0]; }
function donnerIconesClasses(){
  const m = Object.assign({}, iconesClasses());
  let change = false;
  MY_CLASSES.forEach(c=>{
    if(m[c.id]) return;
    const prises = new Set(MY_CLASSES.map(x=>m[x.id]).filter(Boolean));
    m[c.id] = CLS_ICONES.find(e=>!prises.has(e)) || CLS_ICONES[0];
    change = true;
  });
  if(change){ USER_SETTINGS.clsIcones = m; saveContent(); }
}
function changerIconeClasse(c){
  openForm(c.name, [
    { key:"emoji", label:"Emoji", value:iconeClasse(c), placeholder:"Touche ici, puis choisis sur le clavier emoji",
      hint:"Seulement pour toi : les autres membres gardent la leur." }
  ], "Enregistrer", v=>{
    const tape = (v.emoji || "").trim();
    if(!tape) return "Choisis un emoji.";
    let e = "";
    try{ e = [...new Intl.Segmenter("fr", { granularity:"grapheme" }).segment(tape)][0].segment; }
    catch(err){ e = Array.from(tape).slice(0, 2).join(""); }
    USER_SETTINGS.clsIcones = Object.assign({}, iconesClasses(), { [c.id]:e });
    saveContent();
    const r = document.querySelector('#classes-list .cls-row[data-cls="' + c.id + '"] .cls-ic');
    if(r) r.textContent = e;
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
var BADGE_APP = { cls:0, dev:0, proj:0 };
function poserBadgeApp(){
  const n = BADGE_APP.cls + BADGE_APP.dev + BADGE_APP.proj;
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
        const cc = COUL[hmHash(mat) % COUL.length], ini = mat.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2);
        const sous = nv.length ? `<em class="cls-nv">✦ ${nv.length === 1 ? "1 nouveau" : nv.length + " nouveaux"}</em>` : tout ? `<i>✓ dans tes cours</i>` : "";
        ligne.innerHTML = `<span class="cls-l-ic hm-doux-${cc}">${esc(ini.charAt(0).toUpperCase() + ini.slice(1).toLowerCase())}</span><span class="cls-l-t"><b>${esc(mat)}</b><small>${esc(detail)}${detail && sous ? " · " : ""}${sous}${isSubFollowed(c.id, mat) && !suitC && !tout ? " · suivie" : ""}</small></span><span class="cls-l-ch">›</span>`;
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
function ouvrirMembres(c, membres, monRole){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = "Membres";
  const box = document.getElementById("pick-list");
  box.innerHTML = "";
  const gere = monRole === "owner" || monRole === "adjoint";
  const role = (cible, r)=>{ closePicker(); setTimeout(()=>setRole(c, cible, r), 250); };
  const attente = gere ? membres.filter(m=>m.role === "pending") : [];
  if(attente.length){
    const t = el("div","cls-kind"); t.textContent = "Demandes en attente"; box.appendChild(t);
    attente.forEach(m=>{
      const row = el("div","mem-row nouveau");
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
    const t = el("div","cls-kind"); t.textContent = "Dans la classe"; box.appendChild(t);
    const ordre = { owner:0, adjoint:1, membre:2 };
    dedans.slice().sort((a,b)=>(ordre[a.role] ?? 3) - (ordre[b.role] ?? 3) || String(a.pseudo).localeCompare(String(b.pseudo), "fr"))
      .forEach(m=>{
        const row = el("div","mem-row");
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
// l'emploi du temps vient d'arriver : on y pose les devoirs suivis
loadEDT = (orig => async function(force){ const r = await orig(force); try{ appliquerDevoirsSuivis(); }catch(e){} return r; })(loadEDT);

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
    tete.innerHTML = `<span class="av-lbl">Passés</span><span class="av-plier${ouvert ? " ouvert" : ""}">${IC_CHEV_BAS}</span>`;
    tete.addEventListener("click",()=>{
      haptic();
      try{ localStorage.setItem("revision_devoirs_passes", ouvert ? "0" : "1"); }catch(e){}
      openClass(c);
    });
    zonePasses.appendChild(tete);
    if(ouvert) lister(passes, zonePasses, true);
  }

  if(avenir.length){ const t = el("div","av-tete"); t.innerHTML = `<span class="av-lbl">À venir</span>`; box.appendChild(t); }
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
    lim.after(h);
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
const LEC_VITESSES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
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
  if(!LEC.actif || LEC.pause) return;
  if(LEC.i >= LEC.phrases.length){ lecteurStop(); toast("Lecture terminée."); return; }
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
function lecCal(){
  const v = LEC.voix;
  const k = v ? (v.voiceURI || v.name) : "defaut";
  return LEC_CAL[k] || (LEC_CAL[k] = { base:0, envoi:{} });
}
function lecVitesseCible(){ return (lecCal().base || LEC_CPS_DEFAUT) * LEC.vitesse; }
function lecTauxEnvoye(){
  const m = LEC.vitesse;
  // pour une voix jamais mesurée, la toute première phrase sert d'étalon, à vitesse normale
  if(m === 1 || !lecCal().base) return 1;
  const appris = lecCal().envoi[m];
  if(appris) return appris;
  // premier essai prudent, affiné dès la première phrase
  return m > 1 ? 1 + (m - 1) * 0.5 : m;
}
function lecMesurer(taux, nbCar, ms){
  if(ms < 600 || nbCar < 25) return;          // trop court pour être fiable
  const cps = nbCar / (ms / 1000);
  const c = lecCal();
  if(taux === 1 && (LEC.vitesse === 1 || !c.base)){
    c.base = c.base ? c.base * 0.7 + cps * 0.3 : cps;   // la vitesse normale de cette voix
  }else{
    const cible = (c.base || LEC_CPS_DEFAUT) * LEC.vitesse;
    const t = taux * Math.pow(cible / cps, 0.7);        // correction amortie
    c.envoi[LEC.vitesse] = Math.round(Math.max(0.1, Math.min(4, t)) * 1000) / 1000;
  }
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
  if(e.target.closest("a, button, input, textarea")) return;
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

function lecteurStart(root){
  if(!TTS_OK){ toast("La lecture à voix haute n'est pas disponible sur cet appareil."); return; }
  lecteurStop();
  const f = construireFile(root);
  if(!f.phrases.length){ toast(root.classList.contains("pdf-pages") ? "Pas de texte à lire dans ce document." : "Rien à lire dans ce chapitre."); return; }
  Object.assign(LEC, { phrases:f.phrases, blocs:f.blocs, racine:root, i:0, depuis:0,
                       actif:true, pause:false, blocCourant:-1, toucheA:0 });
  root.addEventListener("click", lecToucher, true);
  window.addEventListener("touchmove", lecDefilementManuel, { passive:true });
  window.addEventListener("wheel", lecDefilementManuel, { passive:true });
  lecBarre();
  document.body.classList.add("lec-on");
  lecDire();                                  // dans le geste : iOS l'exige pour le premier son
  lecGarderEcran();
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
  document.body.classList.remove("lec-on");
}
function lecPlayPause(){
  if(LEC.pause){ LEC.pause = false; LEC.toucheA = 0; lecMajBarre(); lecDire(); lecGarderEcran(); }
  else{ LEC.pause = true; lecCouper(); lecMajBarre(); lecLibererEcran(); }
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
function lecBarre(){
  if(LEC.bar) LEC.bar.remove();
  const bar = el("div","lec-bar");
  const b = (cls, html, label, fn)=>{
    const x = el("button","lec-btn " + cls);
    x.type = "button"; x.innerHTML = html; x.setAttribute("aria-label", label);
    x.addEventListener("click", e=>{ e.stopPropagation(); haptic(); fn(); });
    bar.appendChild(x); return x;
  };
  b("lec-voix", LEC_ICO.voix, "Choisir la voix", lecChoixVoix);
  const unite = lecEstPdf() ? "Page" : "Section";
  b("lec-prev", LEC_ICO.prev, unite + " précédente", ()=>lecAller(-1));
  b("lec-play", LEC_ICO.pause, "Pause", lecPlayPause);
  b("lec-next", LEC_ICO.next, unite + " suivante", ()=>lecAller(1));
  b("lec-speed", "", "Vitesse", lecVitesse);
  b("lec-close", LEC_ICO.close, "Arrêter la lecture", lecteurStop);
  document.body.appendChild(bar);
  LEC.bar = bar;
  lecMajBarre();
  requestAnimationFrame(()=>bar.classList.add("show"));
}
function lecMajBarre(){
  if(!LEC.bar) return;
  const p = LEC.bar.querySelector(".lec-play");
  p.innerHTML = LEC.pause ? LEC_ICO.play : LEC_ICO.pause;
  p.setAttribute("aria-label", LEC.pause ? "Reprendre" : "Pause");
  LEC.bar.querySelector(".lec-speed").textContent = String(LEC.vitesse).replace(".", ",") + "×";
}
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
  if(document.hidden && LEC.actif && !LEC.pause){ LEC.pause = true; lecCouper(); lecMajBarre(); lecLibererEcran(); }
});

// ══ PARTAGER UN CHAPITRE ══
// Le chapitre en texte propre, à coller dans Gemini, ChatGPT, Notes, un message…
function texteBrut(html){
  const d = document.createElement("div");
  d.innerHTML = String(html || "")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")    // liens écrits [texte](adresse)
    .replace(/<br\s*\/?>/gi, "\n");
  d.querySelectorAll("a[href]").forEach(a=>{ if(a.textContent !== a.href) a.textContent = a.textContent + " (" + a.href + ")"; });
  return d.textContent.replace(/[ \t]+\n/g, "\n").trim();
}
function texteChapitre(subj, type, ch, avecQcm){
  const l = [];
  l.push(subj.title + " · " + ch.label);
  l.push("");
  // le chapitre tel qu'il s'affiche : la version en clair quand elle existe
  const cl = ch.clair && (ch.clair.sections||[]).some(Boolean) ? ch.clair : null;
  if(cl && cl.minute){ l.push("## En 1 minute"); l.push(texteBrut(String(cl.minute).replace(/<\/p>/g, "</p>\n").replace(/<li>/g, "<li>• ").replace(/<\/li>/g, "</li>\n"))); l.push(""); }
  (ch.sections||[]).forEach((sec,si)=>{
    l.push("## " + texteBrut(sec.title));
    const cs = cl ? cl.sections[si] : null;
    if(cs){
      const t = typeof cs === "string" ? cs : (cs.b || cs.body || "");
      l.push(texteBrut(String(t).replace(/<\/p>/g, "</p>\n").replace(/<li>/g, "<li>• ").replace(/<\/li>/g, "</li>\n")));
      (cs.sig || cs.sigles || []).forEach(([a,b])=>l.push("• " + texteBrut(a) + " : " + texteBrut(b)));
      if(cs.mot) l.push("À retenir : " + texteBrut(cs.mot));
    } else {
      if(sec.body) l.push(texteBrut(sec.body));
      (sec.list||[]).forEach(x=>l.push("• " + texteBrut(x)));
    }
    l.push("");
  });
  if((ch.recap||[]).length){
    l.push("## À retenir");
    ch.recap.forEach((x,i)=>l.push((i+1) + ". " + texteBrut(x)));
    l.push("");
  }
  if(avecQcm){
    const qs = (subj.qcm||[]).filter(x=>x && !x._shared && x.ch === ch.label);
    if(qs.length){
      l.push("## QCM (" + qs.length + ")");
      qs.forEach((q,i)=>{
        l.push((i+1) + ". " + q.q);
        q.opts.forEach((o,k)=>l.push("   " + String.fromCharCode(65+k) + ") " + o + (k === q.c ? "   ← bonne réponse" : "")));
        if(q.e) l.push("   Explication : " + q.e);
      });
      l.push("");
    }
  }
  return l.join("\n").trim();
}
async function partagerTexte(titre, texte){
  if(navigator.share){
    try{ await navigator.share({ title:titre, text:texte }); return; }
    catch(e){ if(e && e.name === "AbortError") return; }      // partage annulé : rien à faire
  }
  try{ await navigator.clipboard.writeText(texte); toast("Copié. Colle-le où tu veux."); }
  catch(e){ toast("Impossible de partager depuis ce navigateur."); }
}
function boutonPartager(type, ch, icone){
  const b = el("button", icone ? "chap-share" : "lec-start partage");
  b.type = "button";
  const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/></svg>';
  b.innerHTML = icone ? svg : svg + '<span>Partager</span>';
  b.setAttribute("aria-label", "Partager ce chapitre");
  b.addEventListener("click",()=>{
    haptic();
    const sj = curSubj;
    const nQ = (sj.qcm||[]).filter(x=>x && !x._shared && x.ch === ch.label).length;
    if(!nQ){ partagerTexte(sj.title + " · " + ch.label, texteChapitre(sj, type, ch, false)); return; }
    openPicker("Partager « " + ch.label + " »", [
      { label:"Le cours", sub:"Les sections et « À retenir »", value:"cours" },
      { label:"Le cours et son QCM", sub:"Avec les bonnes réponses, pour le faire vérifier", value:"qcm" }
    ], v=>partagerTexte(sj.title + " · " + ch.label, texteChapitre(sj, type, ch, v === "qcm")));
  });
  return b;
}

// ── Le prof du CM ou du TD, avec son mail ──
// Lire un chapitre « en clair » ou « le cours » : un seul choix, gardé sur cet appareil.
// Les nombres et les % ne se coupent pas en fin de ligne : « 50 700 », « 12 % », « 6 € ».
// On ne touche qu'au texte, jamais à l'intérieur des balises.
function insec(html){
  return String(html || "").split(/(<[^>]*>)/).map(t=>t.startsWith("<") ? t :
    t.replace(/(\d) (?=\d{3}(?!\d))/g, "$1 ").replace(/ (?=[%€])/g, " ")).join("");
}
function modeLecture(v){
  if(v){ try{ localStorage.setItem("modeLecture", v); }catch(_){} return v; }
  let m = null; try{ m = localStorage.getItem("modeLecture"); }catch(_){}
  return m === "cours" ? "cours" : "clair";
}
// Rend les sections d'un chapitre dans n'importe quel conteneur.
function renderSectionsInto(box, ch){
  lecteurStop();
  if(TTS_OK && (ch.sections||[]).length) box.appendChild(lecteurBouton(box));
  (ch.sections||[]).forEach(sec=>{
    const block = el("div","section");
    const title = el("h2","section-title"); title.textContent = sec.title || "";
    const card  = el("div","card");
    if(sec.body){ const b = el("p","card-body"); b.innerHTML = texteCours(sec.body); card.appendChild(b); }
    if(sec.list && sec.list.length){
      const ul = el("ul","card-list");
      sec.list.forEach(x=>{ const li = el("li"); li.innerHTML = `<span class="li-text">${texteCours(x)}</span>`; ul.appendChild(li); });
      card.appendChild(ul);
    }
    block.appendChild(title); block.appendChild(card);
    box.appendChild(block);
  });
  if(ch.recap && ch.recap.length){
    const r = el("div","recap");
    r.innerHTML = `<div class="recap-label">À retenir</div>` +
      ch.recap.map((x,i)=>`<div class="recap-item"><span class="recap-num">${i+1}</span><span>${esc(x)}</span></div>`).join("");
    box.appendChild(r);
  }
}

// Résultats venus des classes. Ajoutés sous les résultats locaux, en asynchrone.
let sharedSearchSeq = 0;
function searchShared(q, box){
  const seq = ++sharedSearchSeq;
  api("search_shared", { q }).then(out=>{
    if(seq !== sharedSearchSeq) return;          // une frappe plus récente a pris la main
    const items = out.items || [];
    document.querySelectorAll(".shared-results").forEach(n=>n.remove());
    if(!items.length) return;
    const wrap = el("div","shared-results");
    const h = el("div","res-group");
    h.textContent = "Dans mes classes  ·  " + items.length;
    wrap.appendChild(h);
    items.forEach(it=>{
      const row = el("button","cal-row");
      row.type = "button";
      row.innerHTML = `<div class="cal-txt"><div class="cal-name">${esc(it.label)}</div>
        <div class="cal-url">${esc(it.subject_title)} · ${esc(KIND_LABEL[it.kind]||it.kind)} · ${esc(it.author)}</div></div>`;
      row.addEventListener("click",()=>{ haptic(); openSharedItem(it); });
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  }).catch(()=>{});
}

// ── Suivre un chapitre partagé : on garde son identifiant, pas une copie ──
function follows(){
  if(!Array.isArray(USER_SETTINGS.follows)) USER_SETTINGS.follows = [];
  return USER_SETTINGS.follows;
}
function isFollowed(itemId){ return follows().some(f=>f.item_id === itemId); }
function isSubFollowed(classId, subjectTitle){
  return follows().some(f=>f.type === "subject" && f.class_id === classId && f.subject_title === subjectTitle);
}
// Un chapitre peut arriver chez toi sans être suivi individuellement :
// par « Tout suivre » sur sa matière. Il faut alors pouvoir agir sur la matière.
function subFollowOf(it){
  return follows().find(f=>f.type === "subject" && f.class_id === it.class_id
                        && f.subject_title === it.subject_title) || null;
}

// Suivre toute une matière : les chapitres publiés plus tard arrivent tout seuls.
function followSubject(c, subjectTitle, itemId){
  const source = { title:subjectTitle, itemId };
  if(isSubFollowed(c.id, subjectTitle)){
    const f = follows().find(x=>x.type === "subject" && x.class_id === c.id && x.subject_title === subjectTitle);
    const sj = f && SUBJECTS.find(x=>x.id === f.subject_id);
    openPicker(subjectTitle, [
      { label:"La ranger ailleurs", sub:sj ? "actuellement dans « " + sj.title + " »" : "", value:"move" },
      { label:"Ne plus suivre", sub:"ses chapitres quittent tes cours", value:"off" }
    ], v=>{
      if(v === "off"){
        USER_SETTINGS.follows = follows().filter(x=>
          !(x.type === "subject" && x.class_id === c.id && x.subject_title === subjectTitle));
        saveContent();
        syncFollows().then(()=>{ toast("Matière retirée."); openClass(c); });
      }else{
        setTimeout(()=>pickMatiere("La ranger dans quelle matière ?", subjId=>{
          f.subject_id = subjId;
          saveContent(); injectFollowed();
          toast("Déplacée."); openClass(c);
        }, source), 320);
      }
    });
    return;
  }
  pickMatiere("La ranger dans quelle matière ?", subjId=>{
    follows().push({ type:"subject", class_id:c.id, subject_title:subjectTitle, subject_id:subjId });
    saveContent();
    syncFollows().then(()=>{
      toast("Matière suivie. Les nouveaux chapitres arriveront seuls.");
      openClass(c);
    });
  }, source);
}

// Le nom de la matière où un chapitre suivi est rangé.
function matiereDeSuivi(itemId){
  const f = follows().find(x=>x.item_id === itemId);
  if(!f) return null;
  const sj = SUBJECTS.find(x=>x.id === f.subject_id);
  return sj ? sj.title : null;
}

// source = { title, itemId } : la matière d'origine, dans la classe.
// Si je n'ai pas de matière de ce nom, on propose de la créer telle quelle
// (même nom, même UE, même ECUE, même semestre), en un seul geste.
const sansAccents = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\u2019\u2018`\u00b4]/g, "'").replace(/\s+/g, " ").toLowerCase().trim();
async function metaDistante(itemId){
  if(!itemId) return null;
  let pl = SHARED_CACHE[itemId];
  if(!pl || !pl.meta){
    try{
      const out = await api("items_fetch", { ids:[itemId] });
      pl = (out.items || [])[0]?.payload;
      if(pl) SHARED_CACHE[itemId] = pl;
    }catch(e){}
  }
  return (pl && pl.meta) || null;
}
// Si la publication ne porte pas l'UE et l'ECUE (publiée avant qu'on les ajoute),
// on les retrouve dans le programme de référence, par le nom de la matière.
function metaDepuisDonnees(titre){
  const d = (typeof DATA_SUBJECTS !== "undefined" ? DATA_SUBJECTS : [])
    .find(x=>sansAccents(x.title) === sansAccents(titre));
  if(!d) return null;
  const u = DATA_UES[d.ue] || {};
  return { ecue:d.ecue || "", ue_num:String(u.num || ""), ue_title:u.title || "", sem:u.sem || null };
}
function creerMatiereDepuis(titre, meta){
  const sems = Object.values(UES).map(u=>u.sem).filter(Boolean);
  const sem = (meta && meta.sem) || curSemestre || (sems.length ? Math.min(...sems) : 1);
  const ueKey = trouverOuCreerUE(sem, meta ? meta.ue_title : "", meta ? meta.ue_num : "");
  const id = newId();
  SUBJECTS.push({ id, ue:ueKey, ects:0, ecue:(meta && meta.ecue) || "", title:titre, _own:true,
                  cm:[], td:[], fc:[], qcm:[], oq:[], tr:[], dev:[], auteurs:[] });
  SEMESTRES[id] = sem;
  saveContent();
  return id;
}
async function pickMatiere(titre, onPick, source){
  const cibles = SUBJECTS.slice()
    .sort((a,b)=>a.title.localeCompare(b.title, "fr", { sensitivity:"base" }))
    .map(s=>({ label:s.title, sub:(UES[s.ue] && UES[s.ue].title) || "", value:s.id }));
  let meta = null;
  if(source && source.title){
    const k = cibles.findIndex(c=>sansAccents(c.label) === sansAccents(source.title));
    if(k >= 0){
      // j'ai déjà une matière de ce nom : on la met en tête
      const m = cibles.splice(k, 1)[0];
      m.sub = "même nom que dans la classe";
      m.accent = true;
      cibles.unshift(m);
    }else{
      meta = (await metaDistante(source.itemId)) || metaDepuisDonnees(source.title);
      const bouts = [];
      if(meta && meta.ue_num) bouts.push("UE " + meta.ue_num);
      if(meta && meta.ecue)   bouts.push("ECUE " + meta.ecue);
      if(meta && meta.sem)    bouts.push("semestre " + meta.sem);
      cibles.unshift({ label:"+  Créer « " + source.title + " »",
        sub: bouts.length ? bouts.join(" · ") : "une nouvelle matière, avec ce nom",
        value:"__creer__", accent:true });
    }
  }
  if(!cibles.length){ toast("Crée d'abord une matière où le ranger."); return; }
  openPicker(titre, cibles, v=>{
    if(v === "__creer__"){
      const id = creerMatiereDepuis(source.title, meta);
      toast("Matière « " + source.title + " » créée.");
      onPick(id);
    }else onPick(v);
  });
}

// Déplacer un chapitre suivi vers une autre matière.
function moveFollow(it){
  pickMatiere("Le ranger dans quelle matière ?", subjId=>{
    const f = follows().find(x=>x.item_id === it.id);
    if(!f) return;
    f.subject_id = subjId;
    saveContent();
    injectFollowed();
    toast("Déplacé.");
    openSharedItem(it);
  }, { title:it.subject_title, itemId:it.id });
}

function followItem(it){
  pickMatiere("Le ranger dans quelle matière ?", subjId=>{
    follows().push({ item_id:it.id, subject_id:subjId, kind:it.kind, label:it.label });
    saveContent();
    syncFollows().then(()=>{
      toast("Ajouté. Il suivra les corrections de l'auteur.");
      const sj = SUBJECTS.find(x=>x.id === subjId);
      if(sj) openSubject(subjId);
    });
  }, { title:it.subject_title, itemId:it.id });
}

function unfollowItem(itemId){
  const arr = follows();
  const i = arr.findIndex(f=>f.item_id === itemId);
  if(i >= 0) arr.splice(i,1);
  delete SHARED_CACHE[itemId];
  saveContent();
  injectFollowed();
}

// Va chercher la version à jour de tous les chapitres suivis, puis les injecte.
async function syncFollows(){
  const arr  = follows();
  const ids  = arr.filter(f=>f.type !== "subject").map(f=>f.item_id);
  const subs = arr.filter(f=>f.type === "subject")
                  .map(f=>({ class_id:f.class_id, subject_title:f.subject_title }));
  SUB_ITEMS = {};
  if(!ids.length && !subs.length){ injectFollowed(); return; }
  try{
    const out = await api("items_fetch", { ids, subs });
    const vus = new Set();
    (out.items||[]).forEach(it=>{
      SHARED_CACHE[it.id] = it.payload;
      vus.add(it.id);
      const k = it.class_id + "|" + it.subject_title;
      (SUB_ITEMS[k] ||= []).push(it);
    });
    // un chapitre retiré de sa classe, ou une classe quittée : on ne le garde pas.
    // Les matières suivies restent, même vides : de nouveaux chapitres peuvent arriver.
    USER_SETTINGS.follows = arr.filter(f=>f.type === "subject" || vus.has(f.item_id));
  }catch(e){}
  injectFollowed();
}

// Les chapitres suivis apparaissent dans la matière choisie, en lecture seule.
function injectFollowed(){
  SUBJECTS.forEach(sj=>{
    ["cm","td","fc","qcm","oq","auteurs","dev","tr"].forEach(champ=>{
      sj[champ] = (sj[champ]||[]).filter(x=>!x._shared);
    });
  });
  const poser = (sj, kind, itemId, payload, secours)=>{
    if(!sj || !payload) return;
    if(kind === "revision"){
      // les cartes portent une clé calculée sur leur question, pas sur leur rang :
      // les ajouter ne perturbe donc pas la progression existante
      ["fc","qcm","oq","auteurs","dev","tr"].forEach(champ=>{
        (payload[champ]||[]).forEach(x=>{
          sj[champ] = sj[champ] || [];
          sj[champ].push(Object.assign({}, x, { _shared:true, _itemId:itemId }));
        });
      });
      return;
    }
    const ch = Object.assign({}, payload, {
      _shared:true, _itemId:itemId,
      label: payload.label || secours || "Partagé"
    });
    (kind === "cm" ? sj.cm : sj.td).push(ch);
  };
  follows().forEach(f=>{
    const sj = SUBJECTS.find(x=>x.id === f.subject_id);
    if(f.type === "subject"){
      (SUB_ITEMS[f.class_id + "|" + f.subject_title] || [])
        .filter(it=>it.author !== whoAmI())          // les miens sont déjà dans mes cours
        .forEach(it=>poser(sj, it.kind, it.id, it.payload, it.label));
    }else{
      poser(sj, f.kind, f.item_id, SHARED_CACHE[f.item_id], f.label);
    }
  });
  const scr = document.documentElement.getAttribute("data-screen");
  if(scr === "split"){
    if(curTab === 2) renderTrainPane();
    else { renderCoursePane("cm"); renderCoursePane("td"); }
  }
  SEARCH_INDEX = null;   // le contenu a changé : l'index de recherche est périmé
}

// ── Publier un de mes chapitres dans une classe ──
function publishChapitre(type, ch, subjectTitle){
  const ok = MY_CLASSES.filter(c=>c.role === "owner" || c.role === "adjoint");
  const go = list=>{
    if(!list.length){ toast("Tu ne peux publier dans aucune classe."); return; }
    openPicker("Publier dans quelle classe ?",
      list.map(c=>({ label:c.name, sub:c.role === "owner" ? "créateur" : "adjoint", value:c.id })),
      classId=>{
        const payload = { label:ch.label, sections:ch.sections||[], recap:ch.recap||[],
          meta: metaMatiere(SUBJECTS.find(x=>x.title === subjectTitle) || curSubj) };
        publierOuMettreAJour(classId, type === "cm" ? "cm" : "td", subjectTitle, payload)
          .then(r=>toast(r === "maj" ? "Mis à jour." : "Publié."))
          .catch(()=>toast("Publication refusée."));
      });
  };
  // la liste des classes peut ne pas encore avoir été chargée
  if(MY_CLASSES.length) go(ok);
  else api("class_list").then(out=>{
    MY_CLASSES = out.classes || [];
    go(MY_CLASSES.filter(c=>c.role === "owner" || c.role === "adjoint"));
  }).catch(()=>toast("Impossible de charger tes classes."));
}

// ══ Crayon d'édition ══
// Renvoie un petit bouton crayon, ou null si le compte n'édite pas.
const IC_PEN  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/>
  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const IC_DOTS = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/>
  <circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>`;

function penBtn(label, onClick, inline){
  if(!canEdit()) return null;
  const b = el("button", "pen" + (inline ? " pen-inline" : ""));
  b.type = "button";
  // trois points dans le coin d'une tuile, crayon quand le bouton est posé en ligne
  b.innerHTML = inline ? IC_PEN : IC_DOTS;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", e=>{ e.stopPropagation(); haptic(); onClick(); });
  return b;
}
// Enveloppe une tuile pour pouvoir poser le crayon dans son coin.
function withPen(card, label, onClick){
  const pen = penBtn(label, onClick);
  if(!pen) return card;
  const w = el("div","edit-wrap");
  w.appendChild(card); w.appendChild(pen);
  return w;
}

// ── Modifier ou supprimer un semestre ──
function editSemestre(sem){
  openForm(titreSemestre(sem), [
    { key:"num", label:"Numéro du semestre", type:"number", value:String(sem) }
  ], "Enregistrer", v=>{
    const n = parseInt(v.num, 10);
    if(!n || n < 1 || n > 12) return "Entre un numéro entre 1 et 12.";
    if(n !== sem && Object.values(UES).some(u=>u.sem === n)) return "Ce semestre existe déjà.";
    Object.keys(UES).forEach(k=>{ if(UES[k].sem === sem){ UES[k].sem = n; UES[k].num = String(n); } });
    SUBJECTS.forEach(x=>{ if(SEMESTRES[x.id] === sem) SEMESTRES[x.id] = n; });
    curSemestre = n;
    saveContent(); renderSemestres();
  }, ()=>{
    // supprimer un semestre emporte ses UE et toutes ses matières
    const ueKeys = Object.keys(UES).filter(k=>UES[k].sem === sem);
    ueKeys.forEach(k=>delete UES[k]);
    for(let i = SUBJECTS.length - 1; i >= 0; i--){
      if(ueKeys.includes(SUBJECTS[i].ue)){ delete SEMESTRES[SUBJECTS[i].id]; SUBJECTS.splice(i,1); }
    }
    saveContent(); renderSemestres();
  });
}

function confirmerSuppressionMatiere(sub){
  const sem = SEMESTRES[sub.id];
  confirmer("Supprimer « " + sub.title + " » ?",
    "La matière et tout son contenu seront supprimés. C'est définitif.",
    "Supprimer", ()=>{
    const i = SUBJECTS.findIndex(x=>x.id === sub.id);
    if(i >= 0) SUBJECTS.splice(i,1);
    delete SEMESTRES[sub.id];
    saveContent(); renderSubjectCards(sem); renderSemestres();
  });
}

// ── Modifier ou supprimer une matière ──
function editMatiere(sub){
  const sem = SEMESTRES[sub.id];
  openForm("Modifier la matière", [
    { key:"title", label:"Nom de la matière", value:sub.title },
    { key:"ecue",  label:"Code (facultatif)", value:sub.ecue || "" },
    { key:"uenum", label:"Numéro de l'UE", value:(UES[sub.ue] && UES[sub.ue].num) || "",
      placeholder:"19" },
    { key:"ue",    label:"Nom de l'UE", value:(UES[sub.ue] && UES[sub.ue].title) || "",
      hint:"Le numéro et le nom valent pour toutes les matières de cette UE. Les UE se rangent par numéro croissant." }
  ], "Enregistrer", v=>{
    if(!v.title) return "Donne un nom à la matière.";
    sub.title = v.title;
    sub.ecue  = v.ecue;
    const actuelle = UES[sub.ue] || {};
    const change = (v.ue && v.ue !== actuelle.title) || (v.uenum && v.uenum !== String(actuelle.num));
    if(change){
      const seule = SUBJECTS.filter(x=>x.ue === sub.ue).length <= 1;
      if(seule && !(sub.ue in DATA_UES)){
        // cette matière est la seule de son UE : on renomme sur place
        if(v.ue)    UES[sub.ue].title = v.ue;
        if(v.uenum) UES[sub.ue].num   = v.uenum;
      }else{
        // d'autres matières partagent cette UE : on déplace celle-ci ailleurs
        sub.ue = trouverOuCreerUE(sem, v.ue || actuelle.title, v.uenum || String(actuelle.num));
      }
    }
    fusionnerUEsDoublons();
    nettoyerUEsVides();
    saveContent(); renderSubjectCards(sem); renderSemestres();
  }, ()=>{
    const i = SUBJECTS.findIndex(x=>x.id === sub.id);
    if(i >= 0) SUBJECTS.splice(i,1);
    delete SEMESTRES[sub.id];
    saveContent(); renderSubjectCards(sem); renderSemestres();
  });
}

// ── Modifier ou supprimer un chapitre ──
function editChapitre(type, idx){
  const arr = type === "cm" ? curSubj.cm : curSubj.td;
  const ch = arr[idx];
  openForm("Modifier le chapitre", [
    { key:"label", label:"Nom du chapitre", value:ch.label || "" }
  ], "Enregistrer", v=>{
    if(!v.label) return "Donne un nom au chapitre.";
    ch.label = v.label;
    marquerRetouche(type);
    saveContent(); renderCoursePane(type);
  }, ()=>{
    marquerRetouche(type);
    arr.splice(idx,1);
    const ni = Math.max(0, Math.min(idx, arr.length - 1));
    if(type === "cm") curCmIdx = ni; else curTdIdx = ni;
    saveContent(); renderCoursePane(type);
  }, { label:"Publier", fn:()=>publishChapitre(type, ch, curSubj.title) });
}

// ── Modifier ou supprimer une section ──
function editSection(type, ch, idx){
  const sec = ch.sections[idx];
  openForm("Modifier la section", [
    { key:"title", label:"Titre", value:sec.title || "" },
    { key:"body",  label:"Texte", type:"area", value:sec.body || "",
      hint:"Colle une adresse, elle devient cliquable. Pour un lien nommé : [le texte de Marcel](https://…)" },
    { key:"list",  label:"Puces (facultatif)", type:"area",
      value:(sec.list || []).join("\n"), hint:"Chaque ligne devient une puce." }
  ], "Enregistrer", v=>{
    if(!v.title && !v.body) return "Il faut au moins un titre ou un texte.";
    sec.title = v.title || "";
    if(v.body) sec.body = v.body; else delete sec.body;
    const puces = v.list.split("\n").map(x=>x.trim()).filter(Boolean);
    if(puces.length) sec.list = puces; else delete sec.list;
    marquerRetouche(type);
    saveContent(); renderCoursePane(type);
  }, ()=>{
    ch.sections.splice(idx,1);
    marquerRetouche(type);
    saveContent(); renderCoursePane(type);
  });
}

function newId(){ return "u" + Date.now().toString(36) + Math.floor(Math.random()*999).toString(36); }

// ── Créer un semestre ──
// Un semestre a besoin d'au moins une UE pour accueillir des matières :
// on en crée une par défaut, renommable plus tard.
function addSemestre(){
  // le prochain numéro libre, déjà écrit : on n'a plus qu'à toucher « Créer »
  const pris = Object.values(UES).map(u=>u.sem).filter(Boolean);
  let prochain = pris.length ? Math.floor(Math.max(...pris)) + 1 : 1;
  if(prochain > 12) prochain = [...Array(12)].map((_,i)=>i + 1).find(k=>!pris.includes(k)) || 12;
  openForm("Nouveau semestre", [
    { key:"num", label:"Numéro du semestre", type:"number", value:String(prochain), hint:"Le semestre 5, c'est le premier de la L3." }
  ], "Créer", v=>{
    const n = parseInt(v.num, 10);
    if(!n || n < 1 || n > 12) return "Entre un numéro entre 1 et 12.";
    if(Object.values(UES).some(u=>u.sem === n)) return "Ce semestre existe déjà.";
    UES["ue_s" + n] = { num:String(n), sem:n, title:"Mes matières" };
    saveContent();
    renderSemestres();
  });
}

// Retrouve l'UE qui correspond exactement, ou en fabrique une nouvelle.
// Attraper « une UE du semestre » au hasard revenait à fusionner des UE distinctes.
function trouverOuCreerUE(sem, titre, num){
  const t = (titre || "").trim();
  const n = (num || "").trim();
  const memes = k => UES[k].sem === sem;
  let cle = null;
  // dans un semestre, le numéro identifie l'UE : même numéro, même UE.
  // Le titre n'est qu'une étiquette, il se met à jour au passage.
  if(n)           cle = Object.keys(UES).find(k=>memes(k) && String(UES[k].num) === n);
  else if(t)      cle = Object.keys(UES).find(k=>memes(k) && UES[k].title === t);
  else            cle = Object.keys(UES).find(k=>memes(k) && UES[k].title === "Mes matières" && String(UES[k].num) === String(sem));
  if(cle){
    if(t && !(cle in DATA_UES)) UES[cle].title = t;
    return cle;
  }
  const neuve = "ue_" + newId();
  UES[neuve] = { num: n || String(sem), sem, title: t || "Mes matières" };
  return neuve;
}

// Deux UE de même semestre et même numéro sont en réalité la même :
// on rapatrie leurs matières sur la première et on efface les doublons.
function fusionnerUEsDoublons(){
  const parNum = {};
  Object.keys(UES).forEach(k=>{
    const cle = UES[k].sem + "#" + String(UES[k].num);
    (parNum[cle] ||= []).push(k);
  });
  let bouge = false;
  Object.values(parNum).forEach(cles=>{
    if(cles.length < 2) return;
    // on garde la mienne si elle est dans le lot, sinon la première venue
    const garde = cles.find(k=>k in DATA_UES) || cles[0];
    cles.forEach(k=>{
      if(k === garde || k in DATA_UES) return;
      SUBJECTS.forEach(sub=>{ if(sub.ue === k){ sub.ue = garde; bouge = true; } });
      delete UES[k];
      bouge = true;
    });
  });
  return bouge;
}

// Une UE que plus aucune matière n'utilise n'a pas à rester dans la liste.
function nettoyerUEsVides(){
  Object.keys(UES).forEach(k=>{
    if(k in DATA_UES) return;                       // les miennes ne bougent pas
    if(!SUBJECTS.some(s=>s.ue === k)) delete UES[k];
  });
}

// ── Créer une matière dans le semestre affiché ──
function addMatiere(){
  const sem = curSemestre;
  if(!sem) return;
  openForm("Nouvelle matière", [
    { key:"title", label:"Nom de la matière", placeholder:"Sociologie de l'éducation" },
    { key:"ecue",  label:"Code (facultatif)", placeholder:"Ex. 5.2",
      hint:"Le code de la matière sur ton relevé de notes." },
    { key:"ue",    label:"UE (facultatif)", placeholder:"Ex. Sciences sociales",
      hint:"L'unité d'enseignement. Laisse vide pour ranger la matière avec les autres." },
    { key:"uenum", label:"Numéro de l'UE (facultatif)", placeholder:"Ex. 2",
      hint:"Sert à ranger les UE dans l'ordre." }
  ], "Créer", v=>{
    if(!v.title) return "Donne un nom à la matière.";
    const ueKey = trouverOuCreerUE(sem, v.ue, v.uenum);
    const id = newId();
    SUBJECTS.push({ id, ue:ueKey, ects:0, ecue:v.ecue || "", title:v.title, _own:true,
                    cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] });
    SEMESTRES[id] = sem;
    saveContent();
    renderSubjectCards(sem);
    renderSemestres();
  });
}

// ── Créer un chapitre (CM, TD, Devoir… le nom est libre) ──
function addChapitre(type){
  if(!curSubj) return;
  const n = ((type === "cm" ? curSubj.cm : curSubj.td) || []).length + 1;
  openForm("Nouveau chapitre", [
    { key:"label", label:"Nom du chapitre", placeholder: (type === "cm" ? "CM " : "TD ") + n + " · 12/09",
      hint:"Mets la date : tu verras d'un coup d'œil ce qui manque. Un nom qui commence par TD va dans les TD, par CM dans les CM." }
  ], "Créer", v=>{
    if(!v.label) return "Donne un nom au chapitre.";
    // le nom décide : « TD 3 » écrit depuis les CM part dans les TD
    const dest = /^\s*td\b/i.test(v.label) ? "td" : /^\s*cm\b/i.test(v.label) ? "cm" : type;
    if(!curSubj[dest]) curSubj[dest] = [];
    const arr = curSubj[dest];
    arr.push({ label:v.label, sections:[], recap:[], _own:true });
    if(dest === "cm") curCmIdx = arr.length - 1; else curTdIdx = arr.length - 1;
    saveContent();
    if(dest !== type){ setTab(dest === "cm" ? 0 : 1); toast("Rangé dans les " + dest.toUpperCase() + "."); }
    else renderCoursePane(dest);
  });
}

// ══════════════════════════════════════════════════
// COLLER UN COURS : un texte brut (Word, PDF, Notes, Google Docs…)
// découpé en sections { title, body, list }, comme les cours écrits à la main.
// Rien n'est inventé : on range le texte tel quel, on ne réécrit rien.
// ══════════════════════════════════════════════════
const COLLE_PUCE = /^\s*(?:[-=]+>|[-–—•●◦▪▫■□➢➤→►*·✓✔]|o(?=\s)|\d{1,2}[.)](?=\s)|[a-z][.)](?=\s))\s*(.*)$/;
const COLLE_NUM_TITRE = /^\s*((?:[IVX]{1,5}|[A-H])\s*[.)\-–—:]|\d{1,2}(?:\.\d{1,2}){1,3}\s*[.)\-–—:]?|\d{1,2}\s*[.)\-–—:])\s+(\S.*)$/;
const COLLE_MOT_TITRE = /^(introduction|conclusion|bibliographie|r[ée]f[ée]rences|plan( du cours)?|r[ée]sum[ée]|synth[èe]se|d[ée]finitions?|vocabulaire|lexique|[àa] retenir|partie\s+\S+|chapitre\s+\S+|th[èe]me\s+\S+|levier\s+\S+|axe\s+\S+|texte\s+\d+|exercice\s+\d+|question\s+\d+|s[ée]ance\s+\d+|cours\s+\d+|(cm|td)\s*\d+)\b/i;
const COLLE_FIN_PHRASE = /[.!?…:;]\s*$/;
const COLLE_FIN_TITRE = /[.!…:;,]\s*$/;
const COLLE_MOT_VIDE = /(^|\s)(ne|de|du|des|la|le|les|l'|d'|un|une|et|ou|à|au|aux|en|que|qui|pour|par|sur|dans|avec|est|sont|son|sa|ses|leur|leurs|ce|cette|ces)$/i;
const COLLE_PAGE = /^\s*(page\s*)?\d{1,3}(\s*(\/|sur)\s*\d{1,3})?\s*$/i;

function colleNettoyer(t){
  return String(t || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\t+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .split("\n").map(l=>l.trim());
}
// « Terme : définition » (ou « Terme (précision) : … », « Terme = … ») sur une ligne
function colleDefinition(l){
  if(/https?:|www\./i.test(l)) return null;
  const m = l.match(/^([^:=]{2,60}?)\s*(\([^)]{1,60}\))?\s*(?::|\s=\s)\s*(.{8,})$/);
  if(!m) return null;
  const terme = m[1].trim();
  if(terme.split(/\s+/).length > 6 || /[.!?;]/.test(terme) || !/^[A-Za-zÀ-ÿ]/.test(terme)) return null;
  if(typeof LEX_TERME_EXCLU !== "undefined" && LEX_TERME_EXCLU.test(terme)) return null;
  return { terme, prec:(m[2] || "").trim(), def:m[3].trim() };
}
function colleMajuscules(l){
  const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return lettres.length >= 4 && lettres === lettres.toUpperCase() && /[A-ZÀ-Þ]/.test(lettres);
}
// une ligne peut-elle être un titre ? (on vérifie ensuite qu'il a bien du contenu)
function colleTitre(l, avant, apres, pasTitre){
  const forcé = l.match(/^#{1,6}\s*(.+)$/);
  if(forcé) return { titre:forcé[1].trim(), sur:true };
  if(pasTitre && pasTitre.has(l)) return null;
  if(l.length > 90 || /[.,;]$/.test(l)) return null;
  // ce qui suit montre que la ligne annonce quelque chose : une phrase, une liste, une ligne plus longue
  const apresOK = !!apres && (apres.length > l.length || /[.!?…:]$/.test(apres) || COLLE_PUCE.test(apres));
  const avantOK = !avant || COLLE_FIN_PHRASE.test(avant) || COLLE_PUCE.test(avant) || /[)»"”]$/.test(avant);
  // une puce (tiret, rond…) n'est jamais un titre ; « 1. » ou « A. » peut l'être
  if(/^\s*(?:[-=]+>|[-–—•●◦▪▫■□➢➤→►*·✓✔]|o\s)/.test(l)) return null;
  const n = l.match(COLLE_NUM_TITRE);
  if(n && n[2].length <= 80 && !/[.;,:]$/.test(n[2]) && !/\.\s/.test(n[2]) && /^[A-ZÀ-Þ«"“]/.test(n[2])) return { titre:l, num:true };
  if(COLLE_MOT_TITRE.test(l) && l.length <= 90) return { titre:l.replace(/\s*:\s*$/, ""), sur:true };
  // la ligne suivante continue la phrase : ce n'est pas un titre
  if(apres && /^[a-zà-ÿ]/.test(apres) && !colleMajuscules(l)) return null;
  const d = colleDefinition(l);
  // « Klein : deux positions » est un titre ; « Habitus : système de dispositions… » une définition
  if(d && !(l.length <= 70 && d.def.length <= 45 && !COLLE_FIN_TITRE.test(l) && avantOK && apresOK && apres.length > l.length)) return null;
  if(/:$/.test(l)) return null;                          // « Les trois formes : » annonce une liste
  if(colleMajuscules(l) && l.length <= 80) return { titre:l };
  // une ligne courte, isolée, qui commence par une majuscule et ne finit pas une phrase
  const coeur = l.replace(/^[^\p{L}\p{N}«"“]+/u, "");
  if(coeur.length <= 72 && coeur.split(/\s+/).length <= 11 && /^[A-ZÀ-Þ«"“0-9]/.test(coeur) && !COLLE_FIN_TITRE.test(l) && !COLLE_MOT_VIDE.test(l) && avantOK && apresOK)
    return { titre:l };
  return null;
}
function colleDecouper(texte, pasTitre){
  let lignes = colleNettoyer(texte);
  // en-têtes et pieds de page répétés (PDF), numéros de page : on les enlève
  const vus = {};
  lignes.forEach(l=>{ if(l && l.length <= 60) vus[l] = (vus[l] || 0) + 1; });
  lignes = lignes.filter(l=>!(l && ((vus[l] >= 3 && !COLLE_PUCE.test(l)) || COLLE_PAGE.test(l))));

  // 1. on étiquette chaque ligne : vide, titre, puce, définition, texte
  const items = [];
  const prochaine = i=>{ for(let k = i + 1; k < lignes.length; k++) if(lignes[k]) return lignes[k]; return ""; };
  lignes.forEach((l,i)=>{
    if(!l){ items.push({ t:"vide" }); return; }
    const avant = i > 0 ? lignes[i - 1] : "";
    // la ligne d'avant était pleine et sa phrase continue : c'est la suite, coupée par la mise en page
    const ti = colleTitre(l, avant, prochaine(i), pasTitre);
    if(avant && avant.length >= 55 && !COLLE_FIN_PHRASE.test(avant) && !/^#/.test(l) && !/^\s*(?:[-=]+>|[-–—•●◦▪▫■□➢➤→►*·✓✔])/.test(l)
       && (!ti || /^[a-zà-ÿ]/.test(l) || COLLE_MOT_VIDE.test(avant))){
      items.push({ t:"texte", txt:l }); return;
    }
    if(ti){ items.push({ t:"titre", txt:ti.titre, sur:!!ti.sur, num:!!ti.num, brut:l }); return; }
    const p = l.match(COLLE_PUCE);
    if(p && p[1]){ items.push({ t:"puce", txt:p[1] }); return; }
    if(colleDefinition(l)){ items.push({ t:"puce", txt:l, def:true }); return; }
    items.push({ t:"texte", txt:l });
  });
  // le niveau d'un titre numéroté : I. > A. > 1. > 1.1
  const niveau = it=>{
    const l = it.brut || "";
    if(/^\s*[IVX]{1,5}\s*[.)\-–—:]/.test(l)) return 1;
    if(/^\s*[A-H]\s*[.)\-–—:]/.test(l)) return 2;
    if(/^\s*\d{1,2}\.\d/.test(l)) return 4;
    if(/^\s*\d{1,2}/.test(l)) return 3;
    return 0;
  };
  const versPuce = it=>{ const p = it.brut.match(COLLE_PUCE); return it.num || p ? { t:"puce", txt:p && p[1] ? p[1] : it.brut } : { t:"texte", txt:it.brut }; };
  const suivant = i=>{ let k = i + 1; while(k < items.length && items[k].t === "vide") k++; return k; };
  // « 1) … 2) … 3) … » à la suite, sans rien entre : une liste, pas des titres
  for(let i = 0; i < items.length; i++){
    if(items[i].t !== "titre" || !items[i].num) continue;
    const run = [i]; let k = suivant(i);
    while(k < items.length && items[k].t === "titre" && items[k].num && niveau(items[k]) === niveau(items[i])){ run.push(k); k = suivant(k); }
    if(run.length > 1) run.forEach(j=>{ items[j] = versPuce(items[j]); });
  }
  // un titre suivi d'un titre plus précis est celui d'une partie : « I. … › A. … ».
  // Un « titre » sans rien dessous n'en est pas un.
  for(let i = items.length - 1; i >= 0; i--){
    const it = items[i]; if(it.t !== "titre") continue;
    const k = suivant(i);
    const enfant = k < items.length && items[k].t === "titre" ? items[k] : null;
    if(enfant && it.num && enfant.num && niveau(it) < niveau(enfant)){
      enfant.txt = it.txt + " › " + enfant.txt; items[i] = { t:"vide" }; continue;
    }
    if(it.sur) continue;
    if(k >= items.length || enfant) items[i] = versPuce(it);
  }

  // 2. on recolle les lignes coupées (PDF) et on range dans des sections
  const sections = [];
  let cur = null;
  const nouvelle = titre=>{ cur = { title:titre, blocs:[] }; sections.push(cur); };
  let dernier = null, videAvant = false;
  items.forEach(it=>{
    if(it.t === "vide"){ videAvant = true; return; }
    if(it.t === "titre"){ nouvelle(it.txt); cur.brut = it.brut; dernier = null; videAvant = false; return; }
    if(!cur) nouvelle("");
    // une ligne coupée par la mise en page : la précédente était pleine et ne finissait pas la phrase
    const pleine = dernier && dernier.der.length >= 55;
    const suite = dernier && !videAvant && it.t === "texte" &&
      ((/[a-zà-ÿ]-$/.test(dernier.txt) && /^[a-zà-ÿ]/.test(it.txt)) || (pleine && !COLLE_FIN_PHRASE.test(dernier.txt)));
    if(suite){
      dernier.txt = /[a-zà-ÿ]-$/.test(dernier.txt) && /^[a-zà-ÿ]/.test(it.txt) ? dernier.txt.slice(0, -1) + it.txt : dernier.txt + " " + it.txt;
      dernier.der = it.txt; videAvant = false; return;
    }
    const b = { t:it.t === "puce" ? "puce" : "texte", txt:it.txt, der:it.txt, def:!!it.def, apresVide:videAvant };
    cur.blocs.push(b); dernier = b; videAvant = false;
  });

  // le titre du document, seul avant le premier titre, redit le nom du chapitre : on le laisse
  if(sections.length > 1 && !sections[0].title && sections[0].blocs.length === 1){
    const l = sections[0].blocs[0].txt;
    if(l.length <= 80 && !COLLE_FIN_PHRASE.test(l)) sections.shift();
  }
  // 3. chaque section : texte puis puces, ou les deux mêlés dans l'ordre
  let nDef = 0;
  const enPuce = txt=>{
    const d = colleDefinition(txt);
    if(d){ nDef++; return "<b>" + esc(d.terme) + "</b>" + (d.prec ? " " + esc(d.prec) : "") + " : " + esc(d.def); }
    return esc(txt);
  };
  const out = sections.filter(s=>s.blocs.length || s.title).map((s,i)=>{
    const sec = { title:s.title || (sections.length > 1 ? "Introduction" : "Le cours") };
    if(s.brut) Object.defineProperty(sec, "_brut", { value:s.brut, enumerable:false });
    const b = s.blocs;
    const premPuce = b.findIndex(x=>x.t === "puce");
    const melange = premPuce >= 0 && b.slice(premPuce).some(x=>x.t === "texte");
    const texte = arr=>arr.map((x,k)=>(k && x.apresVide ? "\n\n" : k ? "\n" : "") + esc(x.txt)).join("");
    if(!melange){
      const txt = b.filter(x=>x.t === "texte"), puces = b.filter(x=>x.t === "puce");
      if(txt.length) sec.body = texte(txt);
      if(puces.length) sec.list = puces.map(x=>enPuce(x.txt));
    } else {
      // l'ordre compte : les puces restent à leur place dans le texte
      let html = "", liste = null;
      b.forEach(x=>{
        if(x.t === "puce"){
          if(!liste){ liste = []; }
          liste.push("<li><span class=\"li-text\">" + enPuce(x.txt) + "</span></li>");
        } else {
          if(liste){ html += "<ul class=\"card-list\">" + liste.join("") + "</ul>"; liste = null; }
          html += (html && !/<\/ul>$/.test(html) ? (x.apresVide ? "\n\n" : "\n") : "") + esc(x.txt);
        }
      });
      if(liste) html += "<ul class=\"card-list\">" + liste.join("") + "</ul>";
      sec.body = html;
    }
    return sec;
  }).filter(s=>s.body || (s.list && s.list.length));
  return { sections:out, nDef };
}

// La feuille « Coller ton cours » : on colle, on voit tout de suite le découpage, on ajoute.
function collerCours(type, ch){
  let pasTitre = new Set(), dernier = null;
  openForm("Coller ton cours", [
    { key:"txt", label:"Le texte de ton cours", type:"area", placeholder:"Colle ici ton cours : Word, PDF, Notes, Google Docs…",
      hint:"Les titres, les listes et les définitions (« Terme : … ») sont repérés tout seuls. Pour forcer un titre, commence la ligne par #." }
  ], "Ajouter au cours", v=>{
    const r = colleDecouper(v.txt, pasTitre);
    if(!r.sections.length) return "Colle d'abord le texte de ton cours.";
    r.sections.forEach(sec=>{ const o = { title:sec.title }; if(sec.body) o.body = sec.body; if(sec.list) o.list = sec.list; ch.sections.push(o); });
    marquerRetouche(type);
    saveContent();
    renderCoursePane(type);
    toast(r.sections.length > 1 ? r.sections.length + " sections ajoutées." : "Section ajoutée.");
  });
  const ta = document.getElementById("fs-f-txt");
  ta.classList.add("colle-zone"); ta.rows = 9;
  const champ = ta.parentElement;
  // coller d'un geste, quand le téléphone le permet
  if(navigator.clipboard && navigator.clipboard.readText){
    const b = el("button","colle-presse"); b.type = "button";
    b.innerHTML = ICO("presse") + "Coller depuis le presse-papiers";
    b.addEventListener("click", async ()=>{
      haptic();
      try{ const t = await navigator.clipboard.readText(); if(t){ ta.value = t; majApercu(); } else toast("Le presse-papiers est vide."); }
      catch(e){ toast("Appuie longuement dans la zone de texte, puis « Coller »."); }
    });
    champ.insertBefore(b, ta);
  }
  const ap = el("div","colle-apercu"); champ.appendChild(ap);
  const majApercu = ()=>{
    const r = colleDecouper(ta.value, pasTitre);
    ap.innerHTML = "";
    if(!r.sections.length){ ap.hidden = true; return; }
    ap.hidden = false;
    const nPuces = r.sections.reduce((k,x)=>k + (x.list||[]).length + ((x.body||"").match(/<li>/g)||[]).length, 0);
    const t = el("div","colle-resume");
    t.innerHTML = `<b>Aperçu</b> · ${r.sections.length} section${r.sections.length > 1 ? "s" : ""}` +
      (nPuces ? ` · ${nPuces} puce${nPuces > 1 ? "s" : ""}` : "") + (r.nDef ? ` · ${r.nDef} définition${r.nDef > 1 ? "s" : ""}` : "");
    ap.appendChild(t);
    if(r.nDef){ const d = el("div","fs-hint"); d.textContent = "Les définitions iront aussi dans le lexique et les flashcards de la matière."; ap.appendChild(d); }
    r.sections.forEach(sec=>{
      const c = el("div","colle-sec");
      const extrait = stripTags((sec.body || "") + " " + (sec.list || []).join(" · ")).replace(/\s+/g, " ").trim();
      const nl = (sec.list||[]).length + ((sec.body||"").match(/<li>/g)||[]).length;
      c.innerHTML = `<div class="colle-sec-t"><b>${esc(sec.title)}</b></div><div class="colle-sec-x">${esc(extrait.slice(0, 120))}${extrait.length > 120 ? "…" : ""}</div>` +
        (nl ? `<div class="colle-sec-n">${nl} puce${nl > 1 ? "s" : ""}</div>` : "");
      // un titre repéré à tort : on le rend au texte
      if(sec._brut && !/^#/.test(sec._brut)){
        const x = el("button","colle-pas-titre"); x.type = "button"; x.textContent = "Pas un titre";
        x.addEventListener("click",()=>{ haptic(); pasTitre.add(sec._brut); majApercu(); });
        c.querySelector(".colle-sec-t").appendChild(x);
      }
      ap.appendChild(c);
    });
  };
  ta.addEventListener("input",()=>{ clearTimeout(dernier); dernier = setTimeout(majApercu, 180); });
  ap.hidden = true;
}

// ── Ajouter une section à un chapitre ──
function addSection(type, ch){
  openForm("Nouvelle section", [
    { key:"title", label:"Titre", placeholder:"Présentation du cours" },
    { key:"body",  label:"Texte", type:"area", placeholder:"Le contenu du cours…",
      hint:"Colle une adresse, elle devient cliquable. Pour un lien nommé : [le texte de Marcel](https://…)" },
    { key:"list",  label:"Puces (facultatif)", type:"area",
      placeholder:"Une idée par ligne", hint:"Chaque ligne devient une puce." }
  ], "Ajouter", v=>{
    if(!v.title && !v.body) return "Il faut au moins un titre ou un texte.";
    const sec = { title: v.title || "" };
    if(v.body) sec.body = v.body;
    const puces = v.list.split("\n").map(x=>x.trim()).filter(Boolean);
    if(puces.length) sec.list = puces;
    ch.sections.push(sec);
    marquerRetouche(type);
    saveContent();
    renderCoursePane(type);
  });
}

// Le « + » flottant n'apparaît que là où il veut dire quelque chose.
// Une seule logique dans toute l'app : quand une page sert à ajouter quelque chose,
// c'est le « + » de la barre du haut qui l'ajoute (le bouton flottant n'est plus affiché).
let CLS_GERE = false;   // créateur ou adjoint de la classe ouverte
const FAB_ACTIONS = {
  semchoice:  { label:"Ajouter un semestre", fn:()=>addSemestre() },
  subjects:   { label:"Ajouter une matière", fn:()=>addMatiere() },
  mesdevoirs: { label:"Ajouter un devoir",   fn:()=>nouvelleEcheance() },
  devoirs:    { label:"Ajouter un devoir",   fn:()=>editDevoir(null) },
  sites:      { label:"Ajouter un site",     fn:()=>editSite(-1) },
  classes:    { label:"Créer ou rejoindre une classe", fn:()=>classMenu() },
  planning:   { label:"Ajouter un créneau",  fn:()=>editCoursPlanning(null) },
  // dans une classe : publier un cours, ou poser un devoir, selon la vue ouverte
  class:      { label:"Publier ou ajouter un devoir", si:()=>CLS_GERE && !!curClass,
                fn:()=>{ if((CLS_VUE[curClass.id] || "cours") === "devoirs") choisirCoursDevoir(curClass); else publishFromClass(curClass); } }
};
function refreshFab(id){
  const fab = document.getElementById("fab-add");
  if(!fab) return;
  const a = FAB_ACTIONS[id];
  const ok = canEdit() && !!a && (!a.si || a.si());
  fab.classList.remove("show");
  document.querySelectorAll(".plus-entete").forEach(b=>{ b.hidden = !(ok && b.closest("#screen-" + id)); });
  fab.dataset.target = id;
  if(a) fab.setAttribute("aria-label", a.label);
}

// ── En-tête commun : le bouton retour (ou les icônes de l'accueil) dans une barre fixe,
// identique à celle des cours, pour que rien ne bouge d'une page à l'autre ──
// le bouton retour dit toujours « Retour », quelle que soit la page
function libelleRetour(b){
  if(!b) return;
  [...b.childNodes].forEach(n=>{ if(n.nodeType === 3 && n.textContent.trim()) n.textContent = "Retour"; });
  if(![...b.childNodes].some(n=>n.nodeType === 3 && n.textContent.trim())) b.appendChild(document.createTextNode("Retour"));
}
function poserEntete(scr){
  if(!scr || scr.id === "screen-split" || scr.id === "screen-session") return;
  const wrap = scr.querySelector(":scope > .wrap, :scope > #psycho-inner");
  if(!wrap) return;
  const back = wrap.querySelector(":scope > .back-btn, :scope > .psy-back");
  const icones = wrap.querySelector(":scope > .home-icons");
  let head = scr.querySelector(":scope > .page-head");
  if(!back && !icones && !head && !wrap.querySelector("[data-entete]")) return;
  if(!head){
    head = document.createElement("div"); head.className = "split-head page-head";
    const row = document.createElement("div"); row.className = "head-row"; head.appendChild(row);
    scr.insertBefore(head, scr.firstChild);
    scr.classList.add("a-entete");
  }
  const row = head.firstChild;
  if(back){
    back.classList.remove("rise"); back.classList.add("back-btn"); libelleRetour(back);
    row.querySelectorAll(".back-btn").forEach(x=>{ if(x !== back) x.remove(); });
    row.insertBefore(back, row.firstChild);
  }
  if(icones){ icones.classList.remove("rise"); row.appendChild(icones); }
  // les actions de la page (lien, actualiser, réglages) vont à droite de la barre
  wrap.querySelectorAll("[data-entete]").forEach(b=>row.appendChild(b));
}
// le « + » de chaque page monte dans la barre du haut, à côté des autres actions
Object.keys(FAB_ACTIONS).forEach(id=>{
  const w = document.querySelector("#screen-" + id + " > .wrap"); if(!w) return;
  const b = el("button","icon-btn plus-entete"); b.type = "button"; b.hidden = true;
  b.setAttribute("data-entete",""); b.setAttribute("aria-label", FAB_ACTIONS[id].label);
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
  b.addEventListener("click",()=>{ haptic(); FAB_ACTIONS[id].fn(); });
  const zone = w.parentNode.querySelector(":scope > .hd-onglet .hd-act") || w;   // les pages à en-tête coloré : directement dedans
  const premier = zone.querySelector("[data-entete]");
  const memo = zone.querySelector(":scope > .memo-fab");   // le Mémo reste le premier
  if(zone !== w){ if(memo) memo.after(b); else zone.prepend(b); } else if(premier) premier.before(b); else w.appendChild(b);
});
document.querySelectorAll(".screen").forEach(poserEntete);
// Les en-têtes colorés des pages (titre, retour, boutons) sont écrits directement dans le HTML.

// la semaine affichée, sous les réglages de l'agenda : un point les jours de cours, un appui ouvre le jour
function majHdSemaine(){
  const box = document.getElementById("hd-wk"); if(!box) return;
  const t0 = new Date(); t0.setHours(0,0,0,0);
  const ref = new Date(t0);
  if(edtMode === "day") ref.setDate(ref.getDate() + edtWeekOffset); else ref.setDate(ref.getDate() + 7 * edtWeekOffset);
  const lun = mondayOf(ref); lun.setHours(0,0,0,0);
  const noms = ["LUN","MAR","MER","JEU","VEN","SAM","DIM"];
  box.innerHTML = "";
  for(let i = 0; i < 7; i++){
    const d = new Date(lun); d.setDate(lun.getDate() + i);
    const b = el("button","hd-d" + (sameDay(d, t0) ? " auj" : "") + (edtMode === "day" && sameDay(d, ref) ? " on" : "")); b.type = "button";
    const a = joursOn(d).length;
    b.innerHTML = `<small>${noms[i]}</small><b>${d.getDate()}</b>${a ? "<i></i>" : "<i class='vide'></i>"}`;
    b.addEventListener("click",()=>{
      haptic(); setEdtMode("day");
      document.querySelectorAll("#edt-seg .seg-opt").forEach(x=>x.classList.toggle("active", x.dataset.mode === "day"));
      edtWeekOffset = Math.round((d - t0) / 86400000); renderEDT();
    });
    box.appendChild(b);
  }
}

// le bouton mémo est « fixed » : il sort du contenu qui glisse, sinon il glisserait avec lui
// Pas de jeu en bas des pages : la marge du bas sert à respirer quand la page défile.
// Si tout tient presque sur l'écran, cette marge ne doit pas, à elle seule, faire défiler la page.
// Avec le bouton flottant, on lui laisse sa place ; sans lui, juste la barre d'accueil de l'iPhone.
const ECRANS_FAB = ["screen-semestres","screen-semchoice","screen-subjects","screen-mesdevoirs","screen-devoirs","screen-sites","screen-classes","screen-planning","screen-class"];
let SAB_SONDE = null;
function basSur(){
  if(!SAB_SONDE){ SAB_SONDE = el("div"); SAB_SONDE.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;"; document.body.appendChild(SAB_SONDE); }
  return SAB_SONDE.offsetHeight || 0;
}
function ajusterBas(w){
  if(!w || !w.closest(".screen.active")) return;
  w.style.paddingBottom = "";
  const pad = parseFloat(getComputedStyle(w).paddingBottom) || 0;
  const trop = document.documentElement.scrollHeight - innerHeight;
  if(trop <= 0 || trop > pad) return;
  if(ECRANS_FAB.includes(w.closest(".screen").id)){
    if(trop < pad - 16) w.style.paddingBottom = (pad - trop) + "px";
    return;
  }
  // le bas du dernier bloc visible (sans compter les animations d'entrée)
  let fin = 0;
  [...w.children].forEach(k=>{
    if(!k.offsetHeight) return;
    const cs = getComputedStyle(k);
    if(cs.position === "fixed" || cs.position === "absolute") return;
    fin = Math.max(fin, k.offsetTop + k.offsetHeight);
  });
  const finPage = w.getBoundingClientRect().top + scrollY + fin;
  if(innerHeight - finPage >= basSur() + 12) w.style.paddingBottom = (pad - trop) + "px";
}
if(window.ResizeObserver){
  const ro = new ResizeObserver(es=>es.forEach(e=>ajusterBas(e.target)));
  document.querySelectorAll(".screen > .wrap, #psycho-inner").forEach(w=>ro.observe(w));
  addEventListener("resize", ()=>ajusterBas(document.querySelector(".screen.active > .wrap, .screen.active > #psycho-inner")));
}

// Projet Psycho et Concours CPE : leur titre (icône, titre, phrase) monte dans le même bandeau coloré
function poserHdPsycho(){
  const scr = document.getElementById("screen-psycho"), pi = document.getElementById("psycho-inner");
  if(!scr || !pi) return;
  const hero = pi.querySelector(":scope > .psy-hero");
  let hd = scr.querySelector(":scope > .hd-onglet");
  if(!hero){ if(hd) hd.remove(); scr.classList.remove("hd-on"); return; }
  if(!hd){ hd = el("div","hd-onglet hd-page hd-psy"); scr.insertBefore(hd, pi); }
  scr.classList.add("hd-on");
  const q = c=>{ const x = hero.querySelector(c); return x ? x.innerHTML : ""; };
  const ancien = hd.querySelector(".back-btn, .psy-back");   // gardé : un nouveau dessin ne le recrée pas toujours
  hd.innerHTML = `<div class="hd-row"><div class="hd-titres"><div class="hd-psy-mark">${q(".psy-hero-mark")}</div><h1 class="hd-t">${q(".psy-hero-title")}</h1></div><div class="hd-act"></div></div><div class="hd-plus">${q(".psy-hero-sub") ? `<p class="hd-sous">${q(".psy-hero-sub")}</p>` : ""}</div>`;
  const back = scr.querySelector(":scope > .page-head .back-btn, :scope > .page-head .psy-back") || ancien;
  if(back){ back.classList.add("back-btn"); hd.querySelector(".hd-row").insertBefore(back, hd.querySelector(".hd-titres")); }
}
// le Projet Psycho se redessine en entier : on replace son bouton retour à chaque fois
(function(){
  const pi = document.getElementById("psycho-inner");
  if(pi && window.MutationObserver) new MutationObserver(()=>{ poserEntete(document.getElementById("screen-psycho")); poserHdPsycho(); }).observe(pi, { childList:true });
})();
// à quelle profondeur est chaque écran : sert à savoir si on avance ou si on revient
const PROFONDEUR = { login:0, pick:0, welcome:0, semestres:0, semchoice:1, edt:1, classes:1, search:1, mesdevoirs:1, sites:1, index:2, planning:1, psycho:1,
  class:2, shared:3, subjects:2, matiere:2.5, controle:2.6, split:3, qcmchoix:4, lexique:4, synthese:4, auteurs:4, devoirs:4, session:5 };
function profondeurEcran(id){ return PROFONDEUR[id] ?? 2; }
let CALME_T = null, SANS_ENTREE = false;
// une page qui en remplace une autre dans le même écran (projets) : elle entre comme une page
function entreeDansEcran(cible){
  if(SANS_ENTREE){ SANS_ENTREE = false; return; }
  if(document.documentElement.getAttribute("data-screen") !== "psycho") return;   // showScreen s'en charge
  document.documentElement.classList.remove("calme");
  clearTimeout(CALME_T); CALME_T = setTimeout(()=>document.documentElement.classList.add("calme"), 900);
  window.scrollTo(0, 0);
  if(cible){ cible.classList.remove("glisse-av"); void cible.offsetWidth; cible.classList.add("glisse-av");
    cible.addEventListener("animationend", ()=>cible.classList.remove("glisse-av"), { once:true }); }
}
let ECRAN_AVANT = null;   // la page d'où l'on vient : visible derrière pendant le glisser
function showScreen(id){
  lecteurStop();
  setTimeout(()=>{ try{ memoriserPage(); }catch(e){} }, 0);
  // arrivée sur un autre écran : les animations d'entrée jouent, puis on se calme.
  // Le même écran redessiné (cocher une étape, filtrer) reste calme.
  if(document.documentElement.getAttribute("data-screen") !== id){
    document.documentElement.classList.remove("calme");
    clearTimeout(CALME_T); CALME_T = setTimeout(()=>document.documentElement.classList.add("calme"), 900);
  }
  if(id !== "split" && typeof fermerRecherchePage === "function") fermerRecherchePage();
  if(id === "semestres"){ try{ renderAccueil(true); cascade(document.querySelector("#screen-semestres .hm-body"), ".hm-body > *, .hm-up > *, #hm-mats .hm-card"); }catch(e){ console.error(e); } }
  requestAnimationFrame(()=>ajusterBas(document.querySelector("#screen-" + id + " > .wrap, #screen-" + id + " > #psycho-inner")));
  const avant = document.documentElement.getAttribute("data-screen");
  if(avant && avant !== id) ECRAN_AVANT = avant;
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active","dessous"));
  const scr = document.getElementById("screen-"+id);
  scr.classList.add("active");
  // glissement comme sur l'iPhone : vers la gauche quand on avance, vers la droite quand on revient.
  // La barre du haut ne bouge pas, seul le contenu glisse.
  if(avant && avant !== id){
    const sens = profondeurEcran(id) >= profondeurEcran(avant) ? "glisse-av" : "glisse-ar";
    const cible = scr.querySelector(":scope > .wrap, :scope > .content-scroll, :scope > .sess-body, :scope > #psycho-inner");
    if(cible){ cible.classList.remove("glisse-av","glisse-ar"); void cible.offsetWidth; cible.classList.add(sens);
      cible.addEventListener("animationend", ()=>cible.classList.remove(sens), { once:true }); }
  }
  // le canvas <html> peint toute la surface (sous les barres Safari + safe areas PWA)
  document.documentElement.setAttribute("data-screen", id);
  try{ majTabbar(id); }catch(e){}
  refreshFab(id);
  // un nouvel écran commence en haut ; le même écran redessiné garde sa place
  if(avant !== id) window.scrollTo(0,0);
  requestAnimationFrame(()=>majProgression());   // l'onglet sommaire n'existe que dans un cours
  if(typeof pomoMaj === "function") pomoMaj();
}

// ── THEME ──
// Le THÈME est purement esthétique (rose / violet).
// L'IDENTITÉ vient du pseudo : les messages personnels ne s'affichent
// que pour les personnes concernées, quel que soit le thème choisi.
// Plusieurs pseudos possibles par personne (elle choisit ce qu'elle veut).
// Comparaison insensible aux accents et à la casse.
const NANA_PSEUDOS  = ["nana", "nawal", "nanou", "naw"];
const CIVA_PSEUDOS  = ["civa", "civ"];
function whoAmI(){
  return (PSEUDO || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function isNana(){ return NANA_PSEUDOS.includes(whoAmI()); }
function isCiva(){ return CIVA_PSEUDOS.includes(whoAmI()); }
// vrai uniquement pour Civa ou Nana : les autres n'ont aucun message perso
function isCloseFriend(){ return isNana() || isCiva(); }
function isPink(){ return (document.documentElement.getAttribute("data-theme")||"girly")!=="purple"; }
function mk(){ return isPink() ? "\ud83c\udf38" : "\ud83d\udcab"; }  // 🌸 ou 💫
function psyTitle(){ return "Projet Psycho"; }
function updatePersonalText(){
  const nana=isNana();
  const wm=document.querySelector(".welcome-mark");
  if(wm) wm.textContent = mk();
  const pt=document.querySelector(".project-title");
  if(pt) pt.textContent = psyTitle();
  const pm=document.querySelector(".pick-mark");
  const wt=document.querySelector(".welcome-title");
  const ws=document.querySelector(".welcome-sub");
  if(wt) wt.textContent = nana ? "Salut Nana" : "Révisions";
  if(ws) ws.textContent = nana ? "Tes cours, tes fiches et ton entraînement. Prête quand tu l'es." : "Tes cours, tes fiches et ton entraînement.";
}
// couleur de la barre du téléphone : celle du fond, selon le thème et le mode clair/sombre
const COULEUR_BARRE = { girly:{ clair:"#fdf5f8", sombre:"#1a0d15" }, purple:{ clair:"#f4f2fc", sombre:"#120e22" } };
function majCouleurBarre(t){
  const c = COULEUR_BARRE[t] || COULEUR_BARRE.girly;
  const force = document.documentElement.getAttribute("data-mode");
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{ m.setAttribute("content", force === "sombre" ? c.sombre : force === "clair" ? c.clair : /dark/.test(m.getAttribute("media") || "") ? c.sombre : c.clair); });
}
// Mode clair / sombre : « auto » suit le téléphone. Réglage propre à chaque appareil.
const MODE_KEY = "revision_mode_v1";
function modeActuel(){ let m = "auto"; try{ m = localStorage.getItem(MODE_KEY) || "auto"; }catch(e){} return m; }
function appliquerMode(m){
  try{ if(m === "auto") localStorage.removeItem(MODE_KEY); else localStorage.setItem(MODE_KEY, m); }catch(e){}
  if(m === "auto") document.documentElement.removeAttribute("data-mode");
  else document.documentElement.setAttribute("data-mode", m);
  majCouleurBarre(document.documentElement.getAttribute("data-theme"));
}
function applyTheme(t){ document.documentElement.setAttribute("data-theme", t); majCouleurBarre(t); resolveAllLangs(); updatePersonalText(); }
function chooseTheme(t){
  applyTheme(t);
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
  if(syncOn) pushState();       // on enregistre le thème sur le serveur
  renderSemestres();
  showScreen("semestres");
}
(function initTheme(){
  let saved=null;
  try{ saved=localStorage.getItem(THEME_KEY); }catch(e){}
  if(saved){ applyTheme(saved); }
})();

// ── PROGRESS HELPERS ──
function getSubjectProgress(s){
  const modes=["fc","qcm","oq"];
  let totalQ=0, totalDone=0;
  modes.forEach(m=>{ const arr=s[m]||[]; totalQ+=arr.length; const st=stats[s.id+"_"+m]; if(st) totalDone+=st.score; });
  const started=modes.some(m=>stats[s.id+"_"+m]);
  const allDone=modes.every(m=>{ const st=stats[s.id+"_"+m]; const arr=s[m]||[]; if(!arr.length) return true; return st && st.score/st.total>=0.7; });
  return { pct: totalQ>0?Math.round(totalDone/totalQ*100):0, started, allDone };
}

// ══════════════════════════════════════════════════
// SEMESTRES
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// RECHERCHE GLOBALE
// ══════════════════════════════════════════════════
// normalise : minuscules, sans accents (pour que "éducation" matche "education")
function norm(s){
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/<[^>]+>/g," ");
}
// enlève les balises HTML d'un extrait
function stripTags(s){ return String(s).replace(/<[^>]+>/g,""); }

let SEARCH_INDEX = null;
function buildIndex(){
  const idx = [];
  SUBJECTS.forEach(s=>{
    // la matière elle-même (pour la trouver par son nom)
    if(totalCards(s) > 0 || (s.cm&&s.cm.length) || (s.td&&s.td.length)){
      const extra = s.bilingue ? " langue vivante anglais espagnol" : "";
      idx.push({ subj:s, type:"Matière", tab:0, matiere:true,
                 title:s.title, text:s.ecue+" "+s.title+extra, icon:"📂" });
    }
    // chapitres CM et TD → sections
    [["cm","Cours"],["td","TD"]].forEach(([k,lbl])=>{
      (s[k]||[]).forEach((ch,ci)=>{
        (ch.sections||[]).forEach((sec,si)=>{
          const txt = [sec.title, sec.body, ...(sec.list||[])].filter(Boolean).join(" ");
          idx.push({ subj:s, type:lbl, tab:(k==="cm"?0:1), chap:ci, sec:si,
                     title:sec.title||ch.label, text:stripTags(txt), icon:(k==="cm"?"📖":"📝") });
        });
      });
    });
    (s.fc||[]).forEach(x=>  idx.push({ subj:s, type:"Flashcard", tab:2, mode:"fc",
                                       title:x.q, text:stripTags(x.q+" "+x.a), icon:"🃏" }));
    (s.qcm||[]).forEach(x=> idx.push({ subj:s, type:"QCM", tab:2, mode:"qcm",
                                       title:x.q, text:stripTags(x.q+" "+(x.opts||[]).join(" ")+" "+(x.e||"")), icon:"⏱️" }));
    (s.oq||[]).forEach(x=>  idx.push({ subj:s, type:"Question ouverte", tab:2, mode:"oq",
                                       title:x.q, text:stripTags(x.q+" "+x.a), icon:"✍️" }));
    (s.auteurs||[]).forEach(a=> idx.push({ subj:s, type:"Auteur", tab:2, auteur:true,
                                       title:a.nom, text:stripTags([a.nom,a.courant,a.these,(a.concepts||[]).join(" "),a.retenir].join(" ")), icon:"👤" }));
  });
  return idx;
}
// L1, L2, L3 : l'année d'une matière, d'après son semestre
function anneeDe(sem){
  if(sem === 1) return { cle:"L1", rang:1, court:"L1 · ICP" };
  if(sem < 3)  return { cle:"L1", rang:1, court:"L1 · S" + (sem === 1.5 ? 1 : 2) };
  if(sem < 5)  return { cle:"L2", rang:2, court:"L2 · S" + sem };
  return { cle:"L3", rang:3, court:"L3 · S" + sem };
}
function anneeMatiere(subj){ return anneeDe(SEMESTRES[subj.id]); }
// ouvrir un chapitre de n'importe quelle matière, à la bonne section, mots surlignés
function allerAuChapitre(subj, type, idx, sec, mots){
  curSemestre = SEMESTRES[subj.id];
  openSubject(subj.id);
  if(type === "cm") curCmIdx = idx; else curTdIdx = idx;
  allerDemande = { sec: sec >= 0 ? sec : 0, mots: mots || [] };
  setTab(type === "cm" ? 0 : 1);
}
// l'état de la recherche : le filtre d'année et le nombre de résultats montrés
var RECH = { q:"", annee:"tout", limite:40 };
function doSearch(q){ RECH = { q:String(q || ""), annee:"tout", limite:40 }; renderRecherche(true); }
function renderRecherche(nouvelle){
  const q = RECH.q;
  const box = document.getElementById("search-results");
  // les résultats des classes arrivent à part : on les garde quand on change juste de filtre
  const partages = nouvelle ? null : box.querySelector(".shared-results");
  box.innerHTML = "";
  box.appendChild(entreeIndex());
  const query = norm(q).trim();
  if(query.length < 2){
    box.insertAdjacentHTML("beforeend", vide("loupe", "Cherche dans tous tes cours", (isCiva() ? "L1, L2 et L3 : " : "") + "une notion, un auteur, un mot. Tape au moins 2 lettres."));
    return;
  }
  if(!SEARCH_INDEX) SEARCH_INDEX = buildIndex();
  if(!SEARCH_INDEX.length){
    box.insertAdjacentHTML("beforeend", vide("vide", "Aucun cours pour l'instant", "Ajoute une matière pour pouvoir chercher."));
    return;
  }
  const words = query.split(/\s+/).filter(Boolean);
  const hits = [];
  SEARCH_INDEX.forEach(it=>{
    const hay = norm(it.title + " " + it.text);
    if(!words.every(w=>hay.includes(w))) return;
    // score : un titre qui matche vaut plus qu'un corps de texte
    let sc = 0;
    words.forEach(w=>{
      if(norm(it.title).includes(w)) sc += 3;
      if(hay.includes(w)) sc += 1;
    });
    hits.push({ it, sc });
  });
  if(nouvelle) searchShared(q, box);
  if(!hits.length){
    box.insertAdjacentHTML("beforeend", vide("loupe", "Rien pour « " + esc(q) + " »", "Essaie un autre mot, ou une partie du mot."));
    if(partages) box.appendChild(partages);
    return;
  }
  hits.sort((a,b)=>b.sc-a.sc);
  // filtre par année : Tout, L1, L2, L3 (seulement celles qui ont des résultats)
  const parAn = {};
  hits.forEach(h=>{ const a = anneeMatiere(h.it.subj).cle; parAn[a] = (parAn[a] || 0) + 1; });
  const ans = ["L1","L2","L3"].filter(a=>parAn[a]);
  if(RECH.annee !== "tout" && !parAn[RECH.annee]) RECH.annee = "tout";
  const vis = RECH.annee === "tout" ? hits : hits.filter(h=>anneeMatiere(h.it.subj).cle === RECH.annee);
  if(ans.length > 1){
    const seg = el("div","seg sr-annees");
    [["tout","Tout", hits.length], ...ans.map(a=>[a, a, parAn[a]])].forEach(([cle, nom, n])=>{
      const b = el("button","seg-opt" + (RECH.annee === cle ? " active" : ""));
      b.type = "button";
      b.innerHTML = `${esc(nom)} <span class="sr-an-n">${n}</span>`;
      b.addEventListener("click",()=>{ haptic(); RECH.annee = cle; RECH.limite = 40; renderRecherche(false); });
      seg.appendChild(b);
    });
    box.appendChild(seg);
  }
  // regroupés par matière, dans l'ordre du meilleur résultat de chacune
  const top = vis.slice(0, RECH.limite), groupes = new Map();
  top.forEach(h=>{ const k = h.it.subj.id; if(!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(h.it); });
  const nMat = new Set(vis.map(h=>h.it.subj.id)).size;
  const head = el("div","search-count");
  head.textContent = vis.length + " résultat" + (vis.length>1?"s":"") + " · " + nMat + " matière" + (nMat>1?"s":"");
  box.appendChild(head);
  const icoType = it => it.matiere ? "semestres" : it.tab === 0 ? "cm" : it.tab === 1 ? "td"
    : it.auteur ? "auteurs" : it.mode === "fc" ? "fc" : it.mode === "qcm" ? "qcm" : it.mode === "oq" ? "oq" : "entrainer";
  groupes.forEach(items=>{
    const sj = items[0].subj;
    const g = el("div","sr-groupe");
    g.innerHTML = `<span class="sr-an">${esc(anneeMatiere(sj).court)}</span><span class="sr-num">${esc(sj.ecue || "")}</span><span>${esc(sj.title)}</span>`;
    box.appendChild(g);
    const carte = el("div","sr-carte");
    items.forEach(it=>{
      // d'où vient le résultat : « CM 3 · Le judaïsme », ou le type d'exercice
      let ou = it.type;
      if(it.tab === 0 || it.tab === 1){ const ch = (it.subj[it.tab === 0 ? "cm" : "td"]||[])[it.chap||0]; if(ch){ const pc = partiesChapitre(ch.label); ou = pc.court + (pc.titre ? " · " + pc.titre : ""); } }
      const row = el("button","sr-row"); row.type = "button";
      row.innerHTML = `<span class="sr-ic">${ICO(icoType(it))}</span>
        <span class="sr-txt"><span class="sr-ou">${esc(ou)}</span>
          <span class="sr-title">${highlight(it.title, words)}</span>
          ${it.matiere ? "" : `<span class="sr-snip">${highlight(snippet(it.text, words), words)}</span>`}</span>`;
      row.addEventListener("click",()=>{
        haptic();
        curSemestre = SEMESTRES[it.subj.id];
        openSubject(it.subj.id);
        // on ouvre le chapitre directement à la bonne section, mots surlignés
        if(it.tab === 0)      { curCmIdx = it.chap||0; allerDemande = { sec:it.sec, mots:words }; setTab(0); }
        else if(it.tab === 1) { curTdIdx = it.chap||0; allerDemande = { sec:it.sec, mots:words }; setTab(1); }
        else if(it.auteur)    { setTab(2); renderAuteurs(); }
        else if(!it.matiere)  { setTab(2); }
      });
      carte.appendChild(row);
    });
    box.appendChild(carte);
  });
  // tout est accessible : les résultats suivants se déplient par paquets de 40
  if(vis.length > RECH.limite){
    const reste = vis.length - RECH.limite;
    const plus = el("button","sr-plus"); plus.type = "button";
    plus.textContent = "Voir " + Math.min(40, reste) + " résultats de plus (encore " + reste + ")";
    plus.addEventListener("click",()=>{ haptic(); const y = window.scrollY; RECH.limite += 40; renderRecherche(false); window.scrollTo(0, y); });
    box.appendChild(plus);
  }
  if(partages) box.appendChild(partages);
}
// ══════════════════════════════════════════════════
// INDEX DES AUTEURS ET DES NOTIONS, TOUTES ANNÉES
// Les auteurs viennent des fiches auteurs, les notions des lexiques des matières.
// Les endroits où ils sont cités sont repérés dans le texte des cours, pas devinés.
// ══════════════════════════════════════════════════
var INDEX_GLOBAL = null;
var SEARCH_SIG = "";
function texteSection(sec){ return norm((sec.title||"") + " " + stripTags((sec.body||"") + " " + (sec.list||[]).join(" "))); }
function* genIndexGlobal(){
  const sections = [];
  for(const subj of SUBJECTS){
    ["cm","td"].forEach(type=>(subj[type]||[]).forEach((ch,ci)=>(ch.sections||[]).forEach((sec,si)=>{
      sections.push({ subj, type, ci, si, label:ch.label, t:" " + texteSection(sec) + " " });
    })));
    yield;
  }
  // les auteurs : une entrée par nom, même s'il a une fiche dans plusieurs matières
  const auteurs = new Map();
  SUBJECTS.forEach(subj=>(subj.auteurs||[]).forEach(a=>{
    if(!a || !a.nom) return;
    const termes = termesAuteur(a.nom);
    // « Rousseau » et « Jean-Jacques Rousseau » : une seule entrée
    const k = termes.length ? termes.slice().sort().join("|") : norm(a.nom).trim();
    if(!auteurs.has(k)) auteurs.set(k, { genre:"auteur", nom:a.nom, fiches:[], termes });
    const e = auteurs.get(k);
    if(a.nom.length > e.nom.length) e.nom = a.nom;
    e.fiches.push({ subj, a });
  }));
  // les notions : une entrée par terme, avec chaque matière où il est défini
  const notions = new Map();
  for(const subj of SUBJECTS){
    lexique(subj).forEach(x=>{
      const k = norm(x.terme).trim();
      if(k.length < 3) return;
      if(!notions.has(k)) notions.set(k, { genre:"notion", nom:x.terme, defs:[], termes:[k] });
      notions.get(k).defs.push({ subj, x });
    });
    yield;
  }
  // le texte de chaque année d'un seul bloc, pour savoir vite où une entrée apparaît
  const textesAn = {}, motsAn = {};
  sections.forEach(s=>{ const a = anneeMatiere(s.subj).cle; textesAn[a] = (textesAn[a] || " ") + s.t; });
  // les mots de chaque année : un mot absent écarte l'entrée sans parcourir tout le texte
  for(const a of Object.keys(textesAn)){ motsAn[a] = new Set(textesAn[a].split(/[^a-z0-9]+/)); yield; }
  const presentDans = (a, x, re)=>{
    const mots = x.split(/[^a-z0-9]+/).filter(Boolean);
    if(!mots.length || !mots.every(m=>motsAn[a].has(m))) return false;
    return mots.length === 1 || re.test(textesAn[a]);
  };
  const entrees = [...auteurs.values(), ...notions.values()];
  let n = 0;
  for(const e of entrees){
    if(++n % 40 === 0) yield;
    // les années où l'entrée a une fiche, une définition, ou est simplement citée
    const subs = e.genre === "auteur" ? e.fiches.map(f=>f.subj) : e.defs.map(d=>d.subj);
    const ans = new Set(subs.map(sj=>anneeMatiere(sj).cle));
    const res = e.termes.map(motEntier);
    Object.keys(textesAn).forEach(a=>{
      if(ans.has(a)) return;
      const t = textesAn[a];
      if(e.termes.some((x,i)=>presentDans(a, x, res[i]))) ans.add(a);
    });
    e.annees = [...ans].sort();
  }
  return { sections, entrees, auteurs:[...auteurs.values()], notions:[...notions.values()] };
}
// L'index se fabrique en arrière-plan, par petites tranches : l'écran ne fige jamais.
let INDEX_GEN = null, INDEX_SIG = "", INDEX_ATTENTE = [];
function sigContenu(){ return SUBJECTS.map(x=>signatureCours(x) + "|" + (x.qcm||[]).length + "|" + (x.fc||[]).length + "|" + (x.auteurs||[]).length + "|" + x.title).join("#"); }
// à l'entrée des écrans qui s'en servent : si les cours ont changé, l'index sera refait
function indexAJour(){
  const sg = sigContenu();
  if(sg !== INDEX_SIG){ INDEX_SIG = sg; INDEX_GLOBAL = null; INDEX_GEN = null; }
}
function finirIndex(r){ INDEX_GLOBAL = r; INDEX_GEN = null; INDEX_ATTENTE.splice(0).forEach(f=>{ try{ f(); }catch(e){} }); }
function indexEnFond(){
  if(INDEX_GLOBAL || INDEX_GEN) return;
  if(!INDEX_SIG) INDEX_SIG = sigContenu();
  const g = INDEX_GEN = genIndexGlobal();
  const pas = ()=>{
    if(INDEX_GEN !== g) return;                 // refait entre-temps
    const t = performance.now(); let r;
    do{ r = g.next(); }while(!r.done && performance.now() - t < 8);
    if(r.done) finirIndex(r.value); else setTimeout(pas, 16);
  };
  setTimeout(pas, 0);
}
function indexPret(fn){ if(INDEX_GLOBAL) fn(); else { INDEX_ATTENTE.push(fn); indexEnFond(); } }
// les noms à chercher : ceux des fiches auteurs, et les noms courts (Mead, Elias) en mot entier
function termesAuteur(nom){
  const n = String(nom || "").trim();
  // une institution, une loi, un plan (« Plan Langevin-Wallon », « Haut-commissariat aux compétences ») : le nom entier
  if(/^(plan|loi|rapport|circulaire|commission|conseil|haut|minist|charte|convention|d[ée]claration|agence|institut|comit|ordonnance|d[ée]cret)/i.test(n)
     || (/\s(aux?|de|des|du|pour|sur|la|le|les)\s/i.test(" " + n + " ") && !/\s(de|du)\s[A-ZÉ]/.test(n))) return [norm(n)];
  // une personne : le nom de famille entier, en mot entier (« Lévi-Strauss » ne doit pas trouver Strauss)
  return n.split(/\s+et\s+|&|,/).map(p=>norm(p.trim().split(/\s+/).pop() || "")).filter(x=>x.length >= 4);
}
function indexGlobal(){
  if(INDEX_GLOBAL) return INDEX_GLOBAL;
  if(!INDEX_SIG) INDEX_SIG = sigContenu();
  // quelqu'un en a besoin tout de suite : on finit d'un coup ce qui était commencé
  const g = INDEX_GEN || genIndexGlobal(); let r;
  while(!(r = g.next()).done);
  finirIndex(r.value);
  return INDEX_GLOBAL;
}
// un terme cherché comme mot entier (pas « norme » dans « énorme »)
function motEntier(terme){ return new RegExp("(^|[^a-z0-9])" + terme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)"); }
// les chapitres où une entrée est citée, un résultat par chapitre (la 1re section qui la nomme)
function citationsDe(e){
  if(e._cit) return e._cit;
  const res = e.termes.map(motEntier);
  if(!res.length) return (e._cit = []);
  const vus = new Set(), out = [];
  indexGlobal().sections.forEach(s=>{
    const k = s.subj.id + "|" + s.type + "|" + s.ci;
    if(vus.has(k)) return;
    if(!res.some((r,i)=>s.t.includes(e.termes[i]) && r.test(s.t))) return;
    vus.add(k); out.push(s);
  });
  out.sort((a,b)=>anneeMatiere(a.subj).rang - anneeMatiere(b.subj).rang || SEMESTRES[a.subj.id] - SEMESTRES[b.subj.id]);
  return (e._cit = out);
}
// une pastille qui mène à un chapitre : « L2 · S3 · Normes et déviance · TD 3 »
function pastilleChapitre(s, mots){
  const b = el("button","lex-src idx-src"); b.type = "button";
  const pc = partiesChapitre(s.label);
  b.innerHTML = `${ICO(s.type === "cm" ? "cm" : "td").replace('class="ico"','class="ico ico-in"')}<span class="idx-src-txt"><b>${esc(anneeMatiere(s.subj).court)} · ${esc(s.subj.title)}</b><small>${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre) : ""}</small></span>${IC_CHEV_DROITE}`;
  b.addEventListener("click", e=>{ e.stopPropagation(); haptic(); allerAuChapitre(s.subj, s.type, s.ci, s.si, mots); });
  return b;
}
// l'entrée vers l'index, en haut de la recherche
function entreeIndex(){
  const b = el("button","idx-entree"); b.type = "button";
  b.innerHTML = `<span class="type-ic ic-box">${ICO("lexique")}</span><span class="idx-entree-txt"><b>Index des auteurs et des notions</b><small>${isCiva() ? "L1, L2 et L3 réunies : où tu as vu quoi" : "Tous tes cours réunis : où tu as vu quoi"}</small></span>${IC_CHEV_DROITE}`;
  // on emporte la recherche en cours : vers les auteurs si elle en nomme un, sinon vers les notions
  b.addEventListener("click",()=>{
    haptic();
    const q = norm(RECH.q || "").trim();
    const genre = !q || indexGlobal().auteurs.some(e=>norm(e.nom).includes(q)) ? "auteur" : "notion";
    ouvrirIndex(RECH.q || "", genre);
  });
  return b;
}
var IDX = { genre:"auteur", q:"", multi:false };
function ouvrirIndex(q, genre){
  indexAJour();
  IDX = { genre: genre || "auteur", q: q || "", multi:false };
  document.getElementById("idx-input").value = IDX.q;
  { const so = document.getElementById("idx-sous"); if(so) so.textContent = isCiva() ? "Tes auteurs et tes notions, de la L1 à la L3" : "Tes auteurs et tes notions, dans tous tes cours"; }
  { const mu = document.getElementById("idx-multi"); if(mu) mu.hidden = !isCiva(); }
  renderIndex();
  showScreen("index");
  window.scrollTo(0, 0);
}
function renderIndex(){
  const I = indexGlobal();
  const liste = document.getElementById("idx-liste"), lettres = document.getElementById("idx-lettres");
  liste.innerHTML = ""; lettres.innerHTML = "";
  // auteurs ou notions ; toutes, ou seulement celles vues sur plusieurs années
  document.querySelectorAll("#idx-genre .seg-opt").forEach(b=>b.classList.toggle("active", b.dataset.g === IDX.genre));
  document.getElementById("idx-multi").classList.toggle("on", IDX.multi);
  const f = norm(IDX.q).trim();
  const base = IDX.genre === "auteur" ? I.auteurs : I.notions;
  let xs = base.filter(e=>!f || norm(e.nom).includes(f));
  if(IDX.multi) xs = xs.filter(e=>e.annees.length > 1);
  xs = xs.slice().sort((a,b)=>norm(a.nom).localeCompare(norm(b.nom), "fr"));
  if(!xs.length){ liste.innerHTML = vide("loupe", f ? "Rien pour « " + esc(IDX.q) + " »" : "Rien ici pour l'instant", "Essaie un autre mot, ou passe à l'autre onglet."); return; }
  const cnt = el("div","search-count");
  cnt.textContent = xs.length + (IDX.genre === "auteur" ? " auteur" : " notion") + (xs.length > 1 ? "s" : "");
  liste.appendChild(cnt);
  let lettre = "";
  xs.forEach(e=>{
    const L = norm(e.nom).trim().charAt(0).toUpperCase();
    if(L !== lettre){
      lettre = L;
      const h = el("div","lex-lettre"); h.textContent = L; liste.appendChild(h);
      const b = el("button"); b.type = "button"; b.textContent = L;
      b.addEventListener("click",()=>{ haptic(); h.scrollIntoView({ behavior:"smooth", block:"start" }); });
      lettres.appendChild(b);
    }
    liste.appendChild(carteIndex(e));
  });
}
function carteIndex(e){
  const it = el("div","lex-item idx-item");
  const ans = e.annees.map(a=>`<span class="idx-an">${a}</span>`).join("");
  let corps = "";
  if(e.genre === "auteur"){
    const a = e.fiches[0].a;
    const meta = [a.courant, a.periode].filter(Boolean).join(" · ");
    corps = `${meta ? `<div class="idx-meta">${esc(meta)}</div>` : ""}${a.these ? `<div class="lex-def">${esc(a.these)}</div>` : ""}`;
  } else {
    // la définition la plus récente : celle de l'année la plus avancée
    const d = e.defs.slice().sort((x,y)=>SEMESTRES[y.subj.id] - SEMESTRES[x.subj.id])[0];
    corps = `<div class="lex-def">${texteCours(d.x.def)}</div>`;
  }
  it.innerHTML = `<button type="button" class="idx-tete"><span class="lex-terme">${esc(e.nom)}</span><span class="idx-ans">${ans}</span></button>${corps}`;
  const det = el("div","idx-det"); det.hidden = true;
  it.appendChild(det);
  const ouvrir = ()=>{
    if(!det.hidden){ det.hidden = true; it.classList.remove("open"); return; }
    det.innerHTML = "";
    const mots = e.termes.slice(0, 2);
    // où l'entrée a sa fiche ou sa définition
    const lbl1 = el("div","auteur-liens-lbl");
    lbl1.textContent = e.genre === "auteur" ? (e.fiches.length > 1 ? "Fiches auteur" : "Fiche auteur") : (e.defs.length > 1 ? "Défini dans" : "Défini dans ce cours");
    det.appendChild(lbl1);
    if(e.genre === "auteur"){
      e.fiches.forEach(f=>{
        const b = el("button","lex-src idx-src"); b.type = "button";
        b.innerHTML = `${ICO("auteurs").replace('class="ico"','class="ico ico-in"')}<span class="idx-src-txt"><b>${esc(anneeMatiere(f.subj).court)} · ${esc(f.subj.title)}</b><small>Fiche auteur</small></span>${IC_CHEV_DROITE}`;
        b.addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); curSemestre = SEMESTRES[f.subj.id]; openSubject(f.subj.id); setTab(2); renderAuteurs(); });
        det.appendChild(b);
      });
    } else {
      e.defs.forEach(d=>det.appendChild(pastilleChapitre({ subj:d.subj, type:d.x.type, ci:d.x.ci, si:d.x.si, label:d.x.label }, mots)));
    }
    // tous les chapitres qui le citent, de la L1 à la L3
    const deja = new Set(e.genre === "notion" ? e.defs.map(d=>d.subj.id + "|" + d.x.type + "|" + d.x.ci) : []);
    const cit = citationsDe(e).filter(s=>!deja.has(s.subj.id + "|" + s.type + "|" + s.ci));
    if(cit.length){
      const lbl2 = el("div","auteur-liens-lbl");
      lbl2.textContent = (e.genre === "auteur" ? "Cité dans " : "Aussi dans ") + cit.length + " chapitre" + (cit.length > 1 ? "s" : "");
      det.appendChild(lbl2);
      cit.forEach(s=>det.appendChild(pastilleChapitre(s, mots)));
    }
    det.hidden = false; it.classList.add("open");
  };
  it.querySelector(".idx-tete").addEventListener("click",()=>{ haptic(); ouvrir(); });
  return it;
}
// ══════════════════════════════════════════════════
// DÉJÀ VU : dans un chapitre, les auteurs et notions déjà rencontrés les années d'avant
// ══════════════════════════════════════════════════
function blocDejaVu(subj, ch){
  const an = anneeMatiere(subj);
  if(an.rang < 2) return null;
  const I = indexGlobal();
  const texte = " " + (ch.sections||[]).map(texteSection).join(" ") + " ";
  const avant = s=>anneeMatiere(s.subj).rang < an.rang;
  const trouves = [];
  // d'abord les auteurs, puis les notions définies une année d'avant
  I.auteurs.forEach(e=>{
    if(!e.termes.length || !e.termes.some(t=>texte.includes(t) && motEntier(t).test(texte))) return;
    const lieux = citationsDe(e).filter(avant);
    if(lieux.length) trouves.push({ e, lieux });
  });
  // « Bourdieu et Passeron » est déjà couvert par Bourdieu et par Passeron
  const seuls = trouves.filter(t=>t.e.termes.length === 1).map(t=>t.e.termes[0]);
  for(let i = trouves.length - 1; i >= 0; i--){
    const t = trouves[i].e.termes;
    if(t.length > 1 && t.every(x=>seuls.includes(x))) trouves.splice(i, 1);
  }
  I.notions.forEach(e=>{
    const defs = e.defs.filter(d=>anneeMatiere(d.subj).rang < an.rang);
    if(!defs.length || e.termes[0].length < 5 || !texte.includes(e.termes[0]) || !motEntier(e.termes[0]).test(texte)) return;
    // un mot seul, court ou très courant (« autonomie », « directe ») n'apprend rien : on le laisse à l'index
    if(!/\s/.test(e.termes[0]) && (e.termes[0].length < 9 || citationsDe(e).length > 10)) return;
    // déjà là comme auteur (Condorcet) : pas deux fois
    if(trouves.some(t=>t.e.genre === "auteur" && t.e.termes.some(x=>e.termes[0].includes(x)))) return;
    trouves.push({ e, lieux:defs.map(d=>({ subj:d.subj, type:d.x.type, ci:d.x.ci, si:d.x.si, label:d.x.label })) });
  });
  if(!trouves.length) return null;
  const box = el("div","deja-vu");
  box.innerHTML = `<div class="dv-tete">${ICO("lexique").replace('class="ico"','class="ico ico-in"')} Déjà vu les années d'avant</div>`;
  const MAX = 6;
  trouves.slice(0, MAX).forEach(({ e, lieux })=>{
    const r = el("div","dv-ligne");
    r.innerHTML = `<div class="dv-nom">${esc(e.nom)}<span class="dv-genre">${e.genre === "auteur" ? "auteur" : "notion"}</span></div>`;
    lieux.slice(0, 2).forEach(s=>r.appendChild(pastilleChapitre(s, e.termes.slice(0, 2))));
    if(lieux.length > 2){
      const t = el("button","dv-tout"); t.type = "button";
      t.textContent = "Tout voir dans l'index (" + lieux.length + ")";
      t.addEventListener("click",()=>{ haptic(); ouvrirIndex(e.nom, e.genre); });
      r.appendChild(t);
    }
    box.appendChild(r);
  });
  if(trouves.length > MAX){
    const t = el("div","know-more"); t.textContent = "Et " + (trouves.length - MAX) + " autres : cherche-les dans l'index."; box.appendChild(t);
  }
  return box;
}
// extrait de texte autour du 1er mot trouvé
function snippet(text, words){
  const n = normKeepLen(text);
  let pos = -1;
  for(const w of words){ const p = n.indexOf(w); if(p>=0){ pos = p; break; } }
  if(pos < 0) return text.slice(0,120);
  const start = Math.max(0, pos - 45);
  const end   = Math.min(text.length, pos + 95);
  return (start>0?"…":"") + text.slice(start,end).trim() + (end<text.length?"…":"");
}
// normalise SANS changer la longueur (indispensable pour surligner au bon endroit)
function normKeepLen(s){
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
// surligne les mots cherchés (insensible aux accents ET à la casse)
function highlight(text, words){
  const src  = String(text);
  const flat = normKeepLen(src);          // même longueur que src
  const marks = [];
  words.forEach(w=>{
    if(!w) return;
    let from = 0, p;
    while((p = flat.indexOf(w, from)) !== -1){
      marks.push([p, p + w.length]);
      from = p + w.length;
    }
  });
  if(!marks.length) return esc(src);
  marks.sort((a,b)=>a[0]-b[0]);
  const merged = [marks[0]];
  for(let i=1;i<marks.length;i++){
    const last = merged[merged.length-1];
    if(marks[i][0] <= last[1]) last[1] = Math.max(last[1], marks[i][1]);
    else merged.push(marks[i]);
  }
  let out = "", cur = 0;
  merged.forEach(([a,b])=>{
    out += esc(src.slice(cur,a)) + "<mark>" + esc(src.slice(a,b)) + "</mark>";
    cur = b;
  });
  out += esc(src.slice(cur));
  return out;
}
// ══════════════════════════════════════════════════
// LEXIQUE : les « <b>terme</b> : définition » des cours, rangés de A à Z
// ══════════════════════════════════════════════════
const LEX_RE = /^\s*<b>([^<]{2,60})<\/b>\s*(\([^)]{1,60}\)\s*)?:\s*([\s\S]{8,})$/;
// sections sur l'organisation du cours : on ne les prend pas
const LEX_SEC_EXCLUE = /pr[ée]sentation|modalit|[ée]valuation|au programme|organisation|calendrier|consigne|devoir|s[ée]ances?\b|plan du cours/i;
const LEX_TERME_EXCLU = /^([^a-zà-ÿ]|(cm|td)\b|(le|la|les|un|une|ce|ces|des|du)\s|l'|l’|(à|avant|apr[èe]s|aujourd'hui|hier|dans|pour|chez|sur|en|pendant|trois|deux|quatre|cat[ée]gorie)(?=[\s,]|$)|articulation\b|mcf\b|contexte|d[ée]finition|premier|deuxi[èe]me|second|troisi[èe]me|exemple|conclusion|introduction|bilan|enjeux?\b|objectifs?\b|limites?\b|id[ée]e|point|remarque|rappel|attention|[àa] retenir|en r[ée]sum[ée]|synth[èe]se|[ée]crit\b|oral\b|partiel|contr[ôo]le|dst\b|[ée]valuation|diversit[ée])|\?$|\b(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\b/i;
const LEX_CACHE = {};
function lexique(subj){
  if(!subj) return [];
  const sig = signatureCours(subj);
  const c = LEX_CACHE[subj.id];
  if(c && c.sig === sig) return c.out;
  const out = lexiqueCalcule(subj);
  LEX_CACHE[subj.id] = { sig, out };
  return out;
}
// Une image dans un cours : chargée seulement quand on arrive dessus, et touchée, elle s'ouvre en grand
function figureCours(im){
  const f = el("figure","cours-fig");
  const ratio = im.w && im.h ? `aspect-ratio:${im.w}/${im.h};` : "";
  f.innerHTML = `<img src="${esc(im.src)}" alt="${esc(im.alt || "")}" loading="lazy" decoding="async" style="${ratio}">` +
    (im.legende ? `<figcaption>${esc(im.legende)}</figcaption>` : "");
  f.querySelector("img").addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); ouvrirImage(im); });
  return f;
}
// ── LECTEUR DE PDF ──
// Le document s'ouvre dans l'app, par-dessus le cours : une croix pour revenir,
// un bouton pour l'enregistrer ou le partager (Fichiers, Mail, AirDrop…).
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const IC_FERMER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const IC_PARTAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/></svg>';
function carteDocument(doc){
  const a = el("a","cours-pdf"); a.href = doc.src;
  a.innerHTML = `<span class="cours-pdf-ic">PDF</span><span class="cours-pdf-t"><b>${esc(doc.nom || "Ouvrir le document")}</b><small>${esc(doc.sous || "Touche pour l'ouvrir")}</small></span>${IC_CHEV_DROITE}`;
  a.addEventListener("click", ev=>{ ev.preventDefault(); ev.stopPropagation(); haptic(); ouvrirPdf(doc); });
  return a;
}
let PDFJS_PRET = null;
function chargerPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(PDFJS_PRET) return PDFJS_PRET;
  PDFJS_PRET = new Promise((ok, ko)=>{
    const sc = document.createElement("script"); sc.src = PDFJS + "pdf.min.js";
    sc.onload = ()=>{ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(window.pdfjsLib); }catch(e){ ko(e); } };
    sc.onerror = ()=>{ PDFJS_PRET = null; ko(new Error("pdfjs")); };
    document.head.appendChild(sc);
  });
  return PDFJS_PRET;
}
function nomFichierPdf(doc){
  const base = String(doc.src || "").split("/").pop() || "document.pdf";
  return /\.pdf$/i.test(base) ? base : base + ".pdf";
}
async function partagerPdf(doc, blob){
  const nom = nomFichierPdf(doc);
  try{
    if(!blob) blob = await (await fetch(doc.src)).blob();
    const f = new File([blob], nom, { type:"application/pdf" });
    if(navigator.canShare && navigator.canShare({ files:[f] })){
      try{ await navigator.share({ files:[f], title:doc.nom || nom }); return; }
      catch(e){ if(e && e.name === "AbortError") return; }
    }
    // sans partage de fichiers : on le télécharge
    const u = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 4000);
  }catch(e){ toast("Impossible de récupérer le document."); }
}
function ouvrirPdf(doc){
  const v = el("div","pdf-voile");
  v.innerHTML = `<div class="pdf-barre"><button class="pdf-bt pdf-fermer" type="button" aria-label="Fermer">${IC_FERMER}</button><b>${esc(doc.nom || "Document")}</b>${TTS_OK ? `<button class="pdf-bt pdf-ecouter" type="button" aria-label="Écouter le document" disabled>${LEC_ICO.voix}</button>` : ""}<button class="pdf-bt pdf-partager" type="button" aria-label="Enregistrer ou partager">${IC_PARTAGE}</button></div><div class="pdf-pages"><div class="pdf-attente">Ouverture du document…</div></div>`;
  let blob = null, ferme = false, aDuTexte = false;
  const fermer = ()=>{ ferme = true; haptic();
    if(LEC.racine && v.contains(LEC.racine)) lecteurStop();
    document.body.classList.remove("pdf-ouvert");
    v.classList.remove("on"); setTimeout(()=>{ if(v._pdfFin) v._pdfFin(); v.remove(); }, 330); document.removeEventListener("keydown", echap); };
  const echap = e=>{ if(e.key === "Escape") fermer(); };
  document.addEventListener("keydown", echap);
  v.querySelector(".pdf-fermer").addEventListener("click", fermer);
  v.querySelector(".pdf-partager").addEventListener("click", ()=>{ haptic(); partagerPdf(doc, blob); });
  document.body.appendChild(v); requestAnimationFrame(()=>v.classList.add("on"));
  document.body.classList.add("pdf-ouvert");
  const zone = v.querySelector(".pdf-pages");
  // Écouter : le même lecteur que pour les cours, qui suit le texte du PDF mot à mot.
  const btEcoute = v.querySelector(".pdf-ecouter");
  if(btEcoute) btEcoute.addEventListener("click", ()=>{
    haptic();
    if(!aDuTexte){ toast("Ce PDF est une image scannée : il n'a pas de texte à lire."); return; }
    lecteurStart(zone);
  });
  (async ()=>{
    try{
      blob = await (await fetch(doc.src)).blob();
      const lib = await chargerPdfJs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      if(ferme) return;
      zone.innerHTML = "";
      // Mémoire : dessiner toutes les pages d'un coup, en ×3, fait couper l'app par iOS sur les gros PDF.
      // Chaque page est dessinée quand elle approche de l'écran, en ×2 au plus, puis gardée en image (légère, déchargeable).
      const larg = Math.min(zone.clientWidth - 20, 820), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const aDessiner = [];
      let enCours = false;
      const dessinerSuite = async ()=>{
        if(enCours) return; enCours = true;
        while(aDessiner.length && !ferme){
          const { page, vp0, pg, n } = aDessiner.shift();
          try{
            const vp = page.getViewport({ scale: (larg / vp0.width) * dpr });
            const c = document.createElement("canvas"); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
            await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
            const b = await new Promise(ok=>c.toBlob(ok, "image/jpeg", .9));
            c.width = c.height = 0;
            if(ferme || !b) break;
            const img = new Image(); img.alt = "Page " + n; img.className = "pdf-img"; img.src = URL.createObjectURL(b);
            img.onload = ()=>pg.classList.add("pret");
            pg.insertBefore(img, pg.firstChild);
            page.cleanup();
          }catch(e){}
        }
        enCours = false;
      };
      const io = "IntersectionObserver" in window ? new IntersectionObserver(es=>es.forEach(en=>{
        if(!en.isIntersecting) return;
        io.unobserve(en.target);
        aDessiner.push(en.target._pdf); aDessiner.sort((a,b)=>a.n - b.n); dessinerSuite();
      }), { root:zone, rootMargin:"1200px 0px" }) : null;
      v._pdfFin = ()=>{ if(io) io.disconnect(); v.querySelectorAll("img.pdf-img").forEach(i=>URL.revokeObjectURL(i.src)); try{ pdf.destroy(); }catch(e){} };
      for(let n = 1; n <= pdf.numPages; n++){
        if(ferme) return;
        const page = await pdf.getPage(n);
        const vp0 = page.getViewport({ scale:1 });
        const pg = el("div","pdf-page");
        pg.style.aspectRatio = vp0.width + " / " + vp0.height;
        pg.setAttribute("aria-label", "Page " + n);
        zone.appendChild(pg);
        pg._pdf = { page, vp0, pg, n };
        if(io) io.observe(pg); else { aDessiner.push(pg._pdf); dessinerSuite(); }
        // le texte de la page, invisible, posé sur l'image : c'est lui qu'on lit et qu'on surligne
        try{
          const vpc = page.getViewport({ scale: pg.clientWidth / vp0.width });
          const tl = el("div","pdf-texte");
          tl.style.setProperty("--scale-factor", vpc.scale);
          pg.appendChild(tl);
          const tc = await page.getTextContent();
          if(tc.items.some(it=>it.str && it.str.trim())) aDuTexte = true;
          const divs = [];
          await lib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vpc, textDivs: divs }).promise;
          // une fin de ligne du PDF doit séparer deux mots, même si la bibliothèque ne la marque pas
          const its = tc.items.filter(it=>it.str !== undefined);
          divs.forEach((d,i)=>{
            if(its[i] && its[i].hasEOL && !(d.nextSibling && d.nextSibling.nodeName === "BR"))
              d.after(document.createElement("br"));
          });
        }catch(e){}
      }
      if(btEcoute && !ferme) btEcoute.disabled = false;
    }catch(e){
      if(ferme) return;
      zone.innerHTML = `<div class="pdf-attente">Le document ne s'affiche pas ici sans connexion.<br>Touche le bouton en haut à droite pour l'enregistrer ou l'ouvrir ailleurs.</div>`;
    }
  })();
}
function ouvrirImage(im){
  const v = el("div","img-voile");
  v.innerHTML = `<div class="img-zoom"><img src="${esc(im.src)}" alt="${esc(im.alt || "")}"></div>${im.legende ? `<div class="img-leg">${esc(im.legende)}</div>` : ""}<button class="img-fermer" type="button" aria-label="Fermer">✕</button>`;
  const fermer = ()=>{ v.classList.remove("on"); setTimeout(()=>v.remove(), 250); };
  v.addEventListener("click", e=>{ if(e.target === v || e.target.closest(".img-fermer")) fermer(); });
  document.body.appendChild(v); requestAnimationFrame(()=>v.classList.add("on"));
}
function lexiqueCalcule(subj){
  const vus = new Set(), out = [];
  [["cm",0],["td",1]].forEach(([type,tab])=>(subj[type]||[]).forEach((ch,ci)=>(ch.sections||[]).forEach((sec,si)=>{
    if(LEX_SEC_EXCLUE.test(sec.title || "")) return;
    // les puces mêlées au texte d'un cours collé comptent comme les autres
    const dansLeTexte = [...String(sec.body || "").matchAll(/<li><span class="li-text">([\s\S]*?)<\/span><\/li>/g)].map(m=>m[1]);
    [...(sec.list||[]), ...dansLeTexte, sec.body||""].forEach(it=>{
      const m = String(it).match(LEX_RE); if(!m) return;
      const terme = m[1].trim();
      if(LEX_TERME_EXCLU.test(terme) || terme.split(/\s+/).length > 6) return;
      const k = norm(terme).trim(); if(vus.has(k)) return; vus.add(k);
      out.push({ terme, prec:(m[2]||"").trim(), def:m[3].trim(), type, tab, ci, si, label:ch.label, sec:sec.title || "" });
    });
  })));
  return out.sort((a,b)=>a.terme.localeCompare(b.terme, "fr", { sensitivity:"base" }));
}
function ouvrirLexique(){
  if(!curSubj) return;
  document.getElementById("lex-sous").textContent = (curSubj.ecue ? curSubj.ecue + " · " : "") + curSubj.title;
  document.getElementById("lex-input").value = "";
  renderLexique("");
  showScreen("lexique");
}
function renderLexique(q){
  const liste = document.getElementById("lex-liste"), lettres = document.getElementById("lex-lettres");
  liste.innerHTML = ""; lettres.innerHTML = "";
  const f = norm(q || "").trim();
  const xs = lexique(curSubj).filter(x=>!f || norm(x.terme + " " + x.def).includes(f));
  if(!xs.length){ liste.innerHTML = vide("loupe", "Aucun terme pour « " + esc(q) + " »", "Essaie un autre mot."); return; }
  const cnt = el("div","search-count"); cnt.textContent = xs.length + " terme" + (xs.length > 1 ? "s" : ""); liste.appendChild(cnt);
  let lettre = "";
  xs.forEach(x=>{
    const L = norm(x.terme).trim().charAt(0).toUpperCase();
    if(L !== lettre){
      lettre = L;
      const h = el("div","lex-lettre"); h.textContent = L; h.id = "lex-" + L; liste.appendChild(h);
      const b = el("button"); b.type = "button"; b.textContent = L;
      b.addEventListener("click",()=>{ haptic(); h.scrollIntoView({ behavior:"smooth", block:"start" }); });
      lettres.appendChild(b);
    }
    const it = el("div","lex-item");
    const pc = partiesChapitre(x.label);
    it.innerHTML = `<div class="lex-terme">${esc(x.terme)}${x.prec ? ` <span style="font-weight:400;color:var(--text-soft);font-size:14px">${esc(x.prec)}</span>` : ""}</div>
      <div class="lex-def">${texteCours(x.def)}</div>`;
    const src = el("button","lex-src"); src.type = "button";
    src.innerHTML = `${ICO(x.type === "cm" ? "cm" : "td").replace('class="ico"','class="ico ico-in"')}<span>${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre) : ""}</span>${IC_CHEV_DROITE}`;
    src.addEventListener("click",()=>{
      haptic();
      if(x.type === "cm") curCmIdx = x.ci; else curTdIdx = x.ci;
      allerDemande = { sec:x.si, mots:[norm(x.terme).trim()] };
      showScreen("split"); setTab(x.tab);
    });
    it.appendChild(src);
    liste.appendChild(it);
  });
}
// ══════════════════════════════════════════════════
// MES NOTES sur un chapitre
// ══════════════════════════════════════════════════
function blocNotes(cle){
  const box = el("div","mes-notes");
  const carte = ()=>{
    box.innerHTML = `<div class="mn-carte"><div class="mn-tete">${ICO("oq").replace('class="ico"','class="ico ico-in"')} Mes notes<span class="mn-etat"></span></div>
      <textarea rows="3" placeholder="Une remarque, une question pour le prof, un exemple…"></textarea></div>`;
    const ta = box.querySelector("textarea"), etat = box.querySelector(".mn-etat");
    const hauteur = ()=>{ ta.style.height = "auto"; ta.style.height = Math.max(72, ta.scrollHeight) + "px"; };
    ta.value = noteDe(cle);
    let t = null;
    ta.addEventListener("input",()=>{
      hauteur(); etat.textContent = "…";
      clearTimeout(t);
      t = setTimeout(()=>{
        const v = ta.value.trim();
        if(v) CHNOTES[cle] = { t:ta.value, d:Date.now() }; else delete CHNOTES[cle];
        chNotesSave(); etat.textContent = v ? "Enregistré" : "";
      }, 600);
    });
    ta.addEventListener("blur",()=>{ if(!ta.value.trim()) setTimeout(()=>{ if(document.activeElement !== ta && !ta.value.trim()) bouton(); }, 150); });
    requestAnimationFrame(hauteur);
    return ta;
  };
  const bouton = ()=>{
    box.innerHTML = "";
    const b = el("button","mn-ouvrir"); b.type = "button"; b.innerHTML = ICO("oq").replace('class="ico"','class="ico ico-in"') + "Ajouter une note";
    b.addEventListener("click",()=>{ haptic(); carte().focus(); });
    box.appendChild(b);
  };
  if(noteDe(cle)) carte(); else bouton();
  return box;
}

// ══════════════════════════════════════════════════
// TAILLE DU TEXTE des cours (sur cet appareil)
// ══════════════════════════════════════════════════
const TAILLES = { petit:0.92, normal:1, grand:1.15 };
function tailleTexte(){ let t = null; try{ t = localStorage.getItem("tailleTexte"); }catch(_){} return TAILLES[t] ? t : "normal"; }
function appliquerTaille(t){
  document.documentElement.style.setProperty("--zt", TAILLES[t] || 1);
  try{ localStorage.setItem("tailleTexte", t); }catch(_){}
}
appliquerTaille("normal");
// ══════════════════════════════════════════════════
// CHERCHER DANS LE COURS OUVERT (la loupe de l'en-tête)
// ══════════════════════════════════════════════════
let pfMarques = [], pfIdx = -1;
function ouvrirRecherchePage(){
  const head = document.querySelector("#screen-split .split-head");
  head.classList.add("cherche");
  document.getElementById("page-find").hidden = false;
  const inp = document.getElementById("pf-input");
  inp.value = ""; chercherDansPage("");
  setTimeout(()=>inp.focus(), 50);
}
function fermerRecherchePage(){
  const head = document.querySelector("#screen-split .split-head");
  if(!head || !head.classList.contains("cherche")) return;
  head.classList.remove("cherche");
  document.getElementById("page-find").hidden = true;
  document.getElementById("pf-tout").hidden = true;
  effacerMarquesPage();
  document.getElementById("pf-input").blur();
}
function effacerMarquesPage(){
  document.querySelectorAll("#screen-split .pf-wrap").forEach(w=>{
    const par = w.parentNode; if(!par) return;
    par.replaceChild(document.createTextNode(w.textContent), w); par.normalize();
  });
  pfMarques = []; pfIdx = -1;
}
function chercherDansPage(q){
  effacerMarquesPage();
  const cnt = document.getElementById("pf-count"), tout = document.getElementById("pf-tout");
  const mot = normKeepLen(String(q || "").trim());
  const pane = document.querySelector("#screen-split .pane.active");
  if(mot.length < 2 || !pane){
    cnt.textContent = ""; tout.hidden = true;
    document.getElementById("pf-prev").disabled = document.getElementById("pf-next").disabled = true;
    return;
  }
  // le texte du cours seulement : pas les boutons, ni la zone de notes, ni la fin du chapitre
  const w = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT, { acceptNode:n=>
    n.parentElement && n.parentElement.closest("button, textarea, .fin-chap, .mes-notes, script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while(w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n=>{
    const txt = n.nodeValue, flat = normKeepLen(txt);
    let p = flat.indexOf(mot); if(p < 0) return;
    // tout dans un seul <span> : un titre de section est en flex, chaque morceau deviendrait un bloc
    const frag = document.createElement("span"); frag.className = "pf-wrap"; let cur = 0;
    while(p >= 0){
      if(p > cur) frag.appendChild(document.createTextNode(txt.slice(cur, p)));
      const m = document.createElement("mark"); m.className = "pf-mark"; m.textContent = txt.slice(p, p + mot.length);
      frag.appendChild(m); pfMarques.push(m);
      cur = p + mot.length; p = flat.indexOf(mot, cur);
    }
    if(cur < txt.length) frag.appendChild(document.createTextNode(txt.slice(cur)));
    n.parentNode.replaceChild(frag, n);
  });
  document.getElementById("pf-prev").disabled = document.getElementById("pf-next").disabled = !pfMarques.length;
  tout.hidden = false;
  tout.innerHTML = (pfMarques.length ? "" : "Rien dans ce cours. ") + "<b>Chercher « " + esc(q.trim()) + " » dans tous mes cours ›</b>";
  // pendant la frappe, on surligne sans bouger la page : on y va avec Entrée ou les flèches
  pfIdx = -1;
  cnt.textContent = pfMarques.length ? pfMarques.length + " trouvé" + (pfMarques.length > 1 ? "s" : "") : "0";
}
function allerOccurrence(d){
  if(!pfMarques.length) return;
  if(pfIdx >= 0) pfMarques[pfIdx].classList.remove("cur");
  pfIdx = (pfIdx + d + pfMarques.length) % pfMarques.length;
  const m = pfMarques[pfIdx]; m.classList.add("cur");
  document.getElementById("pf-count").textContent = (pfIdx + 1) + "/" + pfMarques.length;
  const h = document.querySelector("#screen-split .split-head").offsetHeight;
  window.scrollTo({ top:m.getBoundingClientRect().top + window.scrollY - h - 90, behavior:"smooth" });
}
var rechercheDepuis = "semestres";
function openSearch(depuis){
  rechercheDepuis = depuis === "split" ? "split" : "semestres";
  resolveAllLangs();             // titres/contenus dans la bonne langue selon le thème
  // les deux index ne sont refaits que si les cours ont changé depuis
  const sg = sigContenu();
  if(!SEARCH_INDEX || SEARCH_SIG !== sg){ SEARCH_INDEX = buildIndex(); SEARCH_SIG = sg; }
  indexAJour();
  const inp = document.getElementById("search-input");
  inp.value = "";
  doSearch("");
  showScreen("search");
  setTimeout(()=>inp.focus(), 300);
}

// ══════════════════════════════════════════════════
// EMPLOI DU TEMPS (iCal U-PEC)
// ══════════════════════════════════════════════════
let EDT = [];            // événements analysés
let edtState = "idle";   // idle | loading | ok | error

// Le serveur de la fac n'autorise probablement pas la lecture directe (CORS).
// On tente en direct, puis via un relais public si ça échoue.
let edtDiag = "";   // trace de diagnostic (visible dans l'écran EDT)

// Un vrai fichier calendrier commence par BEGIN:VCALENDAR (pas du HTML)
function looksLikeICS(t){
  const head = t.slice(0, 400).trim();
  if(/<!doctype|<html|<script/i.test(head)) return false;
  return /^BEGIN:VCALENDAR/m.test(head);
}

// fetch avec limite de temps (sinon un relais muet bloque tout indéfiniment)
function fetchT(url, ms, opts){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms || 10000);
  return fetch(url, Object.assign({ signal: ctl.signal }, opts||{})).finally(()=>clearTimeout(t));
}

const EDT_CHAN_KEY = "revision_edt_chan_v1";   // canal qui a marché la dernière fois

async function fetchICS(url){
  const tries = [];
  // Tous les canaux possibles : direct + relais. Notre relais Supabase d'abord.
  const channels = [
    { name:"notre relais", url:u=>SUPA_URL+"/functions/v1/"+EDT_FN_NAME+"?url="+encodeURIComponent(u), tmo:25000,
      opts:{ headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+SUPA_KEY } } },
    { name:"direct",  url:u=>u },
    { name:"relais A", url:u=>"https://api.allorigins.win/raw?url="+encodeURIComponent(u) },
    { name:"relais B", url:u=>"https://corsproxy.io/?"+encodeURIComponent(u) },
    { name:"relais C", url:u=>"https://api.codetabs.com/v1/proxy?quest="+encodeURIComponent(u) }
  ];
  // le canal gagnant de la dernière fois passe devant : une seule requête dans le cas normal
  let last = null; try{ last = localStorage.getItem(EDT_CHAN_KEY); }catch(e){}
  if(last){
    const i = channels.findIndex(c=>c.name===last);
    if(i > 0) channels.unshift(channels.splice(i,1)[0]);
  }
  for(const ch of channels){
    try{
      const r = await fetchT(ch.url(url), ch.tmo || 15000, ch.opts);
      const t = await r.text();
      tries.push(ch.name+":"+r.status+" ("+t.length+"o)");
      if(r.ok && looksLikeICS(t)){
        try{ localStorage.setItem(EDT_CHAN_KEY, ch.name); }catch(e){}
        edtDiag = tries.join(" | ");
        return t;
      }
    }catch(e){ tries.push(ch.name+":"+(e.name==="AbortError"?"délai dépassé":"bloqué")); }
  }
  edtDiag = tries.join(" | ");
  try{ localStorage.removeItem(EDT_CHAN_KEY); }catch(e){}   // on repart de zéro la prochaine fois
  throw new Error("aucune source disponible");
}

// Analyse d'un fichier iCal → liste d'événements
function parseICS(txt){
  // recolle les lignes longues coupées (continuation par espace/tabulation),
  // quel que soit le style de retour à la ligne (\r\n, \n ou \r)
  const unfolded = txt.replace(/\r\n[ \t]/g,"").replace(/\n[ \t]/g,"").replace(/\r[ \t]/g,"");
  const lines = unfolded.split(/\r\n|\n|\r/);
  const out = [];
  let cur = null;
  lines.forEach(raw=>{
    const line = raw.trim();
    const up = line.toUpperCase();
    if(up.startsWith("BEGIN:VEVENT")){ cur = {}; return; }
    if(up.startsWith("END:VEVENT")){
      if(cur && cur.start) out.push(cur);
      cur = null; return;
    }
    if(!cur) return;
    const i = line.indexOf(":");
    if(i < 0) return;
    const keyRaw = line.slice(0, i);
    const val    = line.slice(i + 1);
    const key    = keyRaw.split(";")[0].toUpperCase().trim();
    if(key === "DTSTART")      cur.start = icsDate(val);
    else if(key === "DTEND")   cur.end   = icsDate(val);
    else if(key === "SUMMARY") cur.title = icsText(val);
    else if(key === "LOCATION")cur.place = icsText(val);
    else if(key === "DESCRIPTION") cur.desc = icsText(val);
  });
  return out.filter(e=>e.start).sort((a,b)=>a.start-b.start);
}
// "20260115T083000Z" ou "20260115T083000" → Date
function icsDate(v){
  const m = v.match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?(Z)?/);
  if(!m) return null;
  const [,Y,M,D,h,mi,s,z] = m;
  if(z) return new Date(Date.UTC(+Y, +M-1, +D, +(h||0), +(mi||0), +(s||0)));
  return new Date(+Y, +M-1, +D, +(h||0), +(mi||0), +(s||0));
}
function icsText(v){
  return v.replace(/\\n/g,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\").trim();
}

// Charge l'EDT du thème actif (avec cache local pour le hors-ligne)
async function loadEDT(force){
  // L'emploi du temps appartient à une personne (pseudo), pas à un thème :
  // quelqu'un d'autre qui choisit le rose ne doit pas voir le planning de Nana.
  const who  = isCiva() ? "purple" : isNana() ? "girly" : null;
  const cals = edtCalendars();
  // la clé de cache suit la liste : ajouter ou retirer un calendrier repart d'une page blanche
  const theme = cals.length && cals[0].id !== "theme"
    ? "u:" + (whoAmI()||"?") + "|" + cals.map(c=>c.id).join(",")
    : (who || "none");
  if(!cals.length){
    EDT = [];
    // un planning saisi à la main suffit à faire vivre l'écran
    edtState = planning().cours.length ? "ok" : "none";
    return;
  }

  // cache : on affiche IMMÉDIATEMENT ce qu'on a (même ancien), pour ne jamais faire attendre.
  // S'il date de plus de 6 h, on rafraîchit discrètement en arrière-plan.
  if(!force){
    try{
      const c = JSON.parse(localStorage.getItem(EDT_CACHE_KEY) || "null");
      if(c && c.theme === theme && (c.events||[]).length){
        EDT = c.events.map(e=>({...e, start:new Date(e.start), end:e.end?new Date(e.end):null}));
        edtState = "ok";
        if((Date.now() - c.at) >= 6*3600*1000){
          // version datée : mise à jour silencieuse, puis ré-affichage
          setTimeout(async ()=>{
            await loadEDT(true);
            if(edtState === "ok"){
              renderTodayCourses();
              const scr = document.getElementById("screen-edt");
              if(scr && scr.classList.contains("active")) renderEDT();
            }
          }, 50);
        }
        return;
      }
    }catch(e){}
  }

  edtState = "loading";
  try{
    // Chaque calendrier est chargé séparément, puis tout est fusionné.
    // Un calendrier en panne ne doit pas faire tomber les autres.
    let merged = [], allDiags = [], okCount = 0;
    for(const c of cals){
      try{
        const t = await fetchICS(c.url);
        const evs = parseICS(t);
        evs.forEach(e=>{ e.cal = c.id; e.calLabel = c.label; });
        merged = merged.concat(evs);
        okCount++;
        allDiags.push(c.label + ": " + evs.length + " cours");
      }catch(e){
        allDiags.push(c.label + ": échec (" + edtDiag + ")");
      }
    }
    edtDiag = "[" + theme + "] " + allDiags.join(" ‖ ");
    if(!okCount) throw new Error("aucune source disponible");

    // Deux calendriers peuvent contenir le même créneau : on ne le garde qu'une fois.
    const vus = new Set();
    EDT = merged.filter(e=>{
      const k = (e.start ? e.start.getTime() : 0) + "|" + (e.title||"");
      if(vus.has(k)) return false;
      vus.add(k); return true;
    }).sort((a,b)=>a.start - b.start);
    edtDiag += " | total lus:" + EDT.length;
    edtState = "ok";
    try{
      if(EDT.length) localStorage.setItem(EDT_CACHE_KEY, JSON.stringify({
        theme, at: Date.now(),
        events: EDT.map(e=>({...e, start:e.start.toISOString(), end:e.end?e.end.toISOString():null}))
      }));
    }catch(e){}
  }catch(e){
    // échec : on tente de servir le cache même périmé
    try{
      const c = JSON.parse(localStorage.getItem(EDT_CACHE_KEY) || "null");
      if(c && c.theme === theme && (c.events||[]).length){
        EDT = c.events.map(e=>({...e, start:new Date(e.start), end:e.end?new Date(e.end):null}));
        edtState = "stale";
        return;
      }
    }catch(e2){}
    EDT = []; edtState = "error";
  }
}

// ── Helpers de dates ──
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
// ══════════════════════════════════════════════════
// PLANNING MANUEL : pour qui n'a pas de lien iCal
// { ab:bool, ancre:"AAAA-MM-JJ", cours:[{id,jour,debut,fin,titre,salle,semaine}] }
// jour : 1 lundi … 7 dimanche · semaine : "A" | "B" | "AB"
// ══════════════════════════════════════════════════
function planning(){
  if(!USER_SETTINGS.planning || typeof USER_SETTINGS.planning !== "object"){
    USER_SETTINGS.planning = { ab:false, ancre:null, cours:[] };
  }
  if(!Array.isArray(USER_SETTINGS.planning.cours)) USER_SETTINGS.planning.cours = [];
  return USER_SETTINGS.planning;
}
function lundiDe(d){
  const x = new Date(d); x.setHours(0,0,0,0);
  const j = x.getDay() === 0 ? 7 : x.getDay();
  x.setDate(x.getDate() - (j - 1));
  return x;
}
// A ou B, compté en semaines pleines depuis la semaine de référence.
function semaineDe(date){
  const p = planning();
  if(!p.ab || !p.ancre) return "A";
  const diff = Math.round((lundiDe(date) - lundiDe(new Date(p.ancre))) / 604800000);
  return (((diff % 2) + 2) % 2) === 0 ? "A" : "B";
}
// Les créneaux manuels d'un jour donné, fabriqués à la volée.
function coursManuelsDu(date){
  const p = planning();
  if(!p.cours.length) return [];
  const jour = date.getDay() === 0 ? 7 : date.getDay();
  const sem  = semaineDe(date);
  return p.cours
    .filter(c=>Number(c.jour) === jour && (c.semaine === "AB" || !p.ab || c.semaine === sem))
    .map(c=>{
      const [h1,m1] = String(c.debut||"08:00").split(":").map(Number);
      const [h2,m2] = String(c.fin||c.debut||"09:00").split(":").map(Number);
      const s = new Date(date); s.setHours(h1||0, m1||0, 0, 0);
      const e = new Date(date); e.setHours(h2||0, m2||0, 0, 0);
      return { title:c.titre || "Cours", place:c.salle || "", start:s, end:e, manuel:true, cid:c.id };
    });
}

// Les devoirs d'un jour qui ne dépendent d'aucun cours, rangés sous « jour|AAAA-MM-JJ|id ».
// Leur nom : la matière liée, sinon la première ligne de la note.
function premiereLigne(t){ return String(t || "").trim().split("\n")[0].trim().slice(0, 80); }
function nomDevoirJour(N, sj){ return sj ? sj.title : (premiereLigne(N.note) || N.titre || TAG_DEVOIR[N.type || ""] || "Devoir"); }
function echeanceEv(k){
  const N = EDTNOTES[k] || {}, iso = k.split("|")[1];
  const sj = N.subj ? SUBJECTS.find(x=>x.id === N.subj) : null;
  const title = nomDevoirJour(N, sj);
  const h = /^\d{2}:\d{2}$/.test(N.heure || "") ? N.heure : "", f = h && /^\d{2}:\d{2}$/.test(N.fin || "") ? N.fin : "";
  return { jour:true, cle:k, iso, title, titreNote:!sj && title === premiereLigne(N.note), aHeure:!!h,
           start:new Date(iso + "T" + (h || "00:00") + ":00"), end:f ? new Date(iso + "T" + f + ":00") : null };
}
function echeancesDu(date){
  const iso = jourIso(date);
  return Object.keys(EDTNOTES).filter(k=>k.startsWith("jour|" + iso + "|")).filter(k=>{
    const N = EDTNOTES[k]; return N && (N.type || String(N.note || "").trim() || autresDe(N).length);
  }).map(echeanceEv);
}
// un jour de l'agenda : ses dates limites d'abord, puis ses cours
function joursOn(date){ return echeancesDu(date).concat(eventsOn(date)).sort((a,b)=>a.start - b.start); }
function nouvelleEcheance(opts){
  const d = new Date(); d.setDate(d.getDate() + 1);
  const k = "jour|" + jourIso(d) + "|" + Math.random().toString(36).slice(2, 9);
  openEvSheet(echeanceEv(k), Object.assign({ type:"devoir" }, opts || {}));
}
function eventsOn(date){
  return EDT.filter(e=>sameDay(e.start,date))
    .concat(coursManuelsDu(date))
    .sort((a,b)=>a.start - b.start);
}
function hhmm(d){ return d ? String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0") : ""; }
const JOURS = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const MOIS  = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

// ── Affichage de l'emploi du temps ──
let edtWeekOffset = 0;   // 0 = semaine (ou jour) en cours
const EDTMODE_KEY = "revision_edt_mode_v1";
// le mode (semaine / jour) est mémorisé : on retrouve l'app comme on l'a laissée
let edtMode = (()=>{ try{ const m = localStorage.getItem(EDTMODE_KEY); return (m==="day"||m==="week") ? m : "week"; }catch(e){ return "week"; } })();
function setEdtMode(m){
  edtMode = m;
  try{ localStorage.setItem(EDTMODE_KEY, m); }catch(e){}
}

function mondayOf(d){
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;     // lundi = 0
  x.setDate(x.getDate() - day);
  x.setHours(0,0,0,0);
  return x;
}
// Calcule l'écart en semaines entre la semaine en cours et celle du prochain cours.
// Utile hors période : sans ça, on ouvre sur une semaine vide (vacances).
function firstWeekWithCourses(){
  if(!EDT.length) return 0;
  const thisMonday = mondayOf(new Date());
  const now = new Date();
  // le prochain cours à venir, sinon le dernier passé
  const next = EDT.find(e=>e.start >= now) || EDT[EDT.length-1];
  if(!next) return 0;
  const targetMonday = mondayOf(next.start);
  return Math.round((targetMonday - thisMonday) / (7*24*3600*1000));
}
// Ouvre l'emploi du temps directement sur la date d'un cours annoté.
// Respecte le mode en cours (jour ou semaine).
async function openEDTAt(date){
  document.querySelectorAll("#edt-seg .seg-opt").forEach(b=>
    b.classList.toggle("active", b.dataset.mode === edtMode));
  showScreen("edt");
  document.getElementById("edt-body").innerHTML = `<div class="edt-loading">Chargement de ton emploi du temps…</div>`;
  await loadEDT();
  const t0 = new Date(); t0.setHours(0,0,0,0);
  const t1 = new Date(date); t1.setHours(0,0,0,0);
  if(edtMode === "day"){
    edtWeekOffset = Math.round((t1 - t0) / 86400000);
  } else {
    const w0 = mondayOf(new Date()); w0.setHours(0,0,0,0);
    const w1 = mondayOf(new Date(date)); w1.setHours(0,0,0,0);
    edtWeekOffset = Math.round((w1 - w0) / (7*86400000));
  }
  renderEDT();
}

async function openEDT(){
  edtWeekOffset = 0;
  // le segment reflète le mode mémorisé
  document.querySelectorAll("#edt-seg .seg-opt").forEach(b=>
    b.classList.toggle("active", b.dataset.mode === edtMode));
  showScreen("edt");
  document.getElementById("edt-body").innerHTML = `<div class="edt-loading">Chargement de ton emploi du temps…</div>`;
  await loadEDT();
  // si la période en cours est vide, on va directement au prochain cours
  if(edtMode === "day"){
    if(!eventsOn(new Date()).length){
      const now = new Date();
      const next = EDT.find(e=>e.start >= now);
      if(next){
        const t0 = new Date(); t0.setHours(0,0,0,0);
        const t1 = new Date(next.start); t1.setHours(0,0,0,0);
        edtWeekOffset = Math.round((t1-t0)/86400000);
      }
    }
  } else if(!eventsOnWeek(0).length){
    edtWeekOffset = firstWeekWithCourses();
  }
  renderEDT();
}
// événements d'une semaine donnée (offset en semaines par rapport à celle en cours)
function eventsOnWeek(offset){
  const start = mondayOf(new Date());
  start.setDate(start.getDate() + offset*7);
  const end = new Date(start); end.setDate(end.getDate()+7);
  return EDT.filter(e=>e.start >= start && e.start < end);
}
function renderEDT(){
  try{ setTimeout(majHdSemaine, 0); }catch(e){}
  const body = document.getElementById("edt-body");
  const label= document.getElementById("edt-week");
  body.innerHTML = "";

  if(edtState === "none"){
    label.textContent = "";
    body.innerHTML = vide("calendrier", "Aucun calendrier", "Colle le lien de ton emploi du temps pour voir tes cours ici. Sur l'ENT de ta fac, cherche « exporter », « s'abonner » ou « iCal ».",
      `<button class="btn" id="edt-import">Ajouter un calendrier</button>`);
    document.getElementById("edt-import").addEventListener("click",()=>{ haptic(); openCalSheet(); });
    return;
  }
  if(edtState === "error"){
    label.textContent = "";
    body.innerHTML = vide("alerte", "Emploi du temps indisponible", "Vérifie ta connexion, ou réessaie plus tard.",
      `<button class="btn" id="edt-retry">Réessayer</button>${edtDiag ? `<details class="edt-diag-d"><summary>Détails techniques</summary><span class="edt-diag">${esc(edtDiag)}</span></details>` : ""}`);
    document.getElementById("edt-retry").addEventListener("click",async()=>{
      body.innerHTML = `<div class="edt-loading">Nouvelle tentative…</div>`;
      await loadEDT(true); renderEDT();
    });
    return;
  }
  if(!EDT.length){
    label.textContent = "";
    const b = el("div");
    b.innerHTML = vide("calendrier", "Calendrier vide", "Il ne contient aucun cours pour le moment.", edtDiag ? `<details class="edt-diag-d"><summary>Détails techniques</summary><span class="edt-diag">${esc(edtDiag)}</span></details>` : "");
    body.appendChild(b);
    return;
  }

  if(edtState === "stale"){
    const w = el("div","edt-stale");
    w.textContent = "Version enregistrée (pas de connexion au serveur)";
    body.appendChild(w);
  }

  const today = new Date();
  // ── VUE JOUR ──
  if(edtMode === "day"){
    const d = new Date(today); d.setDate(today.getDate() + edtWeekOffset);
    label.textContent = JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()];
    const evs = joursOn(d);
    if(!evs.length){
      const box = el("div");
      const next = EDT.find(e=>e.start >= new Date(d.getFullYear(),d.getMonth(),d.getDate()));
      if(next){
        const nd = next.start;
        box.innerHTML = vide("calendrier", "Pas de cours ce jour-là", `Prochain : ${JOURS[nd.getDay()].toLowerCase()} ${nd.getDate()} ${MOIS[nd.getMonth()]}`,
          `<button class="btn" id="edt-jump">Y aller</button>`);
        body.appendChild(box);
        document.getElementById("edt-jump").addEventListener("click",()=>{
          haptic();
          const t0 = new Date(); t0.setHours(0,0,0,0);
          const t1 = new Date(nd); t1.setHours(0,0,0,0);
          edtWeekOffset = Math.round((t1-t0)/86400000);
          renderEDT();
        });
      } else {
        box.innerHTML = vide("calendrier", "Pas de cours ce jour-là", "");
        body.appendChild(box);
      }
      return;
    }
    const day = el("div","edt-day");
    const isToday = sameDay(d, today);
    day.innerHTML = `<div class="edt-day-head${isToday?" today":""}">
        <span class="edt-day-name">${JOURS[d.getDay()]}</span>
        <span class="edt-day-num">${d.getDate()} ${MOIS[d.getMonth()]}</span>
        ${isToday?`<span class="edt-today-tag">aujourd'hui</span>`:``}
      </div>`;
    evs.forEach(e=>day.appendChild(courseCard(e)));
    body.appendChild(day);
    return;
  }

  // ── VUE SEMAINE ──
  const start = mondayOf(new Date());
  start.setDate(start.getDate() + edtWeekOffset*7);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const moisC = m => ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."][m];
  label.textContent = start.getMonth() === end.getMonth()
    ? start.getDate() + " au " + end.getDate() + " " + moisC(end.getMonth())
    : start.getDate() + " " + moisC(start.getMonth()) + " au " + end.getDate() + " " + moisC(end.getMonth());

  let total = 0;
  for(let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const evs = joursOn(d);
    if(!evs.length) continue;
    total += evs.length;
    const day = el("div","edt-day");
    const isToday = sameDay(d, today);
    day.innerHTML = `<div class="edt-day-head${isToday?" today":""}">
        <span class="edt-day-name">${JOURS[d.getDay()]}</span>
        <span class="edt-day-num">${d.getDate()} ${MOIS[d.getMonth()]}</span>
        ${isToday?`<span class="edt-today-tag">aujourd'hui</span>`:``}
      </div>`;
    evs.forEach(e=>day.appendChild(courseCard(e)));
    body.appendChild(day);
  }
  if(!total){
    const box = el("div");
    const now = new Date();
    const next = EDT.find(e=>e.start >= now);
    if(next){
      const d = next.start;
      box.innerHTML = vide("calendrier", "Aucun cours cette semaine", `Prochain : ${JOURS[d.getDay()].toLowerCase()} ${d.getDate()} ${MOIS[d.getMonth()]}`,
        `<button class="btn" id="edt-jump">Y aller</button>`);
      body.appendChild(box);
      document.getElementById("edt-jump").addEventListener("click",()=>{
        haptic(); edtWeekOffset = firstWeekWithCourses(); renderEDT();
      });
    } else {
      box.innerHTML = vide("calendrier", "Aucun cours cette semaine", "");
      body.appendChild(box);
    }
  }
}

// ── Sélecteur de chapitre ──
// « TD 1 · 15/09 » s'affiche « TD 1 • 15/09 » : seulement à l'écran, le libellé reste la clé.
function libelleChapitre(l){ return String(l||"").replace(/^(CM|TD)\s*(\d)/i, "$1 $2").replace(/\s*·\s*/g, " • "); }
const IC_HAUT_BAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5l5-5 5 5"/><path d="M7 14.5l5 5 5-5"/></svg>';
// « CM 1 · Qu'est-ce qu'une religion ? » : « CM 1 » dans le sélecteur, le reste en titre au-dessus du cours
function partiesChapitre(l){
  const lib = libelleChapitre(l);
  const m = lib.match(/^(.*?)\s*•\s*(.+)$/);
  if(!m) return { court:lib, titre:"" };
  const reste = m[2];
  return { court:m[1], titre:/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(reste) ? "Séance du " + reste : reste };
}
// ajouter un CM/TD : pour ceux qui écrivent leurs cours. Les miens viennent de data.js.
function ajoutChapitrePossible(){ return canEdit() && !(isCiva() && curSubj && !curSubj._own); }
function boutonChapitre(type, chapters, chIdx){
  const ch = chapters[chIdx];
  const nouveaux = chapters.filter((c,i)=>i !== chIdx && chapitreNouveau(curSubj, type, c)).length;
  const b = el("button","chap-pick" + (estRevise(curSubj, type, ch) ? " revise" : ""));
  b.type = "button";
  b.innerHTML = `<span class="rv-dot"></span><span class="chap-pick-txt">${esc(partiesChapitre(ch.label).court)}</span>` +
    (nouveaux ? `<span class="chap-pick-new">${nouveaux} nouveau${nouveaux > 1 ? "x" : ""}</span>` : "") +
    (chapters.length > 1 ? `<span class="chap-pick-nb">${chIdx + 1}/${chapters.length}</span>` : "") +
    // la liste s'ouvre aussi avec un seul chapitre quand on peut en ajouter (le + est en bas)
    (chapters.length > 1 || ajoutChapitrePossible() ? `<span class="chap-pick-ic">${IC_HAUT_BAS}</span>` : "");
  if(chapters.length > 1 || ajoutChapitrePossible()) b.addEventListener("click",()=>{ haptic(); listeChapitres(type, chapters, chIdx); });
  return b;
}
function listeChapitres(type, chapters, chIdx){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  const box = document.getElementById("pick-list");
  document.getElementById("pick-title").textContent = type === "cm" ? "Choisir un CM" : "Choisir un TD";
  box.innerHTML = "";
  chapters.forEach((c,i)=>{
    const rev = estRevise(curSubj, type, c), nouv = i !== chIdx && chapitreNouveau(curSubj, type, c);
    const nQ = exos(curSubj, "qcm").filter(x=>x && x.ch === c.label).length;
    const etat = nouv && chapitreModifie(curSubj, type, c) ? "Mis à jour" : rev ? "Lu" : nouv ? "Nouveau" : "À lire";
    const r = el("button","cal-row chap-ligne" + (i === chIdx ? " actif" : "") + (rev ? " revise" : "") + (nouv ? " nouveau" : ""));
    r.type = "button";
    r.innerHTML = `<span class="rv-dot"></span><div class="cal-txt"><div class="cal-name">${esc(libelleChapitre(c.label))}</div>
      <div class="cal-url">${etat}${nQ ? " · 1 QCM" : ""}</div></div>` +
      (i === chIdx ? `<span class="chap-ligne-ok">${COCHE_SVG}</span>` : "");
    r.addEventListener("click",()=>{
      haptic(); closePicker();
      if(i === chIdx) return;
      if(type === "cm") curCmIdx = i; else curTdIdx = i;
      fermerRecherchePage();
      reprendreDemande = true;
      renderCoursePane(type);
    });
    box.appendChild(r);
  });
  if(ajoutChapitrePossible()){
    plusFeuille(type === "cm" ? "Ajouter un CM" : "Ajouter un TD", ()=>addChapitre(type));
  }
  document.getElementById("pick-sheet").classList.add("open");
}

// ── Le prof d'un cours de l'emploi du temps ──
// Ordre : ce que j'ai saisi pour ce cours, puis le calendrier de la fac, puis la matière.
function plat(t){ return String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function cleProfCours(e){ return "edt|" + plat(titreCours(e.title)).replace(/\s+/g," ").trim(); }
function profDuCalendrier(e){
  const txt = (e.desc || "") + "\n" + (e.title || "");
  // 1. avec une étiquette : « Enseignant : Aksel Kilic »
  const m = txt.match(/(?:enseignant|intervenant|professeur|formateur|formatrice)[a-z()]*\s*:\s*([^\n]+)/i);
  const nom = m ? m[1].replace(/\s+/g," ").trim() : "";
  if(nom) return { nom, mail:"" };
  // 2. ADE (mon-edt) : une ligne « KILIC Aksel » dans la description, entre les groupes et « (Exporté le…) »
  const ade = profADE(e.desc);
  return ade ? { nom:ade, mail:"" } : null;
}
// « KILIC Aksel », « DE LA FONTAINE Marie-Anne » → « Aksel Kilic », « Marie-Anne De La Fontaine »
function profADE(desc){
  const MAJ = "A-ZÀ-ÖØ-Þ", MIN = "a-zà-öø-ÿ";
  const re = new RegExp("^([" + MAJ + "][" + MAJ + "'’-]+(?:\\s+[" + MAJ + "][" + MAJ + "'’-]+)*)\\s+([" + MAJ + "][" + MIN + "'’]+(?:[\\s-][" + MAJ + "][" + MIN + "'’]+)*)$");
  const joli = t => t.toLowerCase().replace(/(^|[\s'’-])([a-zà-öø-ÿ])/g, (x, a, b)=>a + b.toUpperCase());
  const lignes = String(desc || "").split("\n").map(l=>l.trim()).filter(Boolean)
    .filter(l=>!/^\(?\s*export/i.test(l) && !/\d/.test(l));
  for(const l of lignes){
    const mm = l.match(re);
    if(mm && mm[1].replace(/[^A-Za-zÀ-ÿ]/g,"").length >= 2) return mm[2] + " " + joli(mm[1]);
  }
  return null;
}
// la matière du site qui correspond au cours : celle que j'ai liée, sinon par son code ECUE
function matiereDuCours(e){
  const n = evNote(e);
  const choisie = e && e.jour && e.subjChoisi !== undefined ? e.subjChoisi : (n && n.subj);
  if(choisie){ const s = SUBJECTS.find(x=>x.id === choisie); if(s) return s; }
  if(e && e.jour) return null;
  const m = String(e.title||"").match(/\b(?:ECUE|UE)\s*([0-9]+(?:\.[0-9]+)*)/i);
  if(!m) return null;
  const cands = SUBJECTS.filter(x=>String(x.ecue||"").split(/\s/)[0] === m[1]);
  if(cands.length < 2) return cands[0] || null;
  // même code pour plusieurs matières : on garde celle dont le nom colle le mieux
  const mots = t=>plat(t).split(/[^a-z0-9]+/).filter(w=>w.length > 3);
  const titre = new Set(mots(e.title));
  const score = x=>mots(x.title).filter(w=>titre.has(w)).length;
  const best = cands.slice().sort((a,b)=>score(b) - score(a));
  return score(best[0]) > score(best[1]) ? best[0] : null;
}
function typeDuCours(e, sj){
  const t = String(e.title||"");
  if(/\bCM\b/.test(t)) return "cm";
  if(/\bTD\b/.test(t)) return "td";
  const cm = profDe(sj, "cm"), td = profDe(sj, "td");
  if(cm && !td) return "cm";
  if(td && !cm) return "td";
  return null;
}
function memeNom(a, b){
  const ma = plat(a).split(/[^a-z]+/).filter(w=>w.length > 1);
  const mb = new Set(plat(b).split(/[^a-z]+/).filter(w=>w.length > 1));
  return ma.length > 0 && ma.every(w=>mb.has(w));
}
function profDuCours(e){
  if(e && e.jour) return profDuJour(e);
  const k = cleProfCours(e);
  if(k in PROFS){ const p = PROFS[k]; return p && (p.nom || p.mail) ? p : null; }
  const sj = matiereDuCours(e);
  const t = sj ? typeDuCours(e, sj) : null;
  const def = t ? profDe(sj, t) : null;
  const cal = profDuCalendrier(e);
  if(cal){
    // le calendrier donne le nom ; le mail vient de la matière si c'est la même personne
    if(def && def.mail && memeNom(def.nom, cal.nom)) return Object.assign({ nom:cal.nom, mail:def.mail }, def.mail2 ? { mail2:def.mail2 } : {});
    return cal;
  }
  return def;
}
// Devoir sans cours : le prof de la matière choisie. D'abord celui déjà noté sur un de ses cours
// dans l'agenda, sinon celui de la matière (CM d'abord, puis TD).
function profDuJour(e){
  const k = cleProfCours(e);
  if(k in PROFS){ const p = PROFS[k]; if(p && (p.nom || p.mail)) return p; }
  const sj = matiereDuCours(e);
  if(!sj) return null;
  for(const ev of EDT){
    if(matiereDuCours(ev) !== sj) continue;
    const p = profDuCours(ev);
    if(p && (p.nom || p.mail)) return p;
  }
  return profDe(sj, "cm") || profDe(sj, "td") || null;
}
const IC_PROF_MINI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
// « PYR 308 · Aksel Kilic »
function lieuEtProf(e){
  const p = profDuCours(e);
  const bouts = [];
  if(e.place) bouts.push(`<span>${esc(e.place)}</span>`);
  if(p && p.nom) bouts.push(`<span class="edt-prof">${IC_PROF_MINI}${esc(p.nom)}</span>`);
  return bouts.join('<span class="edt-sep">·</span>');
}

// une carte de cours (cliquable pour l'annoter)
function courseCard(e){
  const n = evNote(e);
  // un cours peut être marqué (contrôle / à rendre) ou simplement annoté
  const aut = autresDe(n);
  const kind = n ? (n.type || ((n.note || n.subj) ? "note" : "") || (aut[0] ? aut[0].type || "note" : "")) : "";
  const maint = new Date(), enCours = !e.jour && e.start <= maint && (e.end || e.start) > maint;
  const c = el("div","edt-course" + (kind ? " flagged "+kind : "") + (n && n.done ? " done" : "") + (enCours ? " live" : ""));
  // la couleur de la matière, la même que sur l'accueil et sur sa page : la barre, une teinte légère, l'heure
  const sjC = matiereDeNote(e, n);
  if(sjC){ c.classList.add("a-mat"); c.style.setProperty("--mc", HM_HEX[hmCouleur(sjC)]); }
  const badge = (kind
    ? `<span class="ev-badge ${kind}">${kind==="controle"?"Contrôle":kind==="devoir"?"À rendre":"Note"}</span>` : "") +
    aut.filter(a=>(a.type || "note") !== kind).map(a=>`<span class="ev-badge ${a.type || "note"}">${TAG_DEVOIR[a.type || ""]}</span>`).join("") +
    (n && n.done && kind ? `<span class="ev-badge fait">✓ Fait</span>` : "") +
    (n && (n.modifie || aut.some(a=>a.modifie)) ? `<span class="ev-badge modifie">Modifié</span>` : "");
  const texte = n && n.note ? (e.titreNote ? String(n.note).trim().split("\n").slice(1).join("\n").trim() : n.note) : "";
  const note = (texte ? `<div class="edt-note">${noteAvecLiens(texte)}</div>` : "") +
    aut.map(a=>`<div class="edt-note edt-note-cls">${a.note ? noteAvecLiens(a.note) : TAG_DEVOIR[a.type || ""]}<small> · par ${esc(a.auteur || "?")}</small></div>`).join("");
  c.innerHTML = `
    <div class="edt-time">${e.jour && !e.aHeure ? `<span class="edt-jour">${ICO("calendrier")}</span>` : `<span>${hhmm(e.start)}</span><span class="edt-time-end">${hhmm(e.end)}</span>`}</div>
    <div class="edt-info">
      <div class="edt-title">${badge}${esc(nomCourt(e.title))}${enCours ? '<span class="edt-live">· en cours</span>' : ""}</div>
      ${!e.jour && lieuEtProf(e)?`<div class="edt-place">${lieuEtProf(e)}</div>`:``}
      ${note}
    </div>`;
  c.addEventListener("click", ev=>{ if(ev.target.closest("a")) return; haptic(); openEvSheet(e); });   // un lien s'ouvre, sans ouvrir la fiche
  return c;
}

// ── Feuille : annoter un créneau ──
let evEditing = null;
let EV_CHS = new Set();
function openEvSheet(e, opts){
  evEditing = e;
  const n = evNote(e) || { type:(opts && opts.type) || "", note:"", subj:"", done:false };
  EV_CHS = new Set(Array.isArray(n.chs) ? n.chs : []);
  document.getElementById("ev-title").textContent = e.jour ? (evNote(e) ? e.title : "Nouveau devoir") : e.title ? nomCourt(e.title) : "Cours";
  const d = e.start;
  document.getElementById("ev-when").textContent = e.jour
    ? "Pour un jour précis, relié ou non à une matière"
    : JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] + " · " + hhmm(e.start) + (e.end?" → "+hhmm(e.end):"");
  document.getElementById("ev-bloc-jour").hidden = !e.jour;
  if(e.jour){
    const nn = evNote(e) || {};
    document.getElementById("ev-date").value = e.iso;
    document.getElementById("ev-heure").value = nn.heure || "";
    document.getElementById("ev-fin").value = nn.fin || "";
  }

  document.querySelectorAll("#ev-types .ev-type").forEach(b=>{
    b.classList.toggle("active", (b.dataset.type||"") === (n.type||""));
  });

  // liste des matières du site
  resolveAllLangs();
  const sel = document.getElementById("ev-subj");
  sel.innerHTML = `<option value="">Aucune</option>` +
    SUBJECTS.map(x=>`<option value="${x.id}">${esc(x.ecue)} · ${esc(x.title)}</option>`).join("");
  sel.value = n.subj || "";
  document.getElementById("ev-note").value = n.note || "";
  renderEvProf(e, false);
  renderEvPartage(e, evNote(e), opts);
  document.getElementById("ev-fait").classList.toggle("on", !!n.done);
  majLiensFiche();
  majReviserFiche();
  // ouvrir la fiche, c'est avoir vu la mise à jour
  const vu = EDTNOTES[evKey(e)];
  if(vu && (vu.modifie || autresDe(vu).some(a=>a.modifie))){
    delete vu.modifie; autresDe(vu).forEach(a=>delete a.modifie); notesSave();
  }

  document.getElementById("ev-overlay").classList.add("open");
}
// Le prof du cours : sa carte avec le mail, ou les champs pour le saisir.
function renderEvProf(e, edition, focus){
  const box = document.getElementById("ev-prof");
  box.innerHTML = "";
  const p = profDuCours(e);
  if(p && !edition){
    const row = el("div","prof-row tap");
    const ini = (p.nom||"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
    // une ou deux adresses : chacune s'ouvre dans le mail en la touchant
    const lien = m => `<a class="prof-lien" href="mailto:${esc(m)}">${esc(m)}</a>`;
    row.innerHTML = `<div class="prof-av">${ini ? esc(ini) : IC_PROF_MINI}</div>
      <div class="prof-txt"><div class="prof-nom">${esc(p.nom || "Nom non renseigné")}</div>
      <div class="prof-sub">${p.mail ? lien(p.mail) : '<span class="prof-manque">+ Ajouter son mail</span>'}</div>
      ${p.mail2 ? `<div class="prof-sub">${lien(p.mail2)}</div>` : ""}</div>`;
    row.querySelectorAll(".prof-lien").forEach(a=>a.addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); }));
    if(p.mail){
      const a = el("a","prof-mail");
      // l'enveloppe écrit aux deux adresses ; toucher une adresse n'écrit qu'à elle
      a.href = "mailto:" + [p.mail, p.mail2].filter(Boolean).join(",");
      a.setAttribute("aria-label","Écrire à " + (p.nom || p.mail) + (p.mail2 ? " (les deux adresses)" : ""));
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
      a.addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); });
      row.appendChild(a);
    }
    row.addEventListener("click",()=>{ haptic(); renderEvProf(e, true, p.mail ? "nom" : "mail"); });
    box.appendChild(row);
    return;
  }
  const v = p || { nom:"", mail:"" };
  box.innerHTML = `<div class="ev-prof-champs">
      <input class="ev-select" id="ev-prof-nom" type="text" autocomplete="off" placeholder="Nom du prof">
      <input class="ev-select" id="ev-prof-mail" type="email" autocomplete="off" autocapitalize="off" placeholder="prenom.nom@u-pec.fr">
      <input class="ev-select" id="ev-prof-mail2" type="email" autocomplete="off" autocapitalize="off" placeholder="Deuxième adresse (facultatif)">
    </div>`;
  document.getElementById("ev-prof-nom").value = v.nom || "";
  document.getElementById("ev-prof-mail").value = v.mail || "";
  document.getElementById("ev-prof-mail2").value = v.mail2 || "";
  if(focus) setTimeout(()=>document.getElementById("ev-prof-" + focus).focus(), 60);
}
function majLiensFiche(){
  const box = document.getElementById("ev-liens"); if(!box) return;
  const ls = liensDe(document.getElementById("ev-note").value);
  box.innerHTML = ls.map(u=>`<a class="ev-lien" href="${esc(urlComplete(u)).replace(/"/g,"%22")}" target="_blank" rel="noopener noreferrer">↗ ${esc(libelleUrl(u))}</a>`).join("");
}
// la matière d'un créneau annoté : celle choisie, sinon celle du cours
function matiereDeNote(e, N){ return (N && N.subj && SUBJECTS.find(x=>x.id === N.subj)) || (e && !e.jour ? matiereDuCours(e) : null) || null; }
// les chapitres rattachés à un contrôle ou un rendu (vide : toute la matière)
function chapitresDeNote(sj, N){
  if(!sj || !N || !Array.isArray(N.chs) || !N.chs.length) return [];
  const out = [];
  ["cm","td"].forEach(t=>(sj[t] || []).forEach((ch, i)=>{ if(N.chs.includes(ch.label)) out.push({ type:t, i, ch }); }));
  return out;
}
function nomsChapitres(chs){
  const n = chs.map(x=>partiesChapitre(x.ch.label).court);
  return n.length > 1 ? n.slice(0, -1).join(", ") + " et " + n[n.length - 1] : n.join("");
}
function renderEvChs(){
  const box = document.getElementById("ev-chs"); if(!box || !evEditing) return;
  box.innerHTML = "";
  const type = (document.querySelector("#ev-types .ev-type.active") || {}).dataset?.type || "";
  if(type !== "controle" && type !== "devoir") return;
  const id = document.getElementById("ev-subj").value;
  const sj = (id && SUBJECTS.find(x=>x.id === id)) || (!evEditing.jour ? matiereDuCours(evEditing) : null);
  if(!sj) return;
  const chs = [...(sj.cm || []), ...(sj.td || [])];
  if(!chs.length) return;
  [...EV_CHS].forEach(l=>{ if(!chs.some(c=>c.label === l)) EV_CHS.delete(l); });
  const lab = el("div","ev-label"); lab.textContent = "Ce qui tombe"; box.appendChild(lab);
  const z = el("div","ev-chs");
  const tout = el("button","ev-ch tout" + (EV_CHS.size ? "" : " on")); tout.type = "button"; tout.textContent = "Tout";
  tout.addEventListener("click",()=>{ haptic(); EV_CHS.clear(); renderEvChs(); majReviserFiche(true); });
  z.appendChild(tout);
  chs.forEach(c=>{
    const b = el("button","ev-ch" + (EV_CHS.has(c.label) ? " on" : "")); b.type = "button";
    b.textContent = partiesChapitre(c.label).court;
    b.addEventListener("click",()=>{ haptic(); if(EV_CHS.has(c.label)) EV_CHS.delete(c.label); else EV_CHS.add(c.label); renderEvChs(); majReviserFiche(true); });
    z.appendChild(b);
  });
  box.appendChild(z);
  const h = el("div","ev-chs-aide");
  h.textContent = EV_CHS.size ? EV_CHS.size + " chapitre" + (EV_CHS.size > 1 ? "s choisis" : " choisi") + ". « Tout » si ça porte sur toute la matière." : "Toute la matière. Touche les CM et TD qui tombent pour les rattacher.";
  box.appendChild(h);
}
function majReviserFiche(sansChs){
  if(!sansChs) renderEvChs();
  const box = document.getElementById("ev-reviser"); if(!box || !evEditing) return;
  box.innerHTML = "";
  const type = (document.querySelector("#ev-types .ev-type.active") || {}).dataset?.type || "";
  if(type !== "controle") return;
  const id = document.getElementById("ev-subj").value;
  const sj = (id && SUBJECTS.find(x=>x.id === id)) || matiereDuCours(evEditing);
  if(!sj) return;
  if(EV_CHS.size){
    const e0 = evEditing, n = EV_CHS.size;
    const b = el("button","ev-reviser"); b.type = "button";
    b.innerHTML = `<span>${ICO("entrainer")}</span><span class="ev-share-t"><b>Réviser ${n > 1 ? "ces " + n + " chapitres" : "ce chapitre"}</b><small>Enregistre d'abord, puis ouvre la page du contrôle</small></span><span class="av-fl">›</span>`;
    b.addEventListener("click",()=>{ haptic(); saveEvSheet(); openControle(e0); });
    box.appendChild(b);
    return;
  }
  const b = el("button","ev-reviser"); b.type = "button";
  b.innerHTML = `<span>${ICO("entrainer")}</span><span class="ev-share-t"><b>Réviser ${esc(sj.title)}</b><small>QCM, fiches et textes à trous de la matière</small></span><span class="av-fl">›</span>`;
  b.addEventListener("click",()=>{
    haptic(); closeEvSheet();
    curSemestre = SEMESTRES[sj.id];
    openSubject(sj.id); setTab(2);
  });
  box.appendChild(b);
}
function closeEvSheet(){
  document.getElementById("ev-overlay").classList.remove("open");
  evEditing = null;
}
function saveEvSheet(){
  if(!evEditing) return;
  if(evEditing.jour){
    const iso = document.getElementById("ev-date").value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)){ toast("Choisis le jour."); return; }
    if(iso !== evEditing.iso){
      const nk = "jour|" + iso + "|" + evEditing.cle.split("|")[2];
      if(EDTNOTES[evEditing.cle]){ EDTNOTES[nk] = EDTNOTES[evEditing.cle]; delete EDTNOTES[evEditing.cle]; }
      evEditing = Object.assign({}, evEditing, { cle:nk, iso, start:new Date(iso + "T00:00:00") });
    }
  }
  const k = evKey(evEditing);
  const type = (document.querySelector("#ev-types .ev-type.active")||{}).dataset?.type || "";
  const subj = document.getElementById("ev-subj").value;
  const note = document.getElementById("ev-note").value.trim();
  // le prof : enregistré pour tous les créneaux de ce cours, seulement s'il a changé
  const champNom = document.getElementById("ev-prof-nom");
  if(champNom){
    const nom  = champNom.value.trim();
    let mail = document.getElementById("ev-prof-mail").value.trim();
    let mail2 = (document.getElementById("ev-prof-mail2") || { value:"" }).value.trim();
    const ok = m => !m || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m);
    if(!ok(mail) || !ok(mail2)){ toast("Une adresse mail n'a pas l'air complète."); return; }
    if(!mail && mail2){ mail = mail2; mail2 = ""; }        // une seule adresse : elle devient la principale
    if(mail2 === mail) mail2 = "";
    const avant = profDuCours(evEditing) || { nom:"", mail:"" };
    if(nom !== (avant.nom||"") || mail !== (avant.mail||"") || mail2 !== (avant.mail2||"")){
      PROFS[cleProfCours(evEditing)] = Object.assign({ nom, mail }, mail2 ? { mail2 } : {});
      profsSave();
    }
  }
  const prev = EDTNOTES[k] || {};
  // le lien avec un devoir de classe est gardé : c'est lui qui dit si on l'a retouché
  const garde = {};
  ["src","cls","v","base","auteur","moi","ignore","ignores","autres","titre","heure","fin"].forEach(f=>{ if(prev[f] !== undefined) garde[f] = prev[f]; });
  // les chapitres qui tombent, seulement pour un contrôle ou un rendu relié à une matière
  const sjN = (subj && SUBJECTS.find(x=>x.id === subj)) || (!evEditing.jour ? matiereDuCours(evEditing) : null);
  const chs = (type === "controle" || type === "devoir") && sjN ? [...EV_CHS].filter(l=>[...(sjN.cm || []), ...(sjN.td || [])].some(c=>c.label === l)) : [];
  if(!type && !subj && !note && !prev.src && !autresDe(prev).length){ delete EDTNOTES[k]; }
  else EDTNOTES[k] = Object.assign({ type, subj, note, done: document.getElementById("ev-fait").classList.contains("on") }, chs.length ? { chs } : {}, garde);
  // un devoir reçu qu'on vide : on le met de côté, il ne revient que s'il change
  if(!type && !note && prev.src && !prev.moi){
    const N0 = { type:"", subj, note:"", done:false };
    if(autresDe(prev).length) N0.autres = prev.autres;
    if(prev.ignores) N0.ignores = prev.ignores;
    ignorer(N0, prev.src, prev.v);
    EDTNOTES[k] = N0;
  }
  if(evEditing.jour && EDTNOTES[k]){
    const h = document.getElementById("ev-heure").value, f = document.getElementById("ev-fin").value;
    const N = EDTNOTES[k];
    if(/^\d{2}:\d{2}$/.test(h)) N.heure = h; else delete N.heure;
    if(N.heure && /^\d{2}:\d{2}$/.test(f) && f > N.heure) N.fin = f; else delete N.fin;
    evEditing = echeanceEv(k);
  }
  const e = evEditing, cid = evPartage;
  notesSave();
  closeEvSheet();
  renderEDT(); renderDashboard();
  const N = EDTNOTES[k];
  if(N && (cid || (N.moi && N.src))) partagerAnnotation(k, e, cid).then(()=>{
    if(document.documentElement.getAttribute("data-screen") === "class" && curClass) openClass(curClass);
  });
}

// ── Bloc "cours du jour" sur l'accueil ──
// Le premier cours qui n'est pas encore terminé, aujourd'hui ou les jours suivants.
// « ECUE 20.2.1 Anglais C » devient « Anglais C » : le code alourdit sans rien apprendre.
// pour l'accueil : sans le code de groupe du calendrier (« … ISEJ 1 »)
function nomCourt(t){ return titreCours(t).replace(/\s+[A-Z]{3,6}\s*\d{1,2}$/, "").trim() || titreCours(t); }
function titreCours(t){
  return String(t || "Cours")
    .replace(/^\s*(ECUE|UE)\s*[0-9]+(?:[.\-][0-9A-Za-z]+)*\s*(bis|ter|quater)?\s*[:\-–]?\s*/i, "")
    .trim() || String(t || "Cours");
}




// Le panneau se recale tout seul : à 15h30 pile, le cours suivant prend la place.
let horlogeCours = null;
function demarrerHorlogeCours(){
  if(horlogeCours) return;
  horlogeCours = setInterval(()=>{
    if(document.hidden) return;
    const scr = document.documentElement.getAttribute("data-screen");
    if(scr === "semestres"){ try{ renderAccueil(); }catch(e){} }
  }, 30000);
}

function renderTodayCourses(){
  majTuileDevoirs(pendingAlerts(true, true));
  try{ renderAccueil(); }catch(e){ console.error(e); }
  demarrerHorlogeCours();
}

// ══════════════════════════════════════════════════
// TABLEAU DE BORD (à réviser aujourd'hui)
// ══════════════════════════════════════════════════
// ── Rappels de contrôles / devoirs à venir ──

// échéances annotées encore à traiter (utilisé par le dashboard)
function pendingAlerts(tous, avecFaits){
  const now = new Date();
  // marqués (contrôle / à rendre) OU simplement annotés (note, matière liée)
  const hasSomething = e => {
    const n = evNote(e);
    return !!(n && (n.type || n.note || n.subj || autresDe(n).length));
  };
  const auj = new Date(now); auj.setHours(0,0,0,0);
  const echeances = Object.keys(EDTNOTES).filter(k=>k.startsWith("jour|")).map(echeanceEv).filter(e=>e.start >= auj);
  const all = EDT.concat(echeances)
    .filter(e => (e.jour || e.start >= now) && hasSomething(e))
    .filter(e => { const n = evNote(e); return avecFaits || !(n && n.done); })
    .sort((a,b) => a.start - b.start);
  // s'il y a des échéances proches, on ne montre que celles-là
  if(tous) return all;
  const soon = new Date(now.getTime() + 21*86400000);
  const near = all.filter(e => e.start <= soon);
  return near.length ? near : all;
}


// ── En-tête d'accueil : salutation + date ──
// ══════════════════════════════════════════════════
// ACCUEIL : bloc « À savoir » + entrée semestres
// ══════════════════════════════════════════════════

// Un cours est "nouveau" tant qu'aucune de ses cartes n'a été révisée.
const SEEN_KEY = "revision_seen_subjects_v1";
function seenSubjects(){
  try{ return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); }catch(e){ return []; }
}
function markSubjectSeen(id){
  const list = seenSubjects();
  if(!list.includes(id)){ list.push(id); try{ localStorage.setItem(SEEN_KEY, JSON.stringify(list)); }catch(e){} }
}
// « Nouveau », c'est factuel : un chapitre (CM ou TD) que je n'ai encore jamais ouvert.
// Il cesse d'être nouveau dès qu'il s'affiche à l'écran.
var VUS_KEY = "revision_chapitres_vus_v1";
var VUS = null;
function vusCharger(){
  if(VUS) return VUS;
  try{ VUS = JSON.parse(localStorage.getItem(VUS_KEY) || "null"); }catch(e){ VUS = null; }
  if(!VUS || typeof VUS !== "object"){
    // les matières ne sont pas encore chargées : on attend, sinon tout paraîtrait nouveau
    const nbChap = SUBJECTS.reduce((n,sj)=>n + (sj.cm||[]).length + (sj.td||[]).length, 0);
    if(!nbChap){ VUS = null; return {}; }
    // première fois : ce qui est déjà dans les matières que j'avais ouvertes compte comme vu,
    // pour que seuls les vrais ajouts apparaissent comme nouveaux
    VUS = {};
    const deja = seenSubjects();
    SUBJECTS.forEach(sj=>{
      if(!deja.includes(sj.id)) return;
      ["cm","td"].forEach(t=>(sj[t]||[]).forEach(ch=>{ VUS[cleVu(sj, t, ch)] = 1; }));
    });
    vusSave(false);
  }
  return VUS;
}
function vusSave(sync){ try{ localStorage.setItem(VUS_KEY, JSON.stringify(VUS)); }catch(e){} if(sync !== false) scheduleSync(); }
function cleVu(sj, type, ch){ return sj.id + "|" + type + "|" + (ch && ch.label || ""); }
function chapitreJamaisOuvert(sj, type, ch){ return !!ch && !vusCharger()[cleVu(sj, type, ch)]; }
// Un chapitre mis à jour depuis ma dernière lecture (champ maj « AAAA-MM-JJ » dans data.js) :
// on garde la date de la version lue, une plus récente rallume la pastille.
function chapitreModifie(sj, type, ch){
  if(!ch || !ch.maj) return false;
  const v = vusCharger()[cleVu(sj, type, ch)];
  return !!v && (v === 1 || String(v) < ch.maj);
}
// nouveau OU mis à jour : même pastille rose partout
function chapitreNouveau(sj, type, ch){ return chapitreJamaisOuvert(sj, type, ch) || chapitreModifie(sj, type, ch); }
function marquerVu(sj, type, ch){
  const v = vusCharger(), k = cleVu(sj, type, ch);
  if(!ch || (v[k] && !chapitreModifie(sj, type, ch))) return;
  v[k] = ch.maj || 1; vusSave();
}
// les chapitres jamais ouverts d'une matière : [{ type, idx, ch }]
function nouveauxDe(sj){
  const out = [];
  ["cm","td"].forEach(t=>(sj[t]||[]).forEach((ch,idx)=>{ if(chapitreNouveau(sj, t, ch)) out.push({ type:t, idx, ch }); }));
  return out;
}
// matières qui ont au moins un chapitre jamais ouvert
function newSubjects(){
  return SUBJECTS.filter(s => nouveauxDe(s).length > 0);
}
// ouvrir directement le premier chapitre nouveau d'une matière
function ouvrirNouveau(sj){
  const n = nouveauxDe(sj)[0];
  curSemestre = SEMESTRES[sj.id];
  openSubject(sj.id);
  if(n) ouvrirChapitre(n.type, n.idx);
}

// Le bloc « À savoir » : nouveaux cours + échéances annotées, une ligne chacun.
// Il apparaît quand il y a quelque chose, disparaît quand il n'y a rien.
// Un devoir est nouveau quand il vient d'une classe et que je ne l'ai pas encore vu,
// ou quand son auteur l'a modifié depuis : même logique que les cours de Mes semestres.
function etatDevoir(e){
  const N = evNote(e) || {}, v = clsVus().vus || {};
  const recus = [N.src && !N.moi ? N.src : null, ...autresDe(N).map(a=>a.src)].filter(Boolean);
  if(recus.some(id=>!v[id])) return "nouveau";
  if(N.modifie || autresDe(N).some(a=>a.modifie)) return "modifie";
  return "";
}
function devoirsNouveaux(alerts){ return (alerts || pendingAlerts(true, true)).filter(e=>etatDevoir(e)); }
// ouvrir Mes devoirs, c'est les voir : la pastille s'éteint
function marquerDevoirsVus(alerts){
  const v = clsVus(); v.vus = v.vus || {};
  let notes = false;
  (alerts || []).forEach(e=>{
    const N = evNote(e); if(!N) return;
    if(N.src) v.vus[N.src] = 1;
    autresDe(N).forEach(a=>{ if(a.src) v.vus[a.src] = 1; if(a.modifie){ a.modifie = false; notes = true; } });
    if(N.modifie){ N.modifie = false; notes = true; }
  });
  clsVusSave();
  if(notes) notesSave();
}
// la pastille de l'onglet Devoirs : les devoirs nouveaux (pas encore vus)
function majTuileDevoirs(alerts){
  BADGE_APP.dev = devoirsNouveaux(alerts).length; poserBadgeApp(); try{ majTabbar(); }catch(e){}
}
// le genre d'une échéance, comme sur la liste : contrôle, à rendre, ou simple note
function typeDevoir(N){
  N = N || {};
  const t = N.type || ((!N.note && autresDe(N)[0]) ? autresDe(N)[0].type : "");
  return t === "controle" ? "controle" : t === "devoir" ? "devoir" : "note";
}
function renderKnowBlock(){
  const box = document.getElementById("home-know");
  if(!box) return;
  box.innerHTML = "";
  const wrap = document.querySelector("#screen-semestres .wrap");
  if(wrap) wrap.classList.remove("home-empty");
  // contrôles, rendus et notes : une seule liste, dans l'ordre des dates.
  // Les nouveautés ne sont plus ici : une pastille sur Mes semestres les signale.
  // tout ce qui arrive. Déplié : tout. Plié : seulement le titre et sa flèche.
  const alerts = pendingAlerts(true, true);
  majTuileDevoirs(alerts);
  { const st = document.getElementById("hd-stats");
    if(st){
      const reste = alerts.filter(e=>{ const n = evNote(e) || {}; return !n.done; });
      const ty = e=>{ const n = evNote(e) || {}; return n.type || ((!n.note && autresDe(n)[0]) ? autresDe(n)[0].type : ""); };
      const nc = reste.filter(e=>ty(e) === "controle").length, nr = reste.filter(e=>ty(e) === "devoir").length;
      const pro = reste.filter(e=>ty(e) === "controle" || ty(e) === "devoir").sort((a,b)=>a.start - b.start)[0];
      const jp = pro ? hmJoursAvant(pro.start) : null;
      st.innerHTML = `<div><b>${nc}</b><small>contrôle${nc > 1 ? "s" : ""}</small></div><div><b>${nr}</b><small>rendu${nr > 1 ? "s" : ""}</small></div><div><small>prochain</small><b>${pro ? (jp <= 0 ? "auj." : "J-" + jp) : "–"}</b></div>`;
    } }
  if(!alerts.length){
    box.innerHTML = vide("calendrier", "Rien à venir", "Pose un devoir, un contrôle ou une note sur un cours de ton emploi du temps, ou touche le + en haut. Il apparaîtra ici.");
    return;
  }
  const now = new Date();
  // une carte par semaine : cette semaine, la prochaine, puis « du 9 au 15 nov. »
  let card = null, semaine = null;
  alerts.forEach(e=>{
    const l = mondayOf(e.start); l.setHours(0,0,0,0);
    if(semaine === null || l.getTime() !== semaine){
      semaine = l.getTime();
      const t = el("div","av-semaine"); t.textContent = nomSemaine(l);
      box.appendChild(t);
      card = el("div","av-carte"); box.appendChild(card);
    }
    const nn = evNote(e) || {};
    const t = nn.type || ((!nn.note && autresDe(nn)[0]) ? autresDe(nn)[0].type : "");
    const cle = t === "controle" ? "controle" : t === "devoir" ? "devoir" : "note";
    const tag = cle === "controle" ? "Contrôle" : cle === "devoir" ? "À rendre" : "Note";
    const j = Math.max(0, Math.round((new Date(e.start).setHours(0,0,0,0) - new Date(now).setHours(0,0,0,0)) / 86400000));
    const quand = j === 0 ? "aujourd'hui" : j === 1 ? "demain" : "dans " + j + " jours";
    const fait = !!nn.done;
    // ce qu'il y a à faire : le début de la note (sans répéter le nom s'il en vient déjà)
    const lignes = String(nn.note || (autresDe(nn)[0] || {}).note || "").trim().split("\n").map(x=>x.trim()).filter(Boolean);
    if(e.titreNote) lignes.shift();
    const apercu = (lignes[0] || "").replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, u=>libelleUrl(u).split("/")[0]);
    const row = el("div","av-row dv-carte " + cle + (fait ? " fait" : "")); row.setAttribute("role","button"); row.tabIndex = 0;
    const sjD = matiereDeNote(e, nn), chsD = chapitresDeNote(sjD, nn);
    const jj = j === 0 ? "Auj." : "J-" + j, jl = j === 0 ? "" : j === 1 ? "demain" : HM_JOURS[new Date(e.start).getDay()];
    row.innerHTML = `<span class="dv-j">${jj}<small>${jl}</small></span>` +
      `<span class="av-txt"><b>${esc(nomCourt(e.title))}</b><small><i>${fait ? "Fait" : tag}</i>${apercu ? " · " + esc(apercu) : ""}</small>${chsD.length ? `<span class="dv-chs">${chsD.map(x=>`<span>${esc(partiesChapitre(x.ch.label).court)}</span>`).join("")}</span>` : ""}</span>` +
      `<button type="button" class="av-fait" aria-pressed="${fait}" aria-label="${fait ? "Marquer comme pas fait" : "Marquer comme fait"}">${COCHE_SVG}</button>` +
      (etatDevoir(e) === "nouveau" ? `<span class="chap-pick-new">Nouveau</span>` : etatDevoir(e) === "modifie" ? `<span class="chap-pick-new">Modifié</span>` : `<span class="av-fl">›</span>`);
    // le rond coche ou décoche ; le reste de la ligne ouvre l'agenda à ce jour
    row.querySelector(".av-fait").addEventListener("click", ev=>{
      ev.stopPropagation(); haptic();
      marquerFait(evKey(e), !fait);
      renderKnowBlock();
    });
    row.addEventListener("click",()=>{ haptic(); if(sjD && (cle === "controle" || cle === "devoir")) openControle(e); else openEDTAt(e.start); });
    card.appendChild(row);
  });
}

// Fait / pas fait : sur l'annotation du cours (ou du jour), gardé et synchronisé avec elle
// la note de mon agenda qui porte ce devoir de classe (la mienne, reçue, ou gardée à côté)
function cleDuDevoir(itemId){
  return Object.keys(EDTNOTES).find(k=>{ const N = EDTNOTES[k]; return N && (N.src === itemId || autresDe(N).some(a=>a.src === itemId)); }) || null;
}
// « Cette semaine », « Semaine prochaine », « Semaine dernière », sinon « Du 2 au 8 nov. »
function nomSemaine(lundi, passe){
  const moisC = m => ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."][m];
  const l0 = mondayOf(new Date());
  const n = Math.round((lundi - l0) / (7 * 86400000));
  if(n === 0) return passe ? "Plus tôt cette semaine" : "Cette semaine";
  if(n === 1) return "Semaine prochaine";
  if(n === -1) return "Semaine dernière";
  const d = new Date(lundi); d.setDate(d.getDate() + 6);
  return "Du " + lundi.getDate() + (lundi.getMonth() !== d.getMonth() ? " " + moisC(lundi.getMonth()) : "") + " au " + d.getDate() + " " + moisC(d.getMonth()) +
    (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}
function marquerFait(k, fait){
  const N = EDTNOTES[k];
  if(!N) return;
  N.done = !!fait;
  notesSave();
  toast(fait ? "Marqué comme fait." : "Remis à faire.");
}

// ── Feuille Mémo (ouverte depuis l'icône du haut) ──
function openMemoSheet(){
  refreshMemoSheet();
  document.getElementById("memo-overlay").classList.add("open");
}
// re-rend le contenu de la feuille (après ajout/coche/suppression)
function refreshMemoSheet(){
  const body = document.getElementById("memo-sheet-body");
  if(!body) return;
  body.innerHTML = "";
  const t = el("div","memo2-titre"); t.textContent = "Mémo"; body.appendChild(t);
  renderMemo(body);
}
function closeMemoSheet(){
  document.getElementById("memo-overlay").classList.remove("open");
  updateMemoBadge();
}
function updateMemoBadge(){
  const b = document.getElementById("memo-badge");
  if(!b) return;
  const pend = MEMO.todos.filter(t=>!t.done).length;
  if(pend){ b.textContent = pend > 9 ? "9+" : pend; b.hidden = false; }
  else b.hidden = true;
}

// ── Mémo : tâches + notes ──

// onglet ouvert dans le mémo : « taches » ou « notes »
var memoVue = "taches";
function renderMemo(box){
  const reste = MEMO.todos.filter(t=>!t.done).length;
  const card = el("div","memo2");
  const aNote = !!(MEMO.note || "").trim();
  card.innerHTML = `
    <div class="memo2-seg">
      <button type="button" data-v="taches" class="${memoVue === "taches" ? "on" : ""}">Tâches${reste ? " · " + reste : ""}</button>
      <button type="button" data-v="notes" class="${memoVue === "notes" ? "on" : ""}">Notes${aNote && memoVue !== "notes" ? '<span class="pt"></span>' : ""}</button>
    </div>
    <div id="memo-vue-taches" ${memoVue === "taches" ? "" : "hidden"}>
      <div id="memo-orphans"></div>
      <div class="memo2-carte">
        <div class="memo-todos" id="memo-todos"></div>
        <div class="memo-add">
          <button class="memo-plus" id="memo-plus" aria-label="Ajouter">+</button>
          <input type="text" id="memo-new" placeholder="Nouvelle tâche" autocomplete="off" maxlength="120"/>
        </div>
      </div>
    </div>
    <div id="memo-vue-notes" ${memoVue === "notes" ? "" : "hidden"}>
      <textarea class="memo2-notes memo-note" id="memo-note" placeholder="Écris ce que tu veux garder sous la main…"></textarea>
    </div>`;
  box.appendChild(card);
  card.querySelectorAll(".memo2-seg button").forEach(bt=>bt.addEventListener("click",()=>{
    if(bt.dataset.v === memoVue) return;
    haptic(); memoVue = bt.dataset.v; refreshMemoSheet();
    if(memoVue === "notes") setTimeout(()=>{ const t = document.getElementById("memo-note"); if(t) t.focus(); }, 60);
  }));

  // annotations dont le cours a été déplacé/annulé
  const orphans = orphanNotes();
  const obox = card.querySelector("#memo-orphans");
  orphans.forEach(o=>{
    const d = o.when;
    const row = el("div","memo-orphan");
    row.innerHTML = `
      <div class="mo-top">
        <span class="mo-warn">⚠︎ Cours déplacé</span>
        <button class="mo-x" aria-label="Écarter">×</button>
      </div>
      <div class="mo-title">${o.note.type?`<span class="ev-badge ${o.note.type}">${o.note.type==="controle"?"Contrôle":"À rendre"}</span>`:``}${esc(o.title)}</div>
      <div class="mo-when">était prévu le ${JOURS[d.getDay()].toLowerCase()} ${d.getDate()} ${MOIS[d.getMonth()]} · ${hhmm(d)}</div>
      ${o.note.note?`<div class="mo-note">${esc(o.note.note)}</div>`:``}
      <button class="mo-keep">Le garder en tâche</button>`;
    // écarter définitivement
    row.querySelector(".mo-x").addEventListener("click",()=>{
      haptic();
      EDTNOTES[o.key] = Object.assign({}, o.note, { dismissed:true });
      notesSave(); refreshMemoSheet(); updateMemoBadge();
    });
    // convertir en tâche pour ne pas l'oublier
    row.querySelector(".mo-keep").addEventListener("click",()=>{
      haptic();
      const label = (o.note.type==="controle"?"Contrôle : ":o.note.type==="devoir"?"À rendre : ":"") +
                    o.title + (o.note.note ? " · " + o.note.note : "");
      MEMO.todos.push({ text: label, done:false });
      memoSave();
      EDTNOTES[o.key] = Object.assign({}, o.note, { dismissed:true });
      notesSave(); refreshMemoSheet(); updateMemoBadge();
    });
    obox.appendChild(row);
  });

  const list = card.querySelector("#memo-todos");
  const ordre = MEMO.todos.map((t,i)=>i).sort((a,b)=>(MEMO.todos[a].done ? 1 : 0) - (MEMO.todos[b].done ? 1 : 0));
  ordre.forEach(i=>{
    const t = MEMO.todos[i];
    const row = el("div","memo-todo" + (t.done?" done":""));
    row.innerHTML = `
      <div class="memo-slide">
        <button class="memo-check" aria-label="Cocher">${COCHE_SVG}</button>
        <span class="memo-text">${esc(t.text)}</span>
      </div>
      <button class="memo-del" aria-label="Supprimer">Supprimer</button>`;
    row.querySelector(".memo-check").addEventListener("click",()=>{
      haptic(); MEMO.todos[i].done = !MEMO.todos[i].done; memoSave(); refreshMemoSheet(); updateMemoBadge();
    });
    // suppression : pointerdown passe avant le blur d'une éventuelle édition
    row.querySelector(".memo-del").addEventListener("pointerdown", ev=>{
      ev.preventDefault(); ev.stopPropagation();
      haptic(); MEMO.todos.splice(i,1); memoSave(); refreshMemoSheet(); updateMemoBadge();
    });
    // geste iOS : glisser la ligne vers la gauche découvre "Supprimer"
    (function(){
      const slide = row.querySelector(".memo-slide");
      let x0 = null, dx = 0, moving = false;
      slide.addEventListener("touchstart", e=>{
        if(row.classList.contains("editing")) return;
        x0 = e.touches[0].clientX; dx = 0; moving = false;
        slide.style.transition = "none";
      }, {passive:true});
      slide.addEventListener("touchmove", e=>{
        if(x0 === null) return;
        dx = e.touches[0].clientX - x0;
        if(!moving && Math.abs(dx) > 6) moving = true;
        if(!moving) return;
        const open = row.classList.contains("revealed") ? -96 : 0;
        let v = open + dx;
        // résistance au-delà des bornes, comme le défilement iOS
        if(v > 0) v = v * 0.28;
        if(v < -96) v = -96 + (v + 96) * 0.28;
        slide.style.transform = "translateX(" + v + "px)";
        // le bouton apparaît progressivement pendant le geste
        const del = row.querySelector(".memo-del");
        if(del){
          const p = Math.min(1, Math.abs(v) / 96);
          del.style.opacity = p;
          del.style.transform = "translateX(" + (100 - p*100) + "%) scale(" + (0.94 + p*0.06) + ")";
        }
      }, {passive:true});
      slide.addEventListener("touchend", ()=>{
        if(x0 === null) return;
        slide.style.transition = "";
        slide.style.transform = "";
        const del = row.querySelector(".memo-del");
        if(del){ del.style.opacity = ""; del.style.transform = ""; }
        if(moving){
          const wasOpen = row.classList.contains("revealed");
          const open = (dx < -30) || (wasOpen && dx < 30);
          // une seule ligne ouverte à la fois
          list.querySelectorAll(".memo-todo.revealed").forEach(r=>r.classList.remove("revealed"));
          if(open){ row.classList.add("revealed"); haptic(); }
        }
        x0 = null;
      });
    })();
    // taper le texte : édition en place (input simple, la ligne garde sa forme)
    row.querySelector(".memo-text").addEventListener("click",()=>{
      if(row.classList.contains("editing")) return;
      if(row.classList.contains("revealed")){ row.classList.remove("revealed"); return; }
      row.classList.add("editing");
      const span = row.querySelector(".memo-text");
      const inp = el("input","memo-edit");
      inp.type = "text"; inp.value = t.text;
      span.replaceWith(inp);
      inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
      let closed = false;
      const commit = ()=>{
        if(closed) return; closed = true;
        const v = inp.value.trim();
        if(v) MEMO.todos[i].text = v; else MEMO.todos.splice(i,1);
        memoSave(); refreshMemoSheet(); updateMemoBadge();
      };
      inp.addEventListener("blur", ()=>setTimeout(commit, 120));
      inp.addEventListener("keydown", e=>{
        if(e.key === "Enter"){ e.preventDefault(); inp.blur(); }
        if(e.key === "Escape"){ closed = true; refreshMemoSheet(); updateMemoBadge(); }
      });
    });
    list.appendChild(row);
  });

  const inp = card.querySelector("#memo-new");
  const addTodo = ()=>{
    const v = inp.value.trim();
    if(!v) return;
    MEMO.todos.push({ text:v, done:false });
    memoSave(); refreshMemoSheet(); updateMemoBadge();
    // on redonne le focus pour enchaîner les ajouts
    const again = document.getElementById("memo-new");
    if(again) again.focus();
  };
  card.querySelector("#memo-plus").addEventListener("click",()=>{ haptic(); addTodo(); });
  // le clavier iOS peut masquer le champ : on le ramène dans la vue
  [inp, card.querySelector("#memo-note")].forEach(f=>{
    if(!f) return;
    f.addEventListener("focus",()=>{
      setTimeout(()=>f.scrollIntoView({ block:"center", behavior:"smooth" }), 320);
    });
  });
  inp.addEventListener("keydown",e=>{ if(e.key === "Enter"){ e.preventDefault(); addTodo(); } });

  const ta = card.querySelector("#memo-note");
  ta.value = MEMO.note || "";
  let noteTimer = null;
  ta.addEventListener("input",()=>{
    MEMO.note = ta.value;                 // en mémoire tout de suite
    clearTimeout(noteTimer);
    noteTimer = setTimeout(()=>memoSave(), 400);
  });
  ta.addEventListener("blur",()=>{        // et on force la sauvegarde en quittant
    clearTimeout(noteTimer); MEMO.note = ta.value; memoSave();
  });
}

// état déplié/replié des sections repliables de l'accueil

// applique l'état d'une section (en-tête + contenu)

// état déplié/replié de la section Important

// ancien tableau de bord : c'est maintenant le nouvel accueil qu'on redessine
function renderDashboard(){ try{ renderAccueil(); }catch(e){} }

// ══════════════════════════════════════════════════
// MATIÈRES
// ══════════════════════════════════════════════════
function makeEcueCard(s){
  const prog=getSubjectProgress(s);
  const totalQ=(s.fc?.length||0)+(s.qcm?.length||0)+(s.oq?.length||0);
  const hasContent = totalQ>0 || (s.cm&&s.cm.length) || (s.td&&s.td.length);
  const card=el("button","ecue-card");
  let status;
  const nv = nouveauxDe(s).length;
  // À jour : tous les CM et TD marqués révisés. À réviser : une partie, ou aucun.
  const chs = ["cm","td"].flatMap(t=>(s[t]||[]).map(ch=>({ t, ch })));
  const nRev = chs.filter(x=>estRevise(s, x.t, x.ch)).length;
  if(!chs.length && !hasContent) status=`<span class="ecue-status empty">À remplir</span>`;
  else if(!chs.length) status=``;
  else if(nRev === chs.length) status=`<span class="ecue-status ajour">✓ À jour</span>`;
  else {
    // un seul badge : les nouveautés d'abord, sinon où j'en suis
    const detail = nRev ? nRev + "/" + chs.length : "";
    status=`<span class="ecue-status areviser">À réviser${detail ? " · " + detail : ""}</span>`;
  }
  card.innerHTML=`
    <div class="ecue-top">
      <span class="ecue-num">${esc(s.ecue)}</span>
      <div class="ecue-info">
        <div class="ecue-name">${esc(s.title)}</div>
        <div class="ecue-meta">${s.ects ? `<span class="ecue-ects">${s.ects} ECTS</span>` : ""}${status}</div>
      </div>
      <span class="ecue-arrow">→</span>
    </div>`;
  card.addEventListener("click",()=>{ document.documentElement.dataset.mtDepuis = "subjects"; ouvrirMatiere(s.id, null, card); });
  // les chapitres ajoutés depuis la dernière visite : un bandeau rose en bas de la carte
  if(nv){
    card.classList.add("a-nouveau");
    const noms = nouveauxDe(s).map(n=>{ const pc = partiesChapitre(n.ch.label); return pc.court + (pc.titre ? " · " + pc.titre.replace(/^Séance du /, "") : ""); });
    const bd = el("div","ecue-nouveau");
    const tousMaj = nouveauxDe(s).every(n=>chapitreModifie(s, n.type, n.ch));
    bd.innerHTML = `<span>✦ ${tousMaj ? "Mis à jour" : nv === 1 ? "Nouveau" : nv + " nouveaux"} : ${esc(noms.join(", "))}</span><b>›</b>`;
    bd.addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); ouvrirNouveau(s); });
    card.appendChild(bd);
  }
  // pas de pastille posée sur la carte : elle se cognait à la flèche.
  // On glisse vers la gauche pour modifier ou supprimer.
  if(!isOwn(s)) return card;
  return swipeRow(card, [
    { label:"Modifier", doux:true, fn:()=>editMatiere(s) },
    { label:"Supprimer", fn:()=>confirmerSuppressionMatiere(s) }
  ], true);
}

// ══════════ NOUVEL ACCUEIL (2026) ══════════
// En-tête en couleur (date, bonjour, semaine), le bloc du jour (anneau, barres, série),
// les cours du jour, ce qui arrive, et les matières du semestre en cours.
const HM_COUL = ["v","b","g","y","r"];
// ══════════ ICÔNES DES MATIÈRES ══════════
// Une icône par grand thème, choisie d'après le titre : une même matière garde la même icône d'une année à l'autre.
// Sans thème reconnu : une icône du lot, d'après le titre, en évitant celles déjà prises dans le semestre.
const MAT_IC = {"socio": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"6\" r=\"2.2\"/><circle cx=\"5.5\" cy=\"16.5\" r=\"2.2\"/><circle cx=\"18.5\" cy=\"16.5\" r=\"2.2\"/><path d=\"M10.6 7.9 7 14.6M13.4 7.9l3.6 6.7M7.8 16.5h8.4\"/>", "psy": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 11a7 7 0 1 1 11 5.7V21H9v-2.5H7a2 2 0 0 1-2-2v-2l-1.5-.6L5 11z\"/><path d=\"M5 11a7 7 0 1 1 11 5.7V21M9 21v-2.5H7a2 2 0 0 1-2-2v-2l-1.5-.6L5 11\"/><path d=\"M12.5 10.5a1.2 1.2 0 1 1 1.2 1.2 2.6 2.6 0 0 1-2.6-2.6 3.8 3.8 0 0 1 7.6 0\"/>", "edu": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M2.5 9 12 4.5 21.5 9 12 13.5z\"/><path d=\"M2.5 9 12 4.5 21.5 9 12 13.5z\"/><path d=\"M6.5 11v4.5c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3V11M21.5 9v5\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"21.5\" cy=\"15.5\" r=\"1.2\"/>", "droit": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M2.5 13.5h6a3 3 0 0 1-6 0zM15.5 13.5h6a3 3 0 0 1-6 0z\"/><path d=\"M12 3.5v17M7.5 20.5h9M5 6.5h14M5.5 6.5l-3 7h6zM18.5 6.5l-3 7h6z\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"4\" r=\"1.3\"/>", "num": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"2\"/><rect x=\"3\" y=\"3\" width=\"8\" height=\"8\" rx=\"2\"/><rect x=\"13\" y=\"3\" width=\"8\" height=\"8\" rx=\"2\"/><rect x=\"3\" y=\"13\" width=\"8\" height=\"8\" rx=\"2\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M13.5 13.5l7.5 2.8-3.2 1.3-1.3 3.2z\"/>", "sante": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 6-9 11.5-9 11.5z\"/><path d=\"M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 6-9 11.5-9 11.5z\"/><path d=\"M6 12h3l1.5-3 2.5 6 1.5-3H18\"/>", "env": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4 20c0-9 6-15 16-16-1 10-7 16-16 16z\"/><path d=\"M4 20c0-9 6-15 16-16-1 10-7 16-16 16zM4 20l9-9M9 15h4M12 12V8\"/>", "rech": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"10.5\" cy=\"10.5\" r=\"7\"/><circle cx=\"10.5\" cy=\"10.5\" r=\"7\"/><path d=\"M15.5 15.5 21 21M7 12.5l2-2.5 2 1.5 2.5-3.5\"/>", "hist": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M7 7h10v12H7z\"/><path d=\"M4 6.5h16L12 3zM6 21h12M5 21h14M7 7v12M10.3 7v12M13.7 7v12M17 7v12\"/>", "eco": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"7\" r=\"4\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M12 5.5v3M2.5 15.5l3.5-2.5h5l1.5 1.5H9M21.5 15.5 18 13h-3.5M2.5 19.5h6l5-2.5 8-1.5\"/>", "com": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3 5.5a2.5 2.5 0 0 1 2.5-2.5h8A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H8l-3.5 3v-3A2.5 2.5 0 0 1 3 10.5z\"/><path d=\"M3 5.5a2.5 2.5 0 0 1 2.5-2.5h8A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H8l-3.5 3v-3A2.5 2.5 0 0 1 3 10.5zM18.5 9H19a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2v3l-3.5-3H12a2 2 0 0 1-2-2\"/><path d=\"M7 7.5h5M7 10h3\"/>", "enf": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M14 2.5 20.5 9 14 15.5 7.5 9z\"/><path d=\"M14 2.5 20.5 9 14 15.5 7.5 9zM7.5 9h13M14 2.5v13M14 15.5c-2 1.5-1 3.5-3.5 4s-3-1.5-5-.5-1.5 2-2.5 2.5\"/>", "form": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3 21v-4h5v-4h5V9h5v12z\"/><path d=\"M3 21v-4h5v-4h5V9h5v12H3M14 5.5 18.5 2 21 5\"/><path d=\"M18.5 2v4.5\"/>", "ins": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 3.5h10V21H5z\"/><path d=\"M5 21V3.5h10V21M3 21h18M15 4.5l4 1.8V19l-4 2\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12.3\" cy=\"12.5\" r=\"1.1\"/>", "prev": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z\"/><path d=\"M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6zM8.5 12l2.5 2.5 4.5-5\"/>", "grp": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"3.5\" r=\"1.8\"/><circle cx=\"20.5\" cy=\"12\" r=\"1.8\"/><circle cx=\"12\" cy=\"20.5\" r=\"1.8\"/><circle cx=\"3.5\" cy=\"12\" r=\"1.8\"/>", "anim": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"m15 3 1.8 3.8 4.2.5-3.1 2.9.8 4.1L15 12.3l-3.7 2 .8-4.1L9 7.3l4.2-.5z\"/><path d=\"m15 3 1.8 3.8 4.2.5-3.1 2.9.8 4.1L15 12.3l-3.7 2 .8-4.1L9 7.3l4.2-.5zM3 21l6-6M3 16l3.5-3.5M8 21l3.5-3.5\"/>", "dev": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"18\" cy=\"6\" r=\"3.5\"/><path d=\"M5 21V12c0-3 2-5 5-5h4.5M5 13c0-2-.5-4-2-5.5\"/><circle cx=\"18\" cy=\"6\" r=\"3.5\"/><path d=\"M16.5 6h3\"/>", "pol": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 10h14v9H5z\"/><path d=\"M3 10h18L12 4zM5 21h14M4 21h16M7 10v9M10.3 10v9M13.7 10v9M17 10v9M12 4V1.5l3 1-3 1\"/>", "globe": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3\"/>", "pro": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2.5\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2.5\"/><path d=\"M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18\"/><rect fill=\"currentColor\" stroke=\"none\" x=\"10.5\" y=\"11.5\" width=\"3\" height=\"3\" rx=\".8\"/>", "plume": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M16 3.5 20.5 8 9 19.5 3.5 20.5 4.5 15z\"/><path d=\"M16 3.5 20.5 8 9 19.5 3.5 20.5 4.5 15zM13.5 6l4.5 4.5M4.5 15l4.5 4.5\"/>", "livre": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4 4.5A1.5 1.5 0 0 1 5.5 3H12v16H5.5A1.5 1.5 0 0 0 4 20.5z\"/><path d=\"M4 20.5v-16A1.5 1.5 0 0 1 5.5 3H12v16M12 3h6.5A1.5 1.5 0 0 1 20 4.5V19M4 20.5A1.5 1.5 0 0 1 5.5 19H20v2.5H5.5A1.5 1.5 0 0 1 4 20.5zM14.5 7.5h3M14.5 10.5h3\"/>", "boussole": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M15.8 8.2 13.6 13.6 8.2 15.8 10.4 10.4z\"/><path d=\"M12 3v2M12 19v2M3 12h2M19 12h2\"/>", "puzzle": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 5h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H5v-4a2 2 0 1 0 0-4z\"/><path d=\"M5 5h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H5v-4a2 2 0 1 0 0-4z\"/>", "famille": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4.5 20v-3.5a4.5 4.5 0 0 1 9 0V20z\"/><circle cx=\"9\" cy=\"6.5\" r=\"2.7\"/><path d=\"M4.5 20v-3.5a4.5 4.5 0 0 1 9 0V20M14.5 20v-2a2.8 2.8 0 0 1 5.6 0v2\"/><circle cx=\"17.3\" cy=\"10.8\" r=\"1.9\"/>", "debat": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M4 8.5h12.5L13 5M20 15.5H7.5L11 19\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M12.6 9.8 10.8 12.6h2.4l-1.8 2.8\"/>", "oeil": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/><path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3.2\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"12\" r=\"1.2\"/>", "cycle": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v3.7h-3.7M6 21v-3.7h3.7M12 15v-3.2c0-1.4 1-2.4 2.4-2.4\"/>", "secours": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M9 3.5h6V9h5.5v6H15v5.5H9V15H3.5V9H9z\"/><path d=\"M9 3.5h6V9h5.5v6H15v5.5H9V15H3.5V9H9z\"/>", "langue": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z\"/><path d=\"M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5zM9 13l3-7 3 7M10.1 10.6h3.8\"/>", "main": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 11.5S8.5 9.3 8.5 7A2 2 0 0 1 12 5.7 2 2 0 0 1 15.5 7c0 2.3-3.5 4.5-3.5 4.5z\"/><path d=\"M12 11.5S8.5 9.3 8.5 7A2 2 0 0 1 12 5.7 2 2 0 0 1 15.5 7c0 2.3-3.5 4.5-3.5 4.5zM3 15.5l3-2h4.5a1.5 1.5 0 0 1 0 3H8M13 16.5h3l4-3a1.5 1.5 0 0 1 2 2.2l-5.5 4.8H6l-3-1\"/>", "spi": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3c2.5 3 4 5 4 7.5a4 4 0 0 1-8 0C8 8 9.5 6 12 3z\"/><path d=\"M12 3c2.5 3 4 5 4 7.5a4 4 0 0 1-8 0C8 8 9.5 6 12 3zM12 14.5v2M6 21h12M9 21v-4.5h6V21\"/>"};
const MAT_REGLES = [[/croix-rouge|secours/,"secours"],[/religion/,"spi"],[/langue/,"langue"],[/orientation|projet|parcours/,"boussole"],[/stage|milieux pro|metiers|situation de travail/,"pro"],[/inclusi|handicap/,"puzzle"],[/droit|ethique|deontolog/,"droit"],[/parentalite|famille/,"famille"],[/controverse|debat/,"debat"],[/observation|enquete/,"oeil"],[/recherche|recueil|documentaire/,"rech"],[/methodo|universitaire/,"livre"],[/expression ecrite|ecrit/,"plume"],[/communication|oral/,"com"],[/groupe/,"grp"],[/numeri|tice/,"num"],[/sante|soin/,"sante"],[/environnement|durable|ecolog/,"env"],[/economie|solidaire/,"eco"],[/insertion/,"ins"],[/prevention|risque/,"prev"],[/deviance|norme/,"dev"],[/animation|education populaire/,"anim"],[/cycle de vie|developpement/,"cycle"],[/formation|apprendre/,"form"],[/intervention|action sociale|travail social/,"main"],[/politique|dispositif/,"pol"],[/histoire|valeur/,"hist"],[/enfan|jeunesse/,"enf"],[/psycho/,"psy"],[/sociolog|socialisation/,"socio"],[/education/,"edu"],[/connaissance|monde|geopol/,"globe"]];
const titreNu = t=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function themeMatiere(s){ const t = titreNu(s.title); const r = MAT_REGLES.find(([re])=>re.test(t)); return r ? r[1] : null; }
function iconeMatiere(s){
  let k = themeMatiere(s);
  if(!k){
    const pris = new Set(SUBJECTS.filter(x=>x !== s && SEMESTRES[x.id] === SEMESTRES[s.id]).map(themeMatiere).filter(Boolean));
    const cles = Object.keys(MAT_IC), libres = cles.filter(c=>!pris.has(c)), lot = libres.length ? libres : cles;
    k = lot[hmHash(titreNu(s.title)) % lot.length];
  }
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MAT_IC[k]}</svg>`;
}
// ══════════ ICÔNES DE L'INTERFACE ══════════
// Semestres, projets, archives et rubriques : des icônes dessinées, dans le même style que celles des matières.
// Les emojis encore écrits dans les données passent par EMO_IC ; un emoji choisi à la main reste affiché tel quel.
const UI_IC = {"graine": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3.5 19.5h17v2h-17z\"/><ellipse fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"16\" rx=\"3.2\" ry=\"2.3\"/><path d=\"M3.5 19.5h17\"/><ellipse cx=\"12\" cy=\"16\" rx=\"3.2\" ry=\"2.3\"/><path d=\"M12 13.7v-2.2c0-1.4 1-2.4 2.5-2.4\"/>", "pousse": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 14c-3.2 0-5.5-2.2-5.5-5.5 3.2 0 5.5 2.2 5.5 5.5zM12 11.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5z\"/><path d=\"M3.5 20.5h17M12 20.5v-9M12 14c-3.2 0-5.5-2.2-5.5-5.5 3.2 0 5.5 2.2 5.5 5.5zM12 11.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5z\"/>", "plante": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 16c-3.2 0-5.3-2-5.3-5 3.2 0 5.3 2 5.3 5zM12 12.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5zM12 8.5c-2 0-3.3-1.3-3.3-3.3 2 0 3.3 1.3 3.3 3.3z\"/><path d=\"M3.5 20.5h17M12 20.5V5.5M12 16c-3.2 0-5.3-2-5.3-5 3.2 0 5.3 2 5.3 5zM12 12.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5zM12 8.5c-2 0-3.3-1.3-3.3-3.3 2 0 3.3 1.3 3.3 3.3z\"/>", "arbuste": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5.5 17.5a3 3 0 0 1 .8-5.9 4 4 0 0 1 7.5-1.6 3.3 3.3 0 0 1 5 2.9 2.4 2.4 0 0 1-.6 4.6z\"/><path d=\"M5.5 17.5a3 3 0 0 1 .8-5.9 4 4 0 0 1 7.5-1.6 3.3 3.3 0 0 1 5 2.9 2.4 2.4 0 0 1-.6 4.6zM3.5 21h17M9.5 17.5V21M14.5 17.5V21\"/>", "arbre": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3z\"/><path d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3zM12 21v-7.2M12 17.5l-2.5-2.2M12 16l2.3-2.2M8 21h8\"/>", "fleuri": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3z\"/><path d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3zM12 21v-7.2M8 21h8\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"9.6\" cy=\"9.2\" r=\"1.25\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"14.3\" cy=\"8.2\" r=\"1.25\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12.6\" cy=\"11.6\" r=\"1.25\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"8.6\" cy=\"12\" r=\".9\"/>", "tetecoeur": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 11a7 7 0 1 1 11 5.7V21H9v-2.5H7a2 2 0 0 1-2-2v-2l-1.5-.6L5 11z\"/><path d=\"M5 11a7 7 0 1 1 11 5.7V21M9 21v-2.5H7a2 2 0 0 1-2-2v-2l-1.5-.6L5 11\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M12.3 12.6s-3-1.9-3-3.8a1.6 1.6 0 0 1 3-.9 1.6 1.6 0 0 1 3 .9c0 1.9-3 3.8-3 3.8z\"/>", "ecole": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4 10.5h16v10H4z\"/><path d=\"M2.5 11 12 4.5l9.5 6.5M4 10v10.5M20 10v10.5M3 20.5h18M10 20.5v-4.5h4v4.5\"/><circle cx=\"12\" cy=\"10.8\" r=\"1.8\"/><path d=\"M12 10v1l.7.5\"/>", "archives": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4.5 8h15v11.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5z\"/><rect x=\"3\" y=\"3.5\" width=\"18\" height=\"4.5\" rx=\"1.2\"/><path d=\"M4.5 8v11.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V8M9.5 12h5\"/>", "projet": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 4h12l-2.5 4L17 12H5z\"/><path d=\"M5 21V4h12l-2.5 4L17 12H5\"/>", "etapes": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"4\" y=\"3.5\" width=\"16\" height=\"17.5\" rx=\"2.5\"/><rect x=\"4\" y=\"3.5\" width=\"16\" height=\"17.5\" rx=\"2.5\"/><path d=\"M7.5 8.5l1.3 1.3 2.2-2.4M13 9h3.5M7.5 14l1.3 1.3 2.2-2.4M13 14.5h3.5\"/>", "ampoule": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3z\"/><path d=\"M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3zM9 19h6M10 21.5h4M12 6.5a2.5 2.5 0 0 0-2.5 2.5\"/>", "dossier": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 11h18\"/>", "micro": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"9\" y=\"2.5\" width=\"6\" height=\"11.5\" rx=\"3\"/><rect x=\"9\" y=\"2.5\" width=\"6\" height=\"11.5\" rx=\"3\"/><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7\"/>", "regle": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3 15.5 15.5 3 21 8.5 8.5 21z\"/><path d=\"M3 15.5 15.5 3 21 8.5 8.5 21zM7 11.5l2 2M10 8.5l1.5 1.5M13 5.5l2 2M5.5 13l1.5 1.5M11.5 10l1.5 1.5\"/>", "calendrier": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/><rect fill=\"currentColor\" stroke=\"none\" x=\"7\" y=\"13\" width=\"3\" height=\"3\" rx=\".7\"/>", "chiffres": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 13h3.5v7H5zM10.3 8h3.5v12h-3.5zM15.5 4H19v16h-3.5z\"/><path d=\"M5 13h3.5v7H5zM10.3 8h3.5v12h-3.5zM15.5 4H19v16h-3.5zM3 20.5h18\"/>", "lien": "<path d=\"M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1.2-1.2\"/>", "canape": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5.5 12V8.5A2.5 2.5 0 0 1 8 6h8a2.5 2.5 0 0 1 2.5 2.5V12z\"/><path d=\"M5.5 12V8.5A2.5 2.5 0 0 1 8 6h8a2.5 2.5 0 0 1 2.5 2.5V12M3 12.5a2 2 0 0 1 4 0V15h10v-2.5a2 2 0 0 1 4 0V18H3zM5 18v2M19 18v2\"/>", "cible": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"12\" r=\"1.6\"/>", "adn": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9\"/><path d=\"M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9M9 6h6M9.5 9.5h5M9.5 14.5h5M9 18h6\"/>", "fleur": "<circle fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"10\" r=\"2\"/><path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 8a3 3 0 1 1 3-3 3 3 0 1 1 1 5.5 3 3 0 1 1-3 3.5 3 3 0 1 1-4-.5A3 3 0 1 1 8 7.5 3 3 0 0 1 12 8z\"/><path d=\"M12 7a2.7 2.7 0 1 1 2.6-3.3A2.7 2.7 0 1 1 16 9a2.7 2.7 0 1 1-2.2 4.4 2.7 2.7 0 1 1-4.5-.6A2.7 2.7 0 1 1 8.2 7 2.7 2.7 0 0 1 12 7zM12 14v7.5M12 18c-2 0-3.5-1.2-3.5-3\"/>", "reveil": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"13\" r=\"7.5\"/><circle cx=\"12\" cy=\"13\" r=\"7.5\"/><path d=\"M12 9.5V13l2.5 1.8M4 5.5 6.5 3M20 5.5 17.5 3\"/>", "page": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M6 3h8l4.5 4.5V21H6z\"/><path d=\"M6 3h8l4.5 4.5V21H6zM14 3v4.5h4.5M9 12h6M9 15.5h6\"/>", "semence": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3.5c2.3 1.9 3.3 4 3.3 6a3.3 3.3 0 0 1-6.6 0c0-2 1-4.1 3.3-6z\"/><path d=\"M12 3.5c2.3 1.9 3.3 4 3.3 6a3.3 3.3 0 0 1-6.6 0c0-2 1-4.1 3.3-6zM12 7.2v4.6M3.5 20h17M12 15.8v.6M12 17.8v.4\"/>", "terreau": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M6.8 8.5C6 12 5.5 15.5 5.5 18.2A2.8 2.8 0 0 0 8.3 21h7.4a2.8 2.8 0 0 0 2.8-2.8c0-2.7-.5-6.2-1.3-9.7z\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M7.5 8.5c.8-1.8 2.6-2.8 4.5-2.8s3.7 1 4.5 2.8z\" opacity=\".55\"/><path d=\"M6.8 8.5C6 12 5.5 15.5 5.5 18.2A2.8 2.8 0 0 0 8.3 21h7.4a2.8 2.8 0 0 0 2.8-2.8c0-2.7-.5-6.2-1.3-9.7zM5.8 8.5h12.4M12 18.6v-3M12 16.6c-1.8 0-2.9-1-2.9-2.8 1.8 0 2.9 1 2.9 2.8zM12 15.6c0-1.6 1-2.6 2.6-2.6 0 1.6-1 2.6-2.6 2.6z\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"9.5\" cy=\"4.6\" r=\".8\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"13\" cy=\"3.6\" r=\".8\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"15.2\" cy=\"5.2\" r=\".7\"/>"};
const EMO_IC = {"📋": "etapes", "💡": "ampoule", "🔍": "rech", "🧭": "boussole", "✍": "plume", "📂": "dossier", "📁": "dossier", "🗂": "archives", "🗣": "micro", "🤝": "com", "💬": "com", "📏": "regle", "🎓": "edu", "📅": "calendrier", "📊": "chiffres", "🏫": "ecole", "📚": "livre", "📖": "livre", "🔗": "lien", "🛋": "canape", "👶": "enf", "👥": "grp", "🧩": "puzzle", "🌀": "psy", "🧠": "psy", "💜": "tetecoeur", "🎯": "cible", "💼": "pro", "🔀": "debat", "🔄": "cycle", "🗺": "globe", "🌍": "globe", "🧬": "adn", "🌸": "fleur", "🌱": "pousse", "⏰": "reveil", "⏳": "reveil", "📄": "page", "✏": "plume", "🔬": "rech", "📐": "regle", "📬": "page", "📝": "plume"};
const SEM_IC = ["graine","graine","pousse","plante","arbuste","arbre","fleuri"];
function cleIcone(x){ const k = String(x || "").replace(/\ufe0f/g, "").trim(); return (UI_IC[k] || MAT_IC[k]) ? k : EMO_IC[k] || null; }
function icone(x){
  const k = cleIcone(x);
  if(!k) return esc(String(x || ""));
  return `<svg class="ico ico-ui" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${UI_IC[k] || MAT_IC[k]}</svg>`;
}
// la couleur de chaque tuile de Cours : les semestres suivent la pousse (de l'ambre de la graine au rose de l'arbre en fleurs),
// rose pour Psycho, jaune pour CPE, couleur terre pour les archives (le sac de terreau : les années passées nourrissent la plante)
const TUILE_COUL = { v:"var(--accent)", b:"var(--c-b)", g:"var(--c-g)", y:"#e09a00", r:"var(--c-r)", t:"#a8703f" };
const SEM_COUL = ["#d8a010","#d8a010","#8db31c","#2fae5a","#13a39b","#2f8ce0","#6f5ff0"];   // un tour de teinte régulier, jusqu'au violet de l'app
// avant la L1 (semestre 1 seul, ex. ICP) : la semence pas encore plantée, d'une teinte plus terreuse
function couleurSemestre(sem){ return sem < 1.5 ? "#c8742e" : SEM_COUL[Math.max(0, Math.min(6, Math.floor(sem)))]; }
function iconeSemestre(sem){ return sem < 1.5 ? "semence" : SEM_IC[Math.max(0, Math.min(6, Math.floor(sem)))]; }
// « 🌱 Dès maintenant » → « Dès maintenant » : la frise a déjà ses repères
const sansEmoji = t=>String(t || "").replace(/^(\p{Extended_Pictographic}\ufe0f?\s*)+/u, "");
function hmHash(t){ let h = 0; String(t).split("").forEach(c=>{ h = (h * 31 + c.charCodeAt(0)) | 0; }); return Math.abs(h); }
function hmCouleur(subj){ return HM_COUL[hmHash(subj.id) % HM_COUL.length]; }
const HM_HEX = { v:"var(--accent)", b:"var(--c-b)", g:"var(--c-g)", y:"var(--c-y)", r:"var(--c-r)" };
// le semestre « en cours » : le plus avancé qui a déjà des chapitres
function hmSemCourant(){
  let sem = 0;
  SUBJECTS.forEach(s=>{ const n = (s.cm||[]).length + (s.td||[]).length; const k = SEMESTRES[s.id] || 0; if(n && k > sem) sem = k; });
  return sem;
}
function hmMatieresSem(){ const sem = hmSemCourant(); return SUBJECTS.filter(s=>SEMESTRES[s.id] === sem && ((s.cm||[]).length + (s.td||[]).length)); }
// QCM de la matière : combien sont validés (les vrais QCM du cours, sans ceux du lexique)
function hmQcm(subj){
  const qs = subj.qcm || []; let ok = 0, err = 0;
  qs.forEach((q,i)=>{ const k = cardKey(subj.id, "qcm", q, i); if(estAcquise(k)) ok++; if(estErreur(k)) err++; });
  return { tot:qs.length, ok, err };
}
function hmChapitres(subj){
  let tot = 0, lus = 0;
  ["cm","td"].forEach(t=>(subj[t]||[]).forEach(ch=>{ tot++; if(estRevise(subj, t, ch)) lus++; }));
  return { tot, lus };
}
// le prochain contrôle (non fait) de chaque matière, d'après l'agenda
function hmControles(){
  const o = {};
  pendingAlerts(true, false).forEach(e=>{
    const N = evNote(e) || {};
    const sj = typeDevoir(N) === "controle" ? matiereDeNote(e, N) : null;
    if(!sj) return;
    if(!o[sj.id] || e.start < o[sj.id].start) o[sj.id] = e;
  });
  return o;
}
const HM_JOURS = ["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
function hmJoursAvant(d){ const a = new Date(d); a.setHours(0,0,0,0); return Math.round((a - today0()) / DAY); }

// ── Les jours de révision : une petite série, sans pression ──
const JOURS_KEY = "revision_jours_v1";
function joursCharger(){ try{ return JSON.parse(localStorage.getItem(JOURS_KEY) || "[]") || []; }catch(e){ return []; } }
function joursSave(l){ try{ localStorage.setItem(JOURS_KEY, JSON.stringify(l.slice(-400))); }catch(e){} }
function isoJour(t){ const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function noterJourRevision(){
  const l = joursCharger(), j = isoJour(Date.now());
  if(!l.includes(j)){ l.push(j); l.sort(); joursSave(l); }
}
// les jours connus : ceux notés, plus ceux qu'on devine dans les cartes (date de la dernière réponse)
function joursRevision(){
  const set = new Set(joursCharger());
  Object.keys(SRS).forEach(k=>{ const c = SRS[k]; if(c && c.last) set.add(isoJour(c.last)); });
  return set;
}
function hmSerie(){
  const set = joursRevision();
  const auj = isoJour(Date.now());
  const fait = set.has(auj);
  let n = 0; const d = new Date(); d.setHours(12,0,0,0);
  if(!fait) d.setDate(d.getDate() - 1);
  while(set.has(isoJour(d))){ n++; d.setDate(d.getDate() - 1); }
  const sept = []; const x = new Date(); x.setHours(12,0,0,0); x.setDate(x.getDate() - 6);
  for(let i = 0; i < 7; i++){ sept.push(set.has(isoJour(x))); x.setDate(x.getDate() + 1); }
  return { n, fait, sept };
}

// objectif du jour, au choix : 10, 25 ou 50 questions (réglage de chaque appareil)
const OBJ_KEY = "revision_objectif_v1";
// la feuille pour choisir son objectif du jour
function choisirObjectif(){
  const actuel = hmObjectif();
  const voile = el("div","obj-voile"), f = el("div","obj-feuille");
  f.innerHTML = `<div class="in"><div class="sheet-grip"></div><h3>Mon objectif du jour</h3><p>Combien de questions par jour ? Tout le reste, c'est du bonus.</p>
    <div class="obj-opts">${[[10,"Un petit tour, c'est déjà bien"],[25,"Une bonne séance"],[50,"Une grosse séance, à ton rythme"]].map(([v,t])=>`<button type="button" class="obj-opt${v === actuel ? " on" : ""}" data-v="${v}"><b>${v}</b><span>${t}</span></button>`).join("")}</div></div>`;
  const fermer = ()=>{ voile.classList.remove("on"); f.classList.remove("on"); setTimeout(()=>{ voile.remove(); f.remove(); }, 400); };
  voile.addEventListener("click", fermer);
  f.querySelectorAll(".obj-opt").forEach(b=>b.addEventListener("click",()=>{
    haptic(); try{ localStorage.setItem(OBJ_KEY, b.dataset.v); }catch(e){}
    f.querySelectorAll(".obj-opt").forEach(x=>x.classList.toggle("on", x === b));
    setTimeout(()=>{ fermer(); renderAccueil(true); }, 220);
  }));
  document.body.append(voile, f);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ voile.classList.add("on"); f.classList.add("on"); }));
}
function hmObjectif(){ let v = 25; try{ v = +localStorage.getItem(OBJ_KEY) || 25; }catch(e){} return [10,25,50].includes(v) ? v : 25; }
let HM_DERNIER = "";
function renderAccueil(anim){
  const head = document.getElementById("hm-hello"); if(!head) return;
  // les vrais boutons montent dans l'en-tête (une seule fois)
  const btns = document.getElementById("hm-btns");
  if(btns) [["btn-search","Chercher"],["btn-compte","Compte"]].forEach(([id, lbl])=>{ const x = document.getElementById(id); if(!x) return; x.dataset.lbl = lbl; if(x.parentNode !== btns) btns.appendChild(x); });
  const now = new Date();
  document.getElementById("hm-date").textContent = now.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
  const h = now.getHours();
  const nom = String(PSEUDO || "").trim();
  head.textContent = (h >= 5 && h < 18 ? "Bonjour" : "Bonsoir") + (nom ? " " + nom.charAt(0).toUpperCase() + nom.slice(1) : "");

  // la semaine : un point sous les jours qui ont des cours ou une échéance
  const week = document.getElementById("hm-week");
  const lun = mondayOf(now); lun.setHours(12,0,0,0);
  let wh = "";
  for(let i = 0; i < 7; i++){
    const d = new Date(lun); d.setDate(lun.getDate() + i);
    const plein = eventsOn(d).length > 0 || pendingAlerts(true, true).some(e=>sameDay(e.start, d));
    wh += `<button type="button" class="hm-d${sameDay(d, now) ? " on" : ""}" data-j="${d.getTime()}"><i>${d.toLocaleDateString("fr-FR",{weekday:"short"}).replace(".","")}</i><b>${d.getDate()}</b><u class="${plein ? "x" : ""}"></u></button>`;
  }
  week.innerHTML = wh;
  week.querySelectorAll(".hm-d").forEach(b=>b.addEventListener("click",()=>{ haptic(); openEDTAt(new Date(+b.dataset.j)); }));

  // ── le bloc du jour ──
  const mats = hmMatieresSem();
  let chT = 0, chL = 0, qT = 0, qO = 0, err = 0;
  mats.forEach(m=>{ const c = hmChapitres(m), q = hmQcm(m); chT += c.tot; chL += c.lus; qT += q.tot; qO += q.ok; err += q.err; });
  const t0 = today0();
  const auj = Object.keys(SRS).filter(k=>{ const c = SRS[k]; return c && c.last === t0; }).length;
  const HM_OBJECTIF = hmObjectif();
  const fait = Math.min(auj, HM_OBJECTIF);
  const serie = hmSerie();
  const pc = (a,b)=>b ? Math.round(a / b * 100) : 0;
  const ctaTxt = auj === 0 ? "Commencer mes révisions" : auj >= HM_OBJECTIF ? "Encore une série" : "Continuer mes révisions";
  const jour = `<div class="hm-jtop">
      <div class="hm-ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="62" fill="none" stroke="color-mix(in srgb,var(--accent) 13%,transparent)" stroke-width="14"/>
        <circle class="arc" cx="75" cy="75" r="62" fill="none" stroke="url(#hm-g)" stroke-width="14" stroke-linecap="round" stroke-dasharray="389.6" stroke-dashoffset="389.6" data-off="${389.6 * (1 - fait / HM_OBJECTIF)}"/>
        <defs><linearGradient id="hm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--c-r)"/></linearGradient></defs></svg>
        <div class="hm-rc"><b data-n="${fait}">${fait}</b><span>sur ${HM_OBJECTIF}</span></div></div>
      <div class="hm-side">
        ${chT ? `<div class="hm-sv"><div class="l">Chapitres lus<em>${chL}/${chT}</em></div><div class="hm-tr hm-doux-b"><i data-w="${pc(chL,chT)}" style="background:var(--c-b)"></i></div></div>` : ""}
        <div class="hm-sv"><div class="l">QCM validés<em>${pc(qO,qT)} %</em></div><div class="hm-tr hm-doux-v"><i data-w="${pc(qO,qT)}" style="background:var(--accent)"></i></div></div>
        <div class="hm-sv"><div class="l">Mes erreurs<em>${err}</em></div><div class="hm-tr hm-doux-r"><i data-w="${Math.min(100, err * 4)}" style="background:var(--c-r)"></i></div></div>
      </div></div>
    ${auj >= HM_OBJECTIF ? `<div class="hm-bravo">✓ Objectif atteint. Tout le reste, c'est du bonus.</div>` : ""}
    <button type="button" class="hm-cta hm-press" id="hm-go">${ctaTxt}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
    <div class="hm-ligne">${serie.n ? `🔥 <b>${serie.n} jour${serie.n > 1 ? "s" : ""}</b> de suite` : "Une série par jour, à ton rythme"}<span class="pt"></span><button type="button" class="hm-objbtn" id="hm-obj">objectif <b>${HM_OBJECTIF}</b> par jour ›</button></div>`;
  const boxJ = document.getElementById("hm-jour");
  const neuf = jour !== HM_DERNIER;
  if(neuf){
    HM_DERNIER = jour; boxJ.innerHTML = jour;
    document.getElementById("hm-go").addEventListener("click",()=>{ haptic(); startGlobalSession(); });
    document.getElementById("hm-obj").addEventListener("click",()=>{ haptic(); choisirObjectif(); });
    const ring = boxJ.querySelector(".hm-ring"); if(ring){ ring.style.cursor = "pointer"; ring.addEventListener("click",()=>{ haptic(); choisirObjectif(); }); }
  }
  if(neuf || anim){
    const arc = boxJ.querySelector(".arc"), num = boxJ.querySelector(".hm-rc b"), bars = boxJ.querySelectorAll(".hm-tr i");
    arc.style.transition = "none"; arc.setAttribute("stroke-dashoffset", 389.6); bars.forEach(i=>{ i.style.transition = "none"; i.style.width = 0; });
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      arc.style.transition = ""; arc.setAttribute("stroke-dashoffset", arc.dataset.off);
      bars.forEach(i=>{ i.style.transition = ""; i.style.width = i.dataset.w + "%"; });
    }));
    boxJ.querySelectorAll(".hm-sv em").forEach(em=>{
      const m = em.textContent.match(/^(\d+)(.*)$/); if(!m || !+m[1]) return;
      const fin = +m[1], reste = m[2], t0 = performance.now();
      const pas = t=>{ const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); em.textContent = Math.round(fin * e) + reste; if(k < 1 && em.isConnected) requestAnimationFrame(pas); };
      requestAnimationFrame(pas);
    });
    const cible = +num.dataset.n; let n = 0; num.textContent = 0;
    if(cible){ const pas = Math.max(1, Math.round(cible / 20)); const t = setInterval(()=>{ n = Math.min(cible, n + pas); num.textContent = n; if(n >= cible) clearInterval(t); }, 45); }
  }

  // ── les cours : aujourd'hui s'il en reste, sinon le prochain jour de cours ──
  const boxC = document.getElementById("hm-cours"); boxC.innerHTML = "";
  let jourC = null, evs = [];
  for(let j = 0; j < 8 && !evs.length; j++){
    const d = new Date(now); d.setDate(now.getDate() + j);
    evs = eventsOn(d).filter(e=>(e.end || e.start) > now);
    if(evs.length) jourC = d;
  }
  if(evs.length){
    const jj = hmJoursAvant(jourC);
    const titre = jj === 0 ? "Aujourd'hui" : jj === 1 ? "Demain" : jourC.toLocaleDateString("fr-FR",{ weekday:"long", day:"numeric" });
    const sec = el("div","hm-sec"); sec.innerHTML = `<h3>${esc(titre.charAt(0).toUpperCase() + titre.slice(1))}</h3><button type="button">Agenda</button>`;
    sec.querySelector("button").addEventListener("click",()=>{ haptic(); openEDTAt(jourC); });
    boxC.appendChild(sec);
    const card = el("div","hm-card hm-tl");
    evs.slice(0, 4).forEach(e=>{
      const N = evNote(e) || {};
      const live = e.start <= now && (e.end || e.start) > now;
      const t = String(e.title || "");
      const genre = /\bTD\b/.test(t) ? "TD" : /\bCM\b/.test(t) ? "CM" : "";
      const c = HM_COUL[hmHash(nomCourt(t)) % HM_COUL.length];
      const flag = typeDevoir(N) === "controle" && !N.done ? `<span class="hm-tag hm-doux-r">Contrôle</span>` : typeDevoir(N) === "devoir" && !N.done ? `<span class="hm-tag hm-doux-y">À rendre</span>` : genre ? `<span class="hm-tag hm-doux-${c}">${genre}</span>` : "";
      const b = el("button","hm-slot"); b.type = "button";
      b.innerHTML = `<span class="hm-hr">${hhmm(e.start)}<em>${e.end ? hhmm(e.end) : ""}</em></span><span class="hm-vb" style="background:${HM_HEX[c]}"></span>
        <span class="hm-sl"><span class="t1">${live ? '<span class="hm-live"></span>' : ""}${esc(nomCourt(t))}</span><span class="t2">${live ? "En cours" : ""}${live && e.place ? " · " : ""}${esc(e.place || "")}</span></span>${flag}`;
      b.addEventListener("click",()=>{ haptic(); openEDTAt(e.start); });
      card.appendChild(b);
    });
    boxC.appendChild(card);
  }

  // ── à venir : contrôles, rendus, étapes de projet ──
  const boxA = document.getElementById("hm-avenir"); boxA.innerHTML = "";
  const items = [];
  pendingAlerts(true, false).forEach(e=>{
    const N = evNote(e) || {}; const ty = typeDevoir(N); if(ty === "note") return;
    const subj = matiereDeNote(e, N);
    const chsN = chapitresDeNote(subj, N);
    let s = "", sc = "";
    if(chsN.length){ s = nomsChapitres(chsN); sc = ty === "controle" ? "var(--c-r)" : "#c98300"; }
    else if(ty === "controle" && subj){ const q = hmQcm(subj); const reste = q.tot - q.ok; s = reste ? reste + " QCM à valider" : "Tout est révisé"; sc = reste ? "var(--c-r)" : "var(--c-g)"; }
    else { const l = String(N.note || N.titre || "").split("\n")[0].trim(); s = l || (ty === "controle" ? "Contrôle" : "À rendre"); sc = "var(--text-soft)"; }
    items.push({ d:e.start, n:(ty === "controle" ? "Contrôle " : "À rendre · ") + (subj ? subj.title : nomCourt(e.title)), s, sc, c:ty === "controle" ? "r" : "y", ic:"devoirs", go:()=>subj ? openControle(e) : openEDTAt(e.start) });
  });
  try{
    projetsVisibles().forEach(pid=>{
      const E = echeancesDe(pid);
      etapesProjet(pid).forEach(st=>{
        if(st.fait || !E[st.id]) return; const j = joursAvant(E[st.id].fin); if(j < 0 || j > 31) return;
        const [y,m,d] = E[st.id].fin.split("-").map(Number);
        items.push({ d:new Date(y, m-1, d, 12), n:st.titre, s:pid === "psy" ? "Projet psycho" : PROJETS[pid].titre, sc:"#c98300", c:"y", ic:"accueil",
          go:()=>{ if(pid === "psy") renderPsychoEtapes(); else ouvrirRubrique(pid, Math.max(0, PROJETS[pid].rubriques.findIndex(r=>r.type === "etapes"))); } });
      });
    });
  }catch(e){}
  items.sort((a,b)=>a.d - b.d);
  const secA = el("div","hm-sec"); secA.innerHTML = `<h3>À venir</h3><button type="button">Tout voir</button>`;
  secA.querySelector("button").addEventListener("click",()=>{ haptic(); ouvrirMesDevoirs(); });
  boxA.appendChild(secA);
  if(!items.length){
    const v = el("div","hm-card hm-vide"); v.innerHTML = `<span class="hm-ic hm-doux-g">${ICO("valide")}</span>Rien à rendre pour l'instant. Profites-en.`;
    boxA.appendChild(v);
  } else {
    const hs = el("div","hm-hs");
    items.slice(0, 8).forEach(it=>{
      const j = hmJoursAvant(it.d);
      const b = el("button","hm-card hm-up hm-press"); b.type = "button";
      b.innerHTML = `<span class="hm-ic hm-doux-${it.c}">${ICO(it.ic)}</span>
        <div class="hm-jj">${j <= 0 ? "Auj." : "J-" + j}<small>${j <= 0 ? "" : j === 1 ? "demain" : j < 7 ? HM_JOURS[it.d.getDay()] : it.d.getDate() + "/" + String(it.d.getMonth()+1).padStart(2,"0")}</small></div>
        <div class="n">${esc(it.n)}</div><div class="s" style="color:${it.sc}">${esc(it.s)}</div>`;
      b.addEventListener("click",()=>{ haptic(); it.go(); });
      hs.appendChild(b);
    });
    boxA.appendChild(hs);
  }

  // ── mes matières : celles qui ont un contrôle d'abord ──
  const boxM = document.getElementById("hm-mats"); boxM.innerHTML = "";
  if(mats.length){
    const ctl = hmControles();
    const tri = mats.slice().sort((a,b)=>{ const x = ctl[a.id], y = ctl[b.id]; if(x && y) return x.start - y.start; if(x) return -1; if(y) return 1; return 0; });
    const sem = hmSemCourant();
    const secM = el("div","hm-sec"); secM.innerHTML = `<h3>Mes matières</h3><button type="button">${esc(titreSemestre(sem))}</button>`;
    secM.querySelector("button").addEventListener("click",()=>{ haptic(); curSemestre = sem; renderSubjectCards(sem); showScreen("subjects"); });
    boxM.appendChild(secM);
    const card = el("div","hm-card hm-ml");
    const nouv = new Set(newSubjects().map(x=>x.id || x));
    tri.slice(0, 5).forEach(m=>{
      const c = hmCouleur(m), q = hmQcm(m), ch = hmChapitres(m), p = q.tot ? Math.round(q.ok / q.tot * 100) : 0;
      const e = ctl[m.id];
      let sous = ch.tot + " chapitre" + (ch.tot > 1 ? "s" : "");
      if(e){ const j = hmJoursAvant(e.start); sous += " · contrôle " + (j <= 0 ? "aujourd'hui" : j === 1 ? "demain" : j < 7 ? e.start.toLocaleDateString("fr-FR",{weekday:"long"}) : "le " + e.start.getDate() + "/" + String(e.start.getMonth()+1).padStart(2,"0")); }
      else if(nouv.has(m.id)) sous += " · du nouveau";
      const b = el("button","hm-mi hm-press"); b.type = "button";
      b.innerHTML = `<span class="hm-ic hm-doux-${c}">${iconeMatiere(m)}</span><span class="t"><span class="t1">${esc(m.title)}</span><span class="t2">${esc(sous)}</span></span>
        <span class="hm-pr"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="17" fill="none" stroke="color-mix(in srgb,${HM_HEX[c]} 16%,transparent)" stroke-width="5"/><circle cx="21" cy="21" r="17" fill="none" stroke="${HM_HEX[c]}" stroke-width="5" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="${106.8 * (1 - p / 100)}"/></svg><b>${q.tot ? p : "–"}</b></span>`;
      b.addEventListener("click",()=>{ haptic(); document.documentElement.dataset.mtDepuis = "semestres"; ouvrirMatiere(m.id, null, b); });
      card.appendChild(b);
    });
    boxM.appendChild(card);
  }
}

// ── la barre du bas ──
const TB_ECRANS = ["semestres","mesdevoirs","semchoice","edt","classes","sites"];
function majTabbar(id){
  id = id || document.documentElement.getAttribute("data-screen");
  const on = !!PSEUDO && TB_ECRANS.includes(id);
  document.documentElement.classList.toggle("tabbar-on", on);
  document.querySelectorAll("#tabbar .tb").forEach(b=>b.classList.toggle("on", b.dataset.tb === (id === "sites" ? "classes" : id)));
  if(on) requestAnimationFrame(placerTrait);
  if(typeof majLecture === "function") majLecture();
  const pose = (cle, n)=>{ const b = document.querySelector('#tabbar [data-tb="' + cle + '"] .tb-nb'); if(!b) return; b.hidden = !n; b.textContent = n > 99 ? "99+" : n; };
  pose("classes", BADGE_APP.cls || 0);
  pose("mesdevoirs", BADGE_APP.dev || 0);
  let nc = 0; try{ nc = newSubjects().length + (BADGE_APP.proj || 0); }catch(e){}
  pose("semchoice", nc);
  // les nouveautés de cours : un simple point, un gros chiffre stresse plus qu'il n'aide
  const pc = document.querySelector('#tabbar [data-tb="semchoice"] .tb-nb'); if(pc){ pc.classList.add("tb-point"); pc.textContent = ""; pc.setAttribute("aria-label", nc ? "Nouveautés" : ""); }
}
// le trait glisse sous l'onglet actif (caché sous le bouton du milieu)
function placerTrait(){
  const t = document.getElementById("tb-ind"), b = document.querySelector("#tabbar .tb.on"), nav = document.getElementById("tabbar");
  if(!t || !nav) return;
  if(!b || b.classList.contains("tb-mid")){ t.style.opacity = 0; return; }
  const r = b.getBoundingClientRect(), n = nav.getBoundingClientRect();
  const z = parseFloat(getComputedStyle(nav).zoom) || 1;   // taille du texte agrandie : la barre est zoomée
  t.style.opacity = 1; t.style.transform = "translateX(" + ((r.left - n.left + r.width / 2) / z - 14) + "px)";
}
addEventListener("resize", ()=>requestAnimationFrame(placerTrait));
// les cartes d'une page arrivent l'une après l'autre
function cascade(root, sel){
  if(!root) return;
  root.querySelectorAll(sel).forEach((e, i)=>{ e.classList.add("cas"); e.style.setProperty("--d", Math.min(i, 8) * 55 + "ms"); });
}
document.querySelectorAll("#tabbar .tb").forEach(b=>b.addEventListener("click",()=>{
  haptic();
  if(b.classList.contains("tb-mid")){ b.classList.remove("boing"); void b.offsetWidth; b.classList.add("boing"); }
  const cle = b.dataset.tb, ici = document.documentElement.getAttribute("data-screen");
  if(cle === ici || (cle === "classes" && ici === "sites")){ window.scrollTo({ top:0, behavior:"smooth" }); return; }
  if(cle === "semestres"){ renderSemestres(); showScreen("semestres"); }
  else if(cle === "mesdevoirs") ouvrirMesDevoirs();
  else if(cle === "semchoice") showScreen("semchoice");
  else if(cle === "edt") openEDT();
  else if(cle === "classes") openSitesSheet();   // l'onglet Liens s'ouvre sur Mes sites
}));



// ══════════ LA PAGE D'UN CONTRÔLE (ou d'un rendu) ══════════
// Ce qui tombe, chapitre par chapitre (un appui l'ouvre), et la révision mélangée sur ces chapitres.
let CONTROLE_OUVERT = null, CT_RETOUR = null, CT_VUE = "ch";
function openControle(e){
  const ici = document.documentElement.getAttribute("data-screen");
  if(ici !== "controle" && ici !== "split" && ici !== "session"){
    const mid = MATIERE_OUVERTE;
    CT_RETOUR = ici === "matiere" ? ()=>{ ouvrirMatiere(mid); }
      : ici === "edt" ? ()=>showScreen("edt")
      : ()=>{ renderSemestres(); showScreen("semestres"); };
  }
  if(CONTROLE_OUVERT !== e) CT_VUE = "ch";
  CONTROLE_OUVERT = e;
  renderControle();
  showScreen("controle");
  window.scrollTo(0, 0);
}
function renderControle(){
  const e = CONTROLE_OUVERT, box = document.getElementById("ct-inner"); if(!e || !box) return;
  const N = evNote(e) || {}, sj = matiereDeNote(e, N);
  const ty = typeDevoir(N), chs = chapitresDeNote(sj, N);
  const j = hmJoursAvant(e.start);
  const c = sj ? hmCouleur(sj) : "v";
  const quand = e.start.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" }) + (e.jour ? (N.heure ? ", " + N.heure : "") : ", " + hhmm(e.start));
  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const coche = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  box.innerHTML = `<div class="mt-head ct-head" style="background:${MT_GRAD[c]}">
      <div class="ct-top"><button type="button" class="mt-bk" id="ct-bk" aria-label="Retour"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button type="button" class="ct-modif" id="ct-modif">Modifier</button></div>
      <div class="ct-k">${ty === "controle" ? "Contrôle" : "À rendre"} · ${j <= 0 ? "aujourd'hui" : j === 1 ? "demain" : "J-" + j}</div>
      <h1>${esc(sj ? sj.title : nomCourt(e.title))}</h1><p>${esc(quand.charAt(0).toUpperCase() + quand.slice(1))}</p>
    </div>
    <div class="mt-body">
      ${String(N.note || "").trim() ? `<div class="hm-card ct-note"><span class="hm-ic hm-doux-y">${ICO("oq")}</span><span class="t"><span class="k">Ta note</span><span class="t1">${noteAvecLiens(String(N.note).trim())}</span></span></div>` : ""}
      ${chs.length ? `<div class="mt-seg ct-seg" id="ct-seg"><button type="button" data-v="ch">Chapitres · ${chs.length}</button><button type="button" data-v="fiche">Ma fiche</button></div>` : `<div class="hm-sec ct-sec"><h3>Ce qui tombe</h3></div>`}
      <div id="ct-liste"></div>
    </div>
    <div class="mt-sticky"><button type="button" class="hm-cta hm-press" id="ct-go"></button></div>`;
  document.getElementById("ct-bk").addEventListener("click",()=>{ haptic(); CONTROLE_OUVERT = null; (CT_RETOUR || (()=>{ renderSemestres(); showScreen("semestres"); }))(); });
  document.getElementById("ct-modif").addEventListener("click",()=>{ haptic(); openEvSheet(e); });
  const liste = document.getElementById("ct-liste");
  // la fiche : les « À retenir » des chapitres qui tombent, sur une seule page
  const seg = document.getElementById("ct-seg");
  if(seg){
    seg.querySelectorAll("button").forEach(b=>{
      b.classList.toggle("on", b.dataset.v === CT_VUE);
      b.addEventListener("click",()=>{ haptic(); CT_VUE = b.dataset.v; renderControle(); });
    });
    if(CT_VUE === "fiche"){
      chs.forEach(x=>{
        const pc = partiesChapitre(x.ch.label);
        const c2 = el("div","hm-card ct-fiche");
        const pts = (x.ch.recap || []).filter(Boolean);
        const minute = x.ch.clair && x.ch.clair.minute;
        c2.innerHTML = `<div class="ct-fiche-t">${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre.replace(/^Séance du /, "")) : ""}</div>` +
          (pts.length ? `<ol class="ct-fiche-l">${pts.map(t=>`<li>${esc(t)}</li>`).join("")}</ol>`
            : minute ? `<div class="ct-fiche-m">${minute}</div>`
            : `<div class="ct-fiche-v">Pas encore de résumé pour ce chapitre : ouvre-le pour le relire.</div>`);
        c2.addEventListener("click",ev=>{ if(ev.target.closest("a")) return; });
        const lien = el("button","ct-fiche-go"); lien.type = "button"; lien.textContent = "Relire le chapitre ›";
        lien.addEventListener("click",()=>{ haptic(); ouvrirChapitreMatiere(sj, x.type, x.i); });
        c2.appendChild(lien);
        liste.appendChild(c2);
      });
      const go0 = document.getElementById("ct-go");
      go0.innerHTML = "Réviser " + (chs.length > 1 ? "ces " + chs.length + " chapitres" : "ce chapitre") + chev;
      go0.addEventListener("click",()=>{ haptic(); retourSession = ()=>openControle(e); if(!startRevisionMatiere(sj, chs.map(x=>x.ch.label))) toast("Pas encore d'exercices sur ces chapitres."); });
      return;
    }
  }
  if(!sj){
    liste.innerHTML = `<div class="hm-card hm-vide"><span class="hm-ic hm-doux-v">${ICO("cm")}</span>Relie ce ${ty === "controle" ? "contrôle" : "rendu"} à une matière avec « Modifier ».</div>`;
    document.querySelector(".mt-sticky").remove();
    return;
  }
  if(!chs.length){
    const b = el("button","hm-card mt-ch hm-press"); b.type = "button";
    b.innerHTML = `<span class="mt-cn hm-doux-${c}">${ICO("cm")}</span><span class="t"><span class="t1">Toute la matière</span><span class="t2">Touche « Modifier » pour choisir les CM et TD qui tombent</span></span><span class="mt-chev">${chev}</span>`;
    b.addEventListener("click",()=>{ haptic(); ouvrirMatiere(sj.id); });
    liste.appendChild(b);
  }
  chs.forEach(x=>{
    const pc = partiesChapitre(x.ch.label), lu = estRevise(sj, x.type, x.ch), n = (x.ch.sections || []).length;
    const b = el("button","hm-card mt-ch hm-press"); b.type = "button";
    b.innerHTML = `<span class="mt-cn ${lu ? "hm-doux-g" : ""}" style="${lu ? "" : "background:color-mix(in srgb,var(--text) 6%,transparent);color:var(--text-soft)"}">${lu ? coche : esc(pc.court.replace(/\s*·.*$/, "").replace(/^(CM|TD)\s*/i, "") || "•")}</span>
      <span class="t"><span class="t1">${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre.replace(/^Séance du /, "")) : ""}</span><span class="t2">${lu ? "Lu · " : ""}${n} section${n > 1 ? "s" : ""}</span></span><span class="mt-chev">${chev}</span>`;
    b.addEventListener("click",()=>{ haptic(); ouvrirChapitreMatiere(sj, x.type, x.i); });
    liste.appendChild(b);
  });
  const go = document.getElementById("ct-go");
  go.innerHTML = (chs.length ? "Réviser " + (chs.length > 1 ? "ces " + chs.length + " chapitres" : "ce chapitre") : "Réviser cette matière") + chev;
  go.addEventListener("click",()=>{
    haptic();
    retourSession = ()=>openControle(e);
    if(!startRevisionMatiere(sj, chs.map(x=>x.ch.label))) toast("Pas encore d'exercices sur " + (chs.length > 1 ? "ces chapitres" : "ce chapitre") + ". Relis-les d'un appui.");
  });
}
// ══════════ PAGE D'UNE MATIÈRE ══════════
// En-tête à la couleur de la matière, trois chiffres, « Reprendre », les chapitres (CM / TD),
// et un bouton en bas pour réviser ses QCM (le contrôle à venir en tête).
let MATIERE_OUVERTE = null, MT_ONGLET = "cm";
const MT_GRAD = { v:"linear-gradient(160deg,color-mix(in srgb,var(--accent) 85%,#000),var(--accent) 50%,var(--accent-2))",
  b:"linear-gradient(160deg,#1f63d6,#3a86ff 50%,#7fb0ff)", g:"linear-gradient(160deg,#0b8a5d,#14b87e 50%,#5fd9a9)",
  y:"linear-gradient(160deg,#e07b00,#f5a524 50%,#ffc766)", r:"linear-gradient(160deg,#d12a6b,#ff4d8d 50%,#ff8ab4)" };
function ouvrirMatiere(id, onglet, depuis){
  const m = SUBJECTS.find(x=>x.id === id); if(!m) return;
  const reduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const r0 = depuis && !reduit ? depuis.getBoundingClientRect() : null;
  MATIERE_OUVERTE = id; curSubj = m; curSemestre = SEMESTRES[id]; CONTROLE_OUVERT = null;
  if(onglet) MT_ONGLET = onglet;
  else if(!(m.cm||[]).length && (m.td||[]).length) MT_ONGLET = "td";
  else MT_ONGLET = "cm";
  renderMatiere();
  cascade(document.getElementById("mt-inner"), ".mt-kpi, .mt-reprise, .mt-seg, .mt-ch");
  showScreen("matiere");
  if(r0 && r0.width){
    // la carte touchée grandit jusqu'à devenir l'en-tête de la page
    const wrap = document.querySelector("#screen-matiere > .wrap"); if(wrap) wrap.classList.remove("glisse-av","glisse-ar");
    const head = document.querySelector("#mt-inner .mt-head"); const r1 = head.getBoundingClientRect();
    const f = el("div","mt-morph"); f.style.cssText = `left:${r0.left}px;top:${r0.top}px;width:${r0.width}px;height:${r0.height}px;border-radius:22px;background:${head.style.background}`;
    document.body.appendChild(f); document.documentElement.classList.add("morph-en-cours");
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ f.style.left = r1.left + "px"; f.style.top = r1.top + "px"; f.style.width = r1.width + "px"; f.style.height = r1.height + "px"; f.style.borderRadius = getComputedStyle(head).borderRadius; }));
    setTimeout(()=>{ document.documentElement.classList.remove("morph-en-cours"); f.style.transition = "opacity .2s"; f.style.opacity = 0; setTimeout(()=>f.remove(), 220); }, 470);
  }
  window.scrollTo(0, 0);
}
function renderMatiere(){
  const m = SUBJECTS.find(x=>x.id === MATIERE_OUVERTE); const box = document.getElementById("mt-inner");
  if(!m || !box) return;
  const c = hmCouleur(m), q = hmQcm(m), ch = hmChapitres(m);
  const ctl = hmControles()[m.id];
  const jc = ctl ? hmJoursAvant(ctl.start) : null;
  const quandCtl = ctl ? (jc <= 0 ? "aujourd'hui" : jc === 1 ? "demain" : jc < 7 ? ctl.start.toLocaleDateString("fr-FR",{weekday:"long"}) : "le " + ctl.start.getDate() + "/" + String(ctl.start.getMonth()+1).padStart(2,"0")) : "";
  const nouv = new Set(nouveauxDe(m).map(n=>n.ch.label));
  const prof = (m.profs && m.profs.length) ? (m.profs[0].nom || m.profs[0]) : "";
  const sous = ch.tot + " chapitre" + (ch.tot > 1 ? "s" : "") + (ctl ? " · contrôle " + quandCtl : "");
  box.innerHTML = `<div class="mt-head" style="background:${MT_GRAD[c]}">
      <button type="button" class="mt-bk" id="mt-bk" aria-label="Retour"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="mt-top"><span class="mt-big">${iconeMatiere(m)}</span><div><h1>${esc(m.title)}</h1><p>${esc(sous)}</p></div></div>
    </div>
    <div class="mt-body">
      <div class="hm-card mt-kpi"><div><b>${ch.lus}/${ch.tot}</b><span>chapitres lus</span></div><div><b>${q.tot ? Math.round(q.ok / q.tot * 100) + " %" : "–"}</b><span>QCM validés</span></div><div><b>${ctl ? (jc <= 0 ? "Auj." : "J-" + jc) : (q.err || 0)}</b><span>${ctl ? "contrôle" : "erreurs"}</span></div></div>
      <div id="mt-ctl"></div>
      <div id="mt-reprise"></div>
      <div class="mt-seg" id="mt-seg"><button type="button" data-o="cm">CM${(m.cm||[]).length ? " · " + m.cm.length : ""}</button><button type="button" data-o="td">TD${(m.td||[]).length ? " · " + m.td.length : ""}</button><button type="button" data-o="ent">S'entraîner</button></div>
      <div id="mt-liste"></div>
    </div>
    <div class="mt-sticky"><button type="button" class="hm-cta hm-press" id="mt-go">${ctl ? "Réviser pour " + quandCtl : "Réviser cette matière"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div>`;
  document.getElementById("mt-bk").addEventListener("click",()=>{ haptic(); if(document.documentElement.dataset.mtDepuis === "subjects"){ renderSubjectCards(curSemestre); showScreen("subjects"); } else { renderSemestres(); showScreen("semestres"); } });
  document.getElementById("mt-go").addEventListener("click",()=>{
    haptic(); curSubj = m;
    retourSession = ()=>ouvrirMatiere(m.id, MT_ONGLET);
    const chsC = ctl ? chapitresDeNote(m, evNote(ctl)).map(x=>x.ch.label) : [];
    if(!startRevisionMatiere(m, chsC.length ? chsC : null)){ openSubject(m.id); setTab(2); }
  });
  // le contrôle à venir : ce qui tombe, un appui ouvre sa page
  if(ctl){
    const chsC = chapitresDeNote(m, evNote(ctl));
    const bn = el("button","hm-card mt-ctl hm-press"); bn.type = "button";
    bn.innerHTML = `<span class="hm-ic hm-doux-r">${ICO("devoirs")}</span><span class="t"><span class="t1">Contrôle ${esc(quandCtl)}</span><span class="t2">${chsC.length ? esc(nomsChapitres(chsC)) : "Toute la matière"}</span></span><span class="mt-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>`;
    bn.addEventListener("click",()=>{ haptic(); openControle(ctl); });
    document.getElementById("mt-ctl").appendChild(bn);
  }
  // reprendre la lecture là où on s'était arrêté dans cette matière
  const der = lectureCharger().dernier[m.id];
  if(der){
    const chs = m[der.type] || [], ci = chs.findIndex(x=>x.label === der.label);
    if(ci >= 0){
      const pc = partiesChapitre(chs[ci].label);
      const r = el("button","hm-card mt-reprise hm-press"); r.type = "button";
      r.innerHTML = `<span class="hm-ic hm-doux-${c}">${ICO("reprendre")}</span><span class="t"><span class="k">Reprendre</span><span class="t1" style="display:block">${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre.replace(/^Séance du /, "")) : ""}</span></span><span class="mt-chev">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'}</span>`;
      r.addEventListener("click",()=>{ haptic(); ouvrirChapitreMatiere(m, der.type, ci); });
      document.getElementById("mt-reprise").appendChild(r);
    }
  }
  const seg = document.getElementById("mt-seg");
  seg.querySelectorAll("button").forEach(b=>{
    b.classList.toggle("on", b.dataset.o === MT_ONGLET);
    b.addEventListener("click",()=>{
      haptic();
      if(b.dataset.o === "ent"){ openSubject(m.id); setTab(2); return; }
      MT_ONGLET = b.dataset.o; renderMatiere();
    });
  });
  const liste = document.getElementById("mt-liste");
  const chs = m[MT_ONGLET] || [];
  if(!chs.length){
    liste.innerHTML = `<div class="hm-card hm-vide"><span class="hm-ic hm-doux-${c}">${ICO(MT_ONGLET)}</span>Aucun ${MT_ONGLET.toUpperCase()} pour l'instant.</div>`;
    return;
  }
  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const coche = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  chs.forEach((x, i)=>{
    const pc = partiesChapitre(x.label);
    const lu = estRevise(m, MT_ONGLET, x);
    const n = (x.sections||[]).length;
    const titre = pc.titre ? pc.titre.replace(/^Séance du /, "Séance du ") : pc.court;
    const court = String(i + 1);
    const b = el("button","hm-card mt-ch hm-press"); b.type = "button";
    const etat = nouv.has(x.label) ? `<span class="mt-new hm-doux-r">Nouveau</span>` : lu ? `<span class="mt-ok hm-doux-g">${coche}</span>` : `<span class="mt-chev">${chev}</span>`;
    b.innerHTML = `<span class="mt-cn ${lu ? "hm-doux-" + c : "hm-doux-v"}" style="${lu ? "" : "background:color-mix(in srgb,var(--text) 6%,transparent);color:var(--text-soft)"}">${esc(court)}</span>
      <span class="t"><span class="t1">${esc(titre)}</span><span class="t2">${pc.titre ? esc(pc.court) + " · " : ""}${n} section${n > 1 ? "s" : ""}${x.clair ? " · En clair" : ""}</span></span>${etat}`;
    b.addEventListener("click",()=>{ haptic(); ouvrirChapitreMatiere(m, MT_ONGLET, i); });
    liste.appendChild(b);
  });
}
function ouvrirChapitreMatiere(m, type, i){
  curSemestre = SEMESTRES[m.id];
  openSubject(m.id);
  if(type === "cm") curCmIdx = i; else curTdIdx = i;
  setTab(type === "cm" ? 0 : 1);
}

function renderSemestres(){
  try{ majBadgeProjets(); }catch(e){}
  majBoutonCompte();
  renderAideAccueil();
  renderKnowBlock();

  updateMemoBadge();
  try{ renderAccueil(); majTabbar(); }catch(e){ console.error(e); }
  const wrap=document.getElementById("semchoice-inner"); wrap.innerHTML="";
  // affichage en blocs ou en liste : un choix par appareil
  const vue = vueSem();
  wrap.classList.toggle("liste", vue === "liste");
  const seg = document.getElementById("vue-sem");
  if(seg){
    seg.querySelectorAll(".seg-opt").forEach(b=>{
      const on = b.dataset.vue === vue;
      b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false");
      b.onclick = ()=>{ if(on) return; haptic(); try{ localStorage.setItem("revision_vue_sem", b.dataset.vue); }catch(e){} renderSemestres(); };
    });
  }
  // les semestres ne sont plus figés à 5 et 6 : chacun crée les siens
  const sems = [...new Set(Object.values(UES).map(u=>u.sem))].filter(n=>n).sort((a,b)=>a-b);
  if(!sems.length && canEdit()){
    wrap.innerHTML = vide("semestres", "Aucun semestre pour l'instant", "Touche le + en haut pour créer ton premier semestre. Tu y rangeras ensuite tes matières.");
  }
  { const sg = document.getElementById("vue-sem"); if(sg) sg.hidden = !sems.length; }
  const tuiles = [];
  sems.forEach((sem,si)=>{
    const list=SUBJECTS.filter(s=>(SEMESTRES[s.id]||0)===sem);
    // progression : CM et TD marqués révisés / tous les CM et TD (les QCM ne comptent pas)
    const { lus, tot } = avancementCours(list);
    const pct   = tot ? Math.round(lus/tot*100) : 0;
    // matières à revoir dans ce semestre (le détail vit ici, pas sur l'accueil)
    // matières dont au moins un CM ou TD n'est pas encore marqué révisé
    const dues = list.filter(x=>["cm","td"].some(t=>(x[t]||[]).some(ch=>!estRevise(x, t, ch))));
    const nvSem = list.filter(x=>nouveauxDe(x).length).length;
    const t = tuileDe("sem:" + sem);
    const card=el("button","sem-tile rise"); card.style.setProperty("--tc", couleurSemestre(sem));
    card.innerHTML=`
      <div class="sem-tile-top">
        <div class="sem-badge">${icone(t.icone || iconeSemestre(sem))}</div>
      </div>
      ${nvSem ? `<span class="nb" aria-label="${nvSem} matière${nvSem > 1 ? "s" : ""} avec du nouveau">${nvSem}</span>` : ``}
      <div class="sem-name">${esc(titreSemestre(sem))}</div>
      ${t.sous ? `<div class="sem-sous">${esc(t.sous)}</div>` : ``}
      <div class="sem-meta">${list.length} matière${list.length > 1 ? "s" : ""}${dues.length && sem >= 5 ? " · " + dues.length + " à réviser" : ""}</div>
      <div class="sem-bar"><div class="sem-bar-fill" style="width:${pct}%"></div></div>
      <div class="sem-pct">${tot ? pct+" %" : "vide"}</div>`;
    card.addEventListener("click",()=>{ curSemestre=sem; renderSubjectCards(sem); showScreen("subjects"); });
    tuiles.push({ cle:"sem:" + sem, el:card, defaut:(typeof TUILES_DEFAUT === "object" && TUILES_DEFAUT["sem:" + sem] && TUILES_DEFAUT["sem:" + sem].titre) || "Semestre " + sem, icone:iconeSemestre(sem), sem,
                  groupe:(t.sous || "").trim() });
  });

  // Projet Psycho : réservé à Civa et Nana, invisible pour les autres comptes
  if(isCloseFriend()){
    const t = tuileDe("psy");
    const psy = el("button","sem-tile psy-tile rise"); psy.style.setProperty("--tc", TUILE_COUL.r);
    psy.innerHTML = `
      <div class="sem-tile-top"><div class="sem-badge">${icone(t.icone || "tetecoeur")}</div></div>
      <div class="sem-name">${esc(t.titre || psyTitle())}</div>
      <div class="sem-meta">${esc(t.sous || "Passerelles · masters")}</div>
      <div class="sem-bar"><div class="sem-bar-fill" style="width:${psyProgress()}%"></div></div>
      <div class="sem-pct">${psyProgress()} %</div>`;
    psy.addEventListener("click",()=>{ haptic(); renderPsycho(); });
    const nu = urgences("psy").length; pastille(psy, nu, nu + " étape" + (nu > 1 ? "s" : "") + " à faire bientôt");
    tuiles.push({ cle:"psy", el:psy, defaut:psyTitle(), icone:"tetecoeur", sousDefaut:"Passerelles · masters", groupe:"\u0000psy" });
  }
  // les autres projets : reçus d'une classe (et Concours CPE chez Civa)
  mesProjets().forEach(pid=>{
    const pj = PROJETS[pid], t = tuileDe("projet:" + pid), pct = projetAvancement(pid);
    const b = el("button","sem-tile psy-tile rise"); b.style.setProperty("--tc", TUILE_COUL[pid === "cpe" ? "y" : "v"]);
    b.innerHTML = `
      <div class="sem-tile-top"><div class="sem-badge">${icone(t.icone || pj.icone)}</div></div>
      <div class="sem-name">${esc(t.titre || pj.titre)}</div>
      <div class="sem-meta">${esc(t.sous || pj.sous)}</div>
      <div class="sem-bar"><div class="sem-bar-fill" style="width:${pct}%"></div></div>
      <div class="sem-pct">${pct} %</div>`;
    b.addEventListener("click",()=>{ haptic(); renderProjet(pid); });
    const nu = urgences(pid).length; pastille(b, nu, nu + " étape" + (nu > 1 ? "s" : "") + " à faire bientôt");
    tuiles.push({ cle:"projet:" + pid, el:b, defaut:pj.titre, icone:pj.icone, sousDefaut:pj.sous, groupe:"\u0000psy" });
  });

  // la L1 et la L2 rejoignent les archives, repliées en bas : l'accueil reste sur l'année en cours
  // les archives (L1 et L2) ne concernent que mes cours : un autre compte voit tous ses semestres
  const estArchive = t=>isCiva() && t.sem && t.sem < 5;
  const archives = tuiles.filter(estArchive);
  const triees = trierTuiles(tuiles.filter(t=>!estArchive(t)));
  // regroupement par sous-titre : chaque groupe à la place de sa première tuile,
  // les semestres sans sous-titre ensemble, le Projet Psycho toujours à part
  const groupes = [];
  triees.forEach(t=>{
    let g = groupes.find(x=>x.cle === t.groupe);
    if(!g){ g = { cle:t.groupe, tuiles:[] }; groupes.push(g); }
    g.tuiles.push(t);
  });
  const avecTitres = groupes.length > 1 || archives.length > 0;
  wrap.classList.toggle("groupee", avecTitres);
  const nomGroupe = c => c === "\u0000psy" ? "Projets" : (c || (isCiva() ? "Licence 3" : "Autres semestres"));
  let si = 0;
  // chaque section se plie : on garde ouvertes celles en cours, on plie les années terminées
  let plies = {}; try{ plies = JSON.parse(localStorage.getItem("revision_sem_plies") || "{}") || {}; }catch(e){}
  groupes.forEach(g=>{
    const plie = avecTitres && !!plies[g.cle || "\u0000autres"];
    if(avecTitres){
      const h = el("button","sem-groupe rise" + (plie ? "" : " ouvert")); h.type = "button";
      h.setAttribute("aria-expanded", plie ? "false" : "true");
      h.innerHTML = `<span>${esc(nomGroupe(g.cle))}</span><span class="sem-chev">${IC_CHEV_BAS}</span>`;
      h.style.animationDelay = (0.12 + si*0.04) + "s";
      h.addEventListener("click",()=>{
        haptic();
        const k = g.cle || "\u0000autres";
        if(plies[k]) delete plies[k]; else plies[k] = 1;
        try{ localStorage.setItem("revision_sem_plies", JSON.stringify(plies)); }catch(e){}
        renderSemestres();
      });
      wrap.appendChild(h);
    }
    if(plie) return;
    g.tuiles.forEach(t=>placerTuile(t, si++));
  });
  if(archives.length) ajouterArchives(wrap, archives, t=>placerTuile(t, si++));
  function placerTuile(t, si){
    t.el.style.animationDelay = (0.14 + si*0.04) + "s";
    if(!canEdit()){ wrap.appendChild(t.el); return; }
    onLongPress(t.el, ()=>personnaliserTuile(t, tuiles));
    const w = withPen(t.el, "Personnaliser « " + (tuileDe(t.cle).titre || t.defaut) + " »", ()=>personnaliserTuile(t, tuiles));
    const pen = w.querySelector && w.querySelector(".pen");
    if(pen) pen.classList.add("pen-bas");
    wrap.appendChild(w);
  }
}

// ── ARCHIVES : les années terminées, en liste compacte, repliées par défaut ──
// le nom de l'année d'un semestre, le même partout
function nomAnneeSem(sem){
  if(!sem) return "Autres";
  // les noms d'années ne valent que pour mes cours ; les autres comptes ont leurs sous-titres
  if(!isCiva()) return (tuileDe("sem:" + sem).sous || "").trim() || "Mes semestres";
  if(sem >= 5) return (tuileDe("sem:" + sem).sous || "").trim() || "Licence 3";
  return sem >= 3 ? "Licence 2 · SESS (UPEC)" : sem === 1 ? "Licence 1 · Humanités (ICP)" : "Licence 1 · SESS (UPEC)";
}
// ── Premier lancement : ce que font les icônes de l'accueil, une seule fois ──
function renderAideAccueil(){
  const box = document.getElementById("aide-accueil"); if(!box) return;
  let vu = false; try{ vu = localStorage.getItem("revision_aide_accueil") === "1"; }catch(e){}
  box.hidden = vu || isCiva(); if(box.hidden) return;
  const ic = sel=>{ const b = document.querySelector(sel); const sv = b && b.querySelector("svg"); return sv ? sv.outerHTML : ""; };
  const lignes = [
    [ic('#tabbar [data-tb="semchoice"]'), "Cours", "Le bouton du milieu, en bas : tes matières et tes chapitres."],
    [ic('#tabbar [data-tb="edt"]'), "Agenda", "Importe ton emploi du temps une fois, tes cours s'affichent chaque jour."],
    [ic('#tabbar [data-tb="classes"]'), "Liens", "Tes sites utiles (ENT, Moodle…) et tes classes partagées."],
    [ic("#btn-search"), "Rechercher", "Retrouve un mot dans tous tes cours."],
    [ic("#btn-memo"), "Mémo", "Dans Devoirs, en haut : tes tâches et tes notes rapides."],
    ["<b style='font-size:13px'>" + esc(String(PSEUDO || "?").charAt(0).toUpperCase()) + "</b>", "Ton compte", "L'ambiance, l'affichage et les notifications."]
  ];
  box.className = "aide-acc rise";
  box.innerHTML = `<div class="aide-acc-t">Bienvenue ! Voici où tout se trouve</div>` +
    lignes.map(([svg, nom, txt])=>`<div class="aide-acc-l"><span class="aide-acc-ic">${svg}</span><span><b>${nom}</b><small>${txt}</small></span></div>`).join("") +
    `<button type="button" class="aide-acc-ok">J'ai compris</button>`;
  box.querySelector(".aide-acc-ok").addEventListener("click",()=>{ haptic(); try{ localStorage.setItem("revision_aide_accueil","1"); }catch(e){} box.hidden = true; });
}
// ── Notifications push ──
// Le serveur (revision-api) envoie ; sw.js affiche ; ici on s'abonne, on règle, on ouvre la bonne page.
// Un abonnement par téléphone. Trois familles qu'on peut couper : cours, devoirs, classe.
const NOTIF_PREFS_KEY = "revision_notif_prefs";
// [clé, titre, détail, activé par défaut]. Les rappels partent de l'agenda de chacun, à 18 h (heure de Paris).
const NOTIF_TYPES = [
  ["cours",   "Cours publiés",        "Un CM, un TD ou des révisions",                  true],
  ["devoirs", "Devoirs et contrôles", "Posés, ou leur date qui change",                 true],
  ["classe",  "Ma classe",            "Demandes pour entrer, demande acceptée",         true],
  ["rappels", "Rappels de devoirs",   "La veille à 18 h, et 3 jours avant un contrôle", true],
  ["semaine", "Ma semaine",           "Le dimanche à 18 h : ce qui t'attend",           false],
  ["projets", "CPE et psycho",        "Les étapes de tes projets, 7 jours avant et la veille", true]
];
function notifOn(p, k, parDefaut){ return typeof p[k] === "boolean" ? p[k] : parDefaut; }
function notifPrefs(){ try{ return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || "{}") || {}; }catch(e){ return {}; } }
function notifPrefsSave(p){ try{ localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(p)); }catch(e){} }
function notifIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function notifInstallee(){ return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; }
function notifPossible(){ return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
async function notifAbonnement(){
  if(!notifPossible()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? await reg.pushManager.getSubscription() : null;
}
function cleVapid(s){
  const b = atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c=>c.charCodeAt(0));
}
// La permission se demande en premier, directement depuis le toucher : l'iPhone l'exige.
async function notifActiver(){
  const perm = await Notification.requestPermission();
  if(perm !== "granted") return perm;
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api("push_key");
  let sub = await reg.pushManager.getSubscription();
  if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:cleVapid(key) });
  await api("push_subscribe", { sub: sub.toJSON(), prefs: notifPrefs() });
  return "ok";
}
async function notifCouper(){
  const sub = await notifAbonnement();
  if(!sub) return;
  try{ await api("push_unsubscribe", { endpoint: sub.endpoint }); }catch(e){}
  try{ await sub.unsubscribe(); }catch(e){}
}
// À chaque connexion : le serveur sait que ce téléphone appartient à ce compte (utile après un changement de compte)
async function notifResync(){
  try{
    if(!notifPossible() || Notification.permission !== "granted") return;
    const sub = await notifAbonnement();
    if(sub) await api("push_subscribe", { sub: sub.toJSON(), prefs: notifPrefs() });
  }catch(e){}
}
async function dessinerNotifs(zone){
  const aide = t=>{ const h = el("div","fs-hint compte-hint"); h.textContent = t; return h; };
  let actif = false, sub = null;
  if(notifPossible() && Notification.permission === "granted"){ try{ sub = await notifAbonnement(); }catch(e){} actif = !!sub; }
  zone.innerHTML = "";
  if(notifIOS() && !notifInstallee()){
    zone.appendChild(aide("Sur iPhone, les notifications ne marchent que si l'app est sur l'écran d'accueil : dans Safari, touche Partager puis « Sur l'écran d'accueil », et ouvre l'app depuis l'icône."));
    return;
  }
  if(!notifPossible()){ zone.appendChild(aide("Ce navigateur ne peut pas recevoir de notifications.")); return; }
  if(!syncOn){ zone.appendChild(aide("Il faut être connectée au serveur pour recevoir des notifications. Réessaie avec du réseau.")); return; }
  if(Notification.permission === "denied"){
    zone.appendChild(aide("Les notifications sont bloquées pour Révision. Pour les autoriser : Réglages de l'iPhone › Notifications › Révision."));
    return;
  }
  const seg = el("div","seg compte-seg");
  [[false,"Désactivées"],[true,"Activées"]].forEach(([v, nom])=>{
    const o = el("button","seg-opt" + (v === actif ? " active" : "")); o.type = "button"; o.textContent = nom;
    o.addEventListener("click", async ()=>{
      haptic();
      if(v === actif) return;
      if(v){
        let r; try{ r = await notifActiver(); }catch(e){ r = "erreur"; }
        if(r === "erreur") toast("Impossible d'activer les notifications. Réessaie avec du réseau.");
      } else {
        await notifCouper();
      }
      dessinerNotifs(zone);
    });
    seg.appendChild(o);
  });
  zone.appendChild(seg);
  if(!actif){ zone.appendChild(aide("Pour savoir quand un cours ou un devoir arrive dans tes classes, même app fermée.")); return; }
  const g = el("div","mt-groupe notif-types");
  NOTIF_TYPES.forEach(([k, titre, sous, parDefaut])=>{
    const r = el("button","mt-l notif-type" + (notifOn(notifPrefs(), k, parDefaut) ? " on" : "")); r.type = "button";
    r.innerHTML = `<span class="ev-share-t"><b>${esc(titre)}</b><small>${esc(sous)}</small></span><span class="ev-sw"></span>`;
    r.addEventListener("click", async ()=>{
      haptic();
      const avant = notifPrefs();
      const p = Object.assign({}, avant, { [k]: !notifOn(avant, k, parDefaut) });
      notifPrefsSave(p); r.classList.toggle("on", p[k]);
      try{ await api("push_prefs", { endpoint: sub.endpoint, prefs: p }); }
      catch(e){ notifPrefsSave(avant); r.classList.toggle("on", notifOn(avant, k, parDefaut)); toast("Pas de connexion : réessaie."); }
    });
    g.appendChild(r);
  });
  zone.appendChild(g);
}
// Une notification touchée : on ouvre la classe concernée (sur ses devoirs pour un devoir)
let NOTIF_A_OUVRIR = null;
try{
  const q = new URLSearchParams(location.search).get("notif");
  if(q){ NOTIF_A_OUVRIR = JSON.parse(q); history.replaceState(null, "", location.pathname); }
}catch(e){}
async function ouvrirDepuisNotif(data){
  if(!data || !PSEUDO) return;
  // un rappel : la liste de mes devoirs, comme depuis l'accueil
  // un seul devoir : sa page (le contrôle et ses chapitres) ; sinon la liste des devoirs
  if(data.type === "rappel"){
    closePicker();
    if(data.cle){
      let e = null;
      try{
        if(String(data.cle).startsWith("jour|")) e = echeanceEv(data.cle);
        else { if(!EDT.length) await loadEDT(); e = EDT.find(x=>evKey(x) === data.cle) || null; }
      }catch(err){}
      if(e && matiereDeNote(e, evNote(e) || {})){ openControle(e); return; }
      if(e){ openEDTAt(e.start); return; }
    }
    ouvrirMesDevoirs(); return;
  }
  // une étape de projet : la liste des étapes de ce projet
  if(data.type === "projet"){
    closePicker();
    if(data.pid === "psy" && isCloseFriend()){ renderPsychoEtapes(); return; }
    const p = PROJETS[data.pid];
    if(p && projetsVisibles().includes(data.pid)){ ouvrirRubrique(data.pid, Math.max(0, p.rubriques.findIndex(r=>r.type === "etapes"))); return; }
    renderSemestres(); showScreen("semchoice"); return;
  }
  if(!data.class_id) return;
  let c = MY_CLASSES.find(x=>x.id === data.class_id);
  if(!c){
    try{ MY_CLASSES = (await api("class_list")).classes || []; }catch(e){ return; }
    c = MY_CLASSES.find(x=>x.id === data.class_id);
  }
  if(!c) return;
  // un seul chapitre publié : on l'ouvre directement ; le retour ramène à sa classe
  if(data.type === "cours" && data.item_id && !(data.n > 1)){
    try{
      const it = ((await api("items_fetch", { ids:[data.item_id] })).items || [])[0];
      if(it){ curClass = c; closePicker(); openSharedItem(it); return; }
    }catch(e){}
  }
  if(data.type === "devoir") CLS_VUE[c.id] = "devoirs";
  else if(data.type === "cours") CLS_VUE[c.id] = "cours";
  closePicker();
  openClass(c);
}
if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("message", ev=>{
    if(ev.data && ev.data.type === "notif") ouvrirDepuisNotif(ev.data.data);
  });
}
// Appelé une fois connecté au serveur : remet l'abonnement à jour, ouvre la page d'une notification touchée
function apresConnexionServeur(){
  notifResync();
  if(NOTIF_A_OUVRIR){ const d = NOTIF_A_OUVRIR; NOTIF_A_OUVRIR = null; ouvrirDepuisNotif(d); }
}

// ── Mon compte : qui est connecté, l'ambiance, l'aide, la déconnexion ──
function majBoutonCompte(){
  const b = document.getElementById("btn-compte"); if(!b) return;
  const p = String(PSEUDO || "?");
  b.textContent = p.charAt(0).toUpperCase();
  b.setAttribute("aria-label", "Mon compte : " + p);
}
function ouvrirCompte(){
  document.querySelectorAll("#pick-sheet .pick-actions, #pick-sheet .fp-retour").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = "Mon compte";
  const box = document.getElementById("pick-list"); box.innerHTML = "";
  const qui = el("div","compte-qui");
  qui.innerHTML = `<span class="compte-av">${esc(String(PSEUDO || "?").charAt(0).toUpperCase())}</span>
    <span><b>${esc(PSEUDO || "")}</b><small>${syncOn ? "Tes révisions sont enregistrées en ligne, sur tous tes appareils." : "Hors ligne : tes révisions restent sur ce téléphone pour l'instant."}</small></span>`;
  box.appendChild(qui);
  const lab = el("div","fs-label compte-lab"); lab.textContent = "Ambiance"; box.appendChild(lab);
  const seg = el("div","seg compte-seg");
  const actuel = document.documentElement.getAttribute("data-theme") || "girly";
  [["girly","Rose"],["purple","Violet"]].forEach(([v, nom])=>{
    const o = el("button","seg-opt" + (v === actuel ? " active" : "")); o.type = "button"; o.textContent = nom;
    o.addEventListener("click",()=>{
      haptic(); applyTheme(v);
      try{ localStorage.setItem(THEME_KEY, v); }catch(e){}
      scheduleSync();
      seg.querySelectorAll(".seg-opt").forEach(x=>x.classList.toggle("active", x === o));
    });
    seg.appendChild(o);
  });
  box.appendChild(seg);
  const labM = el("div","fs-label compte-lab"); labM.textContent = "Affichage"; box.appendChild(labM);
  const segM = el("div","seg compte-seg");
  [["auto","Auto"],["clair","Clair"],["sombre","Sombre"]].forEach(([v, nom])=>{
    const o = el("button","seg-opt" + (v === modeActuel() ? " active" : "")); o.type = "button"; o.textContent = nom;
    o.addEventListener("click",()=>{ haptic(); appliquerMode(v); segM.querySelectorAll(".seg-opt").forEach(x=>x.classList.toggle("active", x === o)); });
    segM.appendChild(o);
  });
  box.appendChild(segM);
  const hM = el("div","fs-hint compte-hint"); hM.style.marginBottom = "14px"; hM.textContent = "Auto suit le réglage de ton téléphone."; box.appendChild(hM);
  // la taille du texte : toute l'app grandit d'un coup (réglage de cet appareil)
  const labT = el("div","fs-label compte-lab"); labT.textContent = "Taille du texte"; box.appendChild(labT);
  const segT = el("div","seg compte-seg");
  let tAct = "normal"; try{ tAct = localStorage.getItem("revision_texte_v1") || "normal"; }catch(e){}
  [["normal","Normale"],["grand","Grande"],["tresgrand","Très grande"]].forEach(([v, nom])=>{
    const o = el("button","seg-opt" + (v === tAct ? " active" : "")); o.type = "button"; o.textContent = nom;
    o.addEventListener("click",()=>{
      haptic();
      try{ if(v === "normal") localStorage.removeItem("revision_texte_v1"); else localStorage.setItem("revision_texte_v1", v); }catch(e){}
      document.documentElement.classList.remove("texte-grand","texte-tresgrand");
      if(v !== "normal") document.documentElement.classList.add("texte-" + v);
      segT.querySelectorAll(".seg-opt").forEach(x=>x.classList.toggle("active", x === o));
      requestAnimationFrame(placerTrait);
    });
    segT.appendChild(o);
  });
  box.appendChild(segT);
  const hT = el("div","fs-hint compte-hint"); hT.style.marginBottom = "14px"; hT.textContent = "Agrandit tout : textes, boutons et cartes. Le « Aa » d'un chapitre règle en plus le texte du cours."; box.appendChild(hT);
  // Pomodoro : une option, pas une tuile
  const labP = el("div","fs-label compte-lab"); labP.textContent = "Pomodoro"; box.appendChild(labP);
  const segP = el("div","seg compte-seg");
  [[false,"Désactivé"],[true,"Activé"]].forEach(([v, nom])=>{
    const o = el("button","seg-opt" + (v === pomoActif() ? " active" : "")); o.type = "button"; o.textContent = nom;
    o.addEventListener("click",()=>{
      haptic();
      USER_SETTINGS.pomodoro = v; saveContent();
      if(!v) pomoArreter(); else pomoMaj();
      segP.querySelectorAll(".seg-opt").forEach(x=>x.classList.toggle("active", x === o));
    });
    segP.appendChild(o);
  });
  box.appendChild(segP);
  const hP = el("div","fs-hint compte-hint"); hP.textContent = "25 min de travail, 5 min de pause. Un minuteur apparaît en bas à gauche : touche-le pour lancer un pomodoro.";
  box.appendChild(hP);
  // Notifications : leur état dépend du téléphone, la rubrique se dessine une fois qu'on le connaît
  const labN = el("div","fs-label compte-lab notif-lab"); labN.textContent = "Notifications"; box.appendChild(labN);
  const zoneN = el("div","notif-zone"); box.appendChild(zoneN);
  dessinerNotifs(zoneN);
  const ligne = (nom, sous, fn, cls)=>{
    const r = el("button","cal-row" + (cls ? " " + cls : "")); r.type = "button";
    r.innerHTML = `<div class="cal-txt"><div class="cal-name">${esc(nom)}</div>${sous ? `<div class="cal-url">${esc(sous)}</div>` : ""}</div>`;
    r.addEventListener("click",()=>{ haptic(); fn(); });
    box.appendChild(r);
  };
  if(!isCiva()) ligne("Revoir l'aide de l'accueil", "Ce que font les boutons", ()=>{
    try{ localStorage.removeItem("revision_aide_accueil"); }catch(e){}
    closePicker(); renderSemestres(); window.scrollTo(0, 0);
  });
  ligne("Se déconnecter", "Pour changer de compte sur ce téléphone", ()=>{ closePicker(); setTimeout(seDeconnecter, 320); }, "compte-quitter");
  document.getElementById("pick-sheet").classList.add("open");
}
// On enregistre d'abord en ligne, puis on vide ce téléphone : le compte suivant repart de zéro.
function seDeconnecter(){
  // ce téléphone ne doit plus recevoir les notifications de ce compte
  const vider = async ()=>{ try{ await notifCouper(); }catch(e){} try{ localStorage.clear(); }catch(e){} location.reload(); };
  confirmer("Te déconnecter ?", syncOn
    ? "Tes cours et ta progression restent enregistrés en ligne. Tu les retrouves avec ton pseudo et ton code."
    : "Tu n'es pas connectée au serveur : ce qui est sur ce téléphone serait perdu.", "Se déconnecter", async ()=>{
    if(!syncOn){ vider(); return; }
    clearTimeout(saveTimer); saveTimer = null;
    toast("Enregistrement…");
    const ok = await pushState();
    if(ok){ vider(); return; }
    setTimeout(()=>confirmer("Pas de connexion", "Tes dernières révisions sur ce téléphone ne sont pas encore enregistrées en ligne. Te déconnecter quand même ?", "Me déconnecter", vider), 350);
  });
}
function vueSem(){ try{ return localStorage.getItem("revision_vue_sem") === "liste" ? "liste" : "bloc"; }catch(e){ return "bloc"; } }
// Les archives prennent la forme des autres tuiles : un bloc en mode blocs, une ligne en mode liste.
// Ouvertes, leurs semestres s'affichent comme ceux de l'année en cours, rangés par année.
function ajouterArchives(wrap, archives, placer){
  let ouvert = false; try{ ouvert = localStorage.getItem("revision_archives_ouvert") === "1"; }catch(e){}
  const nMat = SUBJECTS.filter(s=>(SEMESTRES[s.id]||0) < 5).length;
  // Trois temps : le titre plié ne montre rien, comme « Licence 3 » et « Projets » ;
  // déplié, il montre la tuile L1 et L2 ; touchée, la tuile déplie tous les semestres archivés.
  let plies = {}; try{ plies = JSON.parse(localStorage.getItem("revision_sem_plies") || "{}") || {}; }catch(e){}
  const plie = !!plies["\u0000arch"];
  const h = el("button","sem-groupe arch-titre rise" + (plie ? "" : " ouvert")); h.type = "button";
  h.setAttribute("aria-expanded", plie ? "false" : "true");
  h.innerHTML = `<span>Archives</span><span class="sem-chev">${IC_CHEV_BAS}</span>`;
  h.addEventListener("click",()=>{
    haptic();
    if(plie) delete plies["\u0000arch"]; else plies["\u0000arch"] = 1;
    try{ localStorage.setItem("revision_sem_plies", JSON.stringify(plies)); }catch(e){}
    renderSemestres();
  });
  wrap.appendChild(h);
  if(plie) return;
  const bascule = ()=>{
    haptic();
    try{ localStorage.setItem("revision_archives_ouvert", ouvert ? "0" : "1"); }catch(e){}
    renderSemestres();
  };
  const tu = el("button","sem-tile arch-tuile rise" + (ouvert ? " ouvert" : "")); tu.type = "button"; tu.style.setProperty("--tc", TUILE_COUL.t);
  tu.setAttribute("aria-expanded", ouvert ? "true" : "false");
  tu.innerHTML = `<div class="sem-tile-top"><div class="sem-badge">${icone("terreau")}</div></div>
    <div class="sem-name">L1 et L2</div>
    <div class="sem-meta">${nMat} matières</div>
    <div class="sem-bar"></div>
    <div class="sem-pct">${archives.length} semestres</div>`;
  tu.addEventListener("click", bascule);
  wrap.appendChild(tu);
  if(!ouvert) return;
  let courant = "";
  archives.slice().sort((x,y)=>y.sem - x.sem).forEach(t=>{
    const an = nomAnneeSem(t.sem);
    if(an !== courant){
      courant = an;
      const h = el("div","sem-groupe ouvert arch-an-g rise"); h.innerHTML = `<span>${esc(an)}</span>`;
      wrap.appendChild(h);
    }
    placer(t);
  });
}
// ── Personnaliser les tuiles de l'accueil : titre, sous-titre, icône, ordre ──
// Enregistré dans les réglages du compte : suit sur tous les appareils.
function tuileDe(cle){
  const t = USER_SETTINGS.tuiles && USER_SETTINGS.tuiles[cle];
  const d = (typeof TUILES_DEFAUT === "object" && TUILES_DEFAUT[cle]) || {};
  const r = Object.assign({}, d, (t && typeof t === "object") ? t : {});
  // les anciens emojis par défaut des semestres laissent la place à la plante qui grandit
  // (un emoji qui a son dessin : 📚, 🌍, 🧩… ; un emoji sans équivalent, choisi exprès, reste affiché)
  if(cle.startsWith("sem:") && r.icone && typeof cleIcone === "function" && cleIcone(r.icone)) delete r.icone;
  return r;
}
function titreSemestre(sem){ return tuileDe("sem:" + sem).titre || ("Semestre " + sem); }
// L'ordre rangé à la main d'abord. Une tuile pas encore rangée prend sa place chronologique :
// juste avant le premier semestre rangé qui vient après elle. Le Projet Psycho, sans rang, va à la fin.
function trierTuiles(tuiles){
  const ordre = Array.isArray(USER_SETTINGS.ordreTuiles) ? USER_SETTINGS.ordreTuiles : [];
  const semDe = c => /^sem:/.test(c) ? parseFloat(c.slice(4)) : NaN;
  const rang = t => {
    const k = ordre.indexOf(t.cle); if(k >= 0) return k;
    if(t.sem == null) return 1e6;
    const apres = ordre.map((c,i)=>({ i, s:semDe(c) })).filter(o=>o.s > t.sem).sort((a,b)=>a.s - b.s)[0];
    return apres ? apres.i - 0.5 + t.sem / 1e4 : 1e5 + t.sem;
  };
  return tuiles.map(t=>({ t, r:rang(t) })).sort((a,b)=>a.r - b.r).map(o=>o.t);
}
// Ranger les tuiles : toute la liste sous les yeux, ↑ ↓ pour monter ou descendre d'un cran
function rangerTuiles(tuiles){
  let liste = trierTuiles(tuiles);
  const rendre = (actif)=>{
    document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
    document.getElementById("pick-title").textContent = "Ranger les tuiles";
    const box = document.getElementById("pick-list");
    const haut = box.scrollTop;
    box.innerHTML = `<div class="pick-legend"><span>Monte ou descends une tuile avec les flèches.</span></div>`;
    liste.forEach((t,i)=>{
      const d = tuileDe(t.cle);
      const r = el("div","od-row" + (t.cle === actif ? " on" : ""));
      r.innerHTML = `<span class="od-ic">${icone(d.icone || t.icone)}</span><span class="od-t"><b>${esc(d.titre || t.defaut)}</b><small>${esc(d.sous || t.sousDefaut || "")}</small></span>`;
      const bt = el("span","od-bt");
      [["↑",-1,"Monter"],["↓",1,"Descendre"]].forEach(([txt, sens, lab])=>{
        const b = el("button"); b.type = "button"; b.textContent = txt; b.setAttribute("aria-label", lab + " " + (d.titre || t.defaut));
        const j = i + sens;
        b.disabled = j < 0 || j >= liste.length;
        b.addEventListener("click",()=>{
          haptic();
          [liste[i], liste[j]] = [liste[j], liste[i]];
          USER_SETTINGS.ordreTuiles = liste.map(x=>x.cle);
          saveContent();
          renderSemestres();
          rendre(t.cle);
        });
        bt.appendChild(b);
      });
      r.appendChild(bt);
      box.appendChild(r);
    });
    box.scrollTop = haut;
    document.getElementById("pick-sheet").classList.add("open");
  };
  rendre(null);
}
function personnaliserTuile(t, tuiles){
  const cur = tuileDe(t.cle);
  const extra = t.sem && semIsOwn(t.sem) ? { label:"Changer le numéro ou supprimer", fn:()=>setTimeout(()=>editSemestre(t.sem), 320) } : null;
  openForm("Personnaliser", [
    { key:"titre", label:"Titre", value:cur.titre || "", placeholder:t.defaut },
    { key:"sous",  label:"Sous-titre", value:cur.sous || "", placeholder:t.sousDefaut || "ex. L3 SESS (UPEC)" },
    { key:"emoji", label:"Emoji", value:cleIcone(cur.icone) ? "" : (cur.icone || ""), placeholder:"Icône dessinée. Touche ici pour mettre un emoji à la place" },
  ], "Enregistrer", v=>{
    USER_SETTINGS.tuiles = Object.assign({}, USER_SETTINGS.tuiles);
    // un emoji tapé passe devant la rangée : on garde le premier (drapeaux et emojis composés compris)
    const tape = (v.emoji || "").trim();
    let perso = "";
    if(tape){
      try{ perso = [...new Intl.Segmenter("fr", { granularity:"grapheme" }).segment(tape)][0].segment; }
      catch(e){ perso = Array.from(tape).slice(0, 2).join(""); }
    }
    const ic = perso || t.icone;
    const n = { titre:v.titre, sous:v.sous, icone:ic === t.icone ? "" : ic };
    if(!n.titre && !n.sous && !n.icone) delete USER_SETTINGS.tuiles[t.cle];
    else USER_SETTINGS.tuiles[t.cle] = n;
    saveContent();
    renderSemestres();
  }, null, extra);
  // en bas du formulaire : ranger toutes les tuiles, la liste sous les yeux
  const rg = el("button","add-inline fs-ranger"); rg.type = "button";
  rg.textContent = "↕  Ranger les tuiles";
  rg.addEventListener("click",()=>{ haptic(); closeForm(); setTimeout(()=>rangerTuiles(tuiles), 320); });
  document.getElementById("fs-body").appendChild(rg);
}

// avancement du Projet Psycho : étapes cochées / total
function psyProgress(){
  try{
    if(!PSYCHO_STEPS.length) return 0;
    const saved = JSON.parse(localStorage.getItem(PSYCHO_STEPS_KEY) || "{}");
    const done = PSYCHO_STEPS.filter(st => saved[st.id]).length;
    return Math.round(done / PSYCHO_STEPS.length * 100);
  }catch(e){ return 0; }
}

// mémoire des UE dépliées (par UE, conservée d'une visite à l'autre)
const UEOPEN_KEY = "revision_ue_open_v1";
let UEOPEN = null;
function ueOpenLoad(){
  if(UEOPEN) return UEOPEN;
  try{ UEOPEN = JSON.parse(localStorage.getItem(UEOPEN_KEY) || "null"); }catch(e){ UEOPEN = null; }
  if(!UEOPEN || typeof UEOPEN !== "object") UEOPEN = {};
  return UEOPEN;
}
function isUEOpen(ue){
  const m = ueOpenLoad();
  return ue in m ? !!m[ue] : true;      // ouvert par défaut la première fois
}
function setUEOpen(ue, v){
  const m = ueOpenLoad(); m[ue] = !!v;
  try{ localStorage.setItem(UEOPEN_KEY, JSON.stringify(m)); }catch(e){}
}

function renderSubjectCards(sem){
  resolveAllLangs();
  const list=SUBJECTS.filter(s=>(SEMESTRES[s.id]||5)===sem);
  const wrap=document.getElementById("subj-cards"); wrap.innerHTML="";
  // le cercle suit les matières « À jour » : tous leurs CM et TD marqués révisés
  const avecCours = list.filter(s=>(s.cm||[]).length + (s.td||[]).length > 0);
  const aJour = avecCours.filter(s=>["cm","td"].every(t=>(s[t]||[]).every(ch=>estRevise(s, t, ch)))).length;
  // le pourcentage suit les CM et TD lus, comme sur la tuile du semestre
  const av = avancementCours(list);
  const pct = av.tot ? Math.round(av.lus/av.tot*100) : 0;
  const ueCount=new Set(list.map(s=>s.ue)).size;
  const circ=2*Math.PI*18, offset=circ-(pct/100)*circ;
  document.getElementById("subjects-eyebrow").textContent=titreSemestre(sem);
  const ov=document.getElementById("overview");
  const msg = !avecCours.length ? "Prêt à commencer ?"
    : aJour === 0 ? "Prêt à commencer ?"
    : aJour === avecCours.length ? "Tout est à jour, bravo !"
    : aJour + " matière" + (aJour > 1 ? "s" : "") + " à jour sur " + avecCours.length;
  ov.hidden = !list.length;
  if(!list.length && canEdit()) wrap.innerHTML = vide("cm", "Aucune matière pour l'instant", "Touche le + en haut pour ajouter ta première matière.");
  ov.innerHTML=`
    <div class="overview-ring"><svg width="44" height="44"><circle class="overview-ring-bg" cx="22" cy="22" r="18"/><circle class="overview-ring-fill" cx="22" cy="22" r="18" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="overview-ring-num">${pct}%</div></div>
    <div class="overview-text"><div class="overview-title">${msg}</div><div class="overview-sub">${list.length} matière${list.length > 1 ? "s" : ""}${list.length > avecCours.length ? ", dont " + (list.length - avecCours.length) + " à remplir" : ""} · ${ueCount} UE</div></div>`;
  // UE rangées dans l'ordre croissant de leur numéro, quel que soit l'ordre de création
  // « 19.2 » se lit comme 19 puis 2, pas comme le nombre 19,2 :
  // sinon 2.10 passerait avant 2.2. On compare donc segment par segment.
  const segs = v => (String(v ?? "").match(/\d+/g) || []).map(Number);
  const cmpCode = (a,b) => {
    const x = segs(a), y = segs(b);
    if(!x.length && !y.length) return 0;
    if(!x.length) return 1;          // sans numéro : à la fin
    if(!y.length) return -1;
    for(let i = 0; i < Math.max(x.length, y.length); i++){
      const d = (x[i] ?? -1) - (y[i] ?? -1);
      if(d) return d;
    }
    return 0;
  };
  const ueOrder=Object.keys(UES).filter(u=>UES[u].sem===sem)
    .sort((a,b)=>cmpCode(UES[a].num, UES[b].num)
      || String(UES[a].title||"").localeCompare(String(UES[b].title||""), "fr"));
  ueOrder.forEach((ue,gi)=>{
    const items=list.filter(s=>s.ue===ue)
      .sort((a,b)=>cmpCode(a.ecue, b.ecue)
        || String(a.title||"").localeCompare(String(b.title||""), "fr"));
    if(!items.length) return;
    const meta=UES[ue];
    const open = isUEOpen(ue);
    const grp=el("div","ue-group rise" + (open?" open":"")); grp.style.animationDelay=(0.14+gi*0.05)+"s";
    grp.innerHTML=`<button class="ue-header" aria-expanded="${open}">
        <span class="ue-badge">UE ${meta.num}</span>
        <span class="ue-title">${esc(meta.title)}</span>
        <span class="ue-count">${items.length}</span>
        <svg class="ue-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>`;
    const elist=el("div","ecue-list");
    const inner=el("div","ecue-inner");
    items.forEach(s=>inner.appendChild(makeEcueCard(s)));
    elist.appendChild(inner);
    grp.appendChild(elist);
    grp.querySelector(".ue-header").addEventListener("click",()=>{
      haptic();
      const nowOpen = !grp.classList.contains("open");
      grp.classList.toggle("open", nowOpen);
      grp.querySelector(".ue-header").setAttribute("aria-expanded", nowOpen);
      setUEOpen(ue, nowOpen);
    });
    wrap.appendChild(grp);
  });
}

// ══════════════════════════════════════════════════
// SPLIT (Cours / TD / Réviser)
// ══════════════════════════════════════════════════
// Pour les matières bilingues, le contenu suit le THÈME :
// violet = anglais, rose = espagnol.
function resolveLang(subj){
  if(!subj.bilingue || !subj.byLang) return;
  const lang = isPink() ? "es" : "en";
  const data = subj.byLang[lang] || {};
  subj.cm = data.cm || []; subj.td = data.td || [];
  subj.fc = data.fc || []; subj.qcm = data.qcm || [];
  subj.oq = data.oq || []; subj.auteurs = data.auteurs || [];
  subj.title = lang === "es" ? "Espagnol" : "Anglais";
}
// Résout la langue de TOUTES les matières bilingues (à l'ouverture et au changement de thème)
function resolveAllLangs(){
  SUBJECTS.forEach(s=>{ if(s.bilingue) resolveLang(s); });
}
function openSubject(id){
  markSubjectSeen(id);   // le cours n'est plus « nouveau »
  curSubj=SUBJECTS.find(s=>s.id===id);
  resolveLang(curSubj);
  curCmIdx=0; curTdIdx=0; curTab=0;
  // on rouvre le dernier CM ou TD lu dans cette matière
  const der = lectureCharger().dernier[id];
  if(der){
    const i = (curSubj[der.type]||[]).findIndex(c=>c.label === der.label);
    if(i >= 0){ if(der.type === "cm") curCmIdx = i; else { curTdIdx = i; curTab = 1; } }
  }
  // matière sans CM mais avec des TD : on ouvre directement les TD
  if(!(curSubj.cm||[]).length && (curSubj.td||[]).length) curTab = 1;
  document.getElementById("split-chip").innerHTML=
    `<span class="chip-num">${esc(curSubj.ecue)}</span><span class="chip-label">${esc(curSubj.title)}</span><span class="chip-caret">▾</span>`;
  setTab(curTab);
  showScreen("split");
}

// ── Changement rapide de matière (feuille) ──
function openSubjSheet(){
  const sem = SEMESTRES[curSubj.id];
  const list = SUBJECTS.filter(s=>SEMESTRES[s.id]===sem);
  const box = document.getElementById("sheet-list");
  box.innerHTML="";
  const ueOrder = Object.keys(UES).filter(u=>UES[u].sem===sem);
  ueOrder.forEach(ue=>{
    const items = list.filter(s=>s.ue===ue);
    if(!items.length) return;
    const lbl = el("div","sheet-ue");
    lbl.textContent = "UE "+UES[ue].num+" · "+UES[ue].title;
    box.appendChild(lbl);
    items.forEach(s=>{
      const b = el("button","sheet-item"+(s.id===curSubj.id?" current":""));
      b.innerHTML = `<span class="si-num">${esc(s.ecue)}</span><span class="si-name">${esc(s.title)}</span>`
                  + (s.id===curSubj.id ? `<span class="si-tick">✓</span>` : "");
      b.addEventListener("click",()=>{ closeSubjSheet(); if(s.id!==curSubj.id) openSubject(s.id); });
      box.appendChild(b);
    });
  });
  document.getElementById("subj-sheet").classList.add("open");
}
function closeSubjSheet(){ document.getElementById("subj-sheet").classList.remove("open"); }
// ── GESTES (balayage) ──
// Helper générique : détecte un swipe horizontal ou vertical sur un élément.
function onSwipe(elm, opts){
  const { onLeft, onRight, onDown, threshold = 55, maxOff = 45 } = opts || {};
  let x0 = 0, y0 = 0, t0 = 0, active = false;
  elm.addEventListener("touchstart", e=>{
    if(e.touches.length !== 1) { active = false; return; }
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); active = true;
  }, {passive:true});
  elm.addEventListener("touchend", e=>{
    if(!active) return;
    active = false;
    const t  = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    const dt = Date.now() - t0;
    if(dt > 700) return;                       // trop lent : ce n'est pas un swipe
    // vertical (vers le bas)
    if(onDown && dy > threshold && Math.abs(dx) < maxOff){ onDown(); return; }
    // horizontal
    if(Math.abs(dx) > threshold && Math.abs(dy) < maxOff){
      if(dx < 0 && onLeft)  onLeft();
      if(dx > 0 && onRight) onRight();
    }
  }, {passive:true});
}

// ── Sommaire et progression de lecture d'un chapitre ──
const IC_SOMMAIRE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>';
const SOMMAIRE_MIN = 4;   // en dessous, pas de sommaire
function minutesLecture(ch){
  const mots = JSON.stringify(ch.sections||[]).replace(/<[^>]+>/g," ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / 200));
}
function allerSection(pane, i, direct){
  const b = pane.querySelector('.section[data-sec="' + i + '"]');
  if(!b) return;
  const h = document.querySelector("#screen-split .split-head").offsetHeight;
  window.scrollTo({ top:b.getBoundingClientRect().top + window.scrollY - h - 12, behavior:direct ? "auto" : "smooth" });
}
// ── Reprendre la lecture : la section où on s'est arrêté, par chapitre (sur ce téléphone) ──
var reprendreDemande = false;
function lectureCharger(){
  let L = null; try{ L = JSON.parse(localStorage.getItem("lecture") || "null"); }catch(_){}
  if(!L || typeof L !== "object") L = {};
  L.pos = L.pos || {}; L.dernier = L.dernier || {};
  return L;
}
function lectureSauver(L){ try{ localStorage.setItem("lecture", JSON.stringify(L)); }catch(_){} }
var allerDemande = null;   // { sec, mots } : ouvrir à cette section (recherche, lexique)
function marquerMots(racine, mots){
  if(!mots || !mots.length) return;
  const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT), nodes = [];
  while(w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n=>{
    const flat = normKeepLen(n.nodeValue);
    if(!mots.some(m=>m && flat.includes(m))) return;
    const sp = document.createElement("span"); sp.innerHTML = highlight(n.nodeValue, mots); n.replaceWith(sp);
  });
}
function reprendreLecture(pane, cle, jeton){
  if(pane.dataset.cle !== cle || (jeton && pane._jeton !== jeton)) return;
  if(allerDemande){
    const d = allerDemande; allerDemande = null;
    const sec = pane.querySelector('.section[data-sec="' + d.sec + '"]');
    if(sec){
      marquerMots(sec, d.mots);
      allerSection(pane, d.sec, true);
      sec.classList.add("sec-flash"); setTimeout(()=>sec.classList.remove("sec-flash"), 2700);
      requestAnimationFrame(()=>{ pane._pret = true; majProgression(); });
      return;
    }
  }
  const i = lectureCharger().pos[cle] || 0;
  const sec = i > 0 && pane.dataset.somm ? pane.querySelector('.section[data-sec="' + i + '"]') : null;
  if(sec){
    allerSection(pane, i, true);
    toast("Tu reprends à la section " + (i + 1));
  } else window.scrollTo(0, 0);
  requestAnimationFrame(()=>{ pane._pret = true; majProgression(); });
}
function sectionsVisibles(){
  const scr = document.getElementById("screen-split");
  if(!scr || !scr.classList.contains("active")) return null;
  const pane = scr.querySelector(".pane.active");
  if(!pane || pane.id === "pane-2" || !pane.dataset.somm) return null;
  return { scr, pane, secs:[...pane.querySelectorAll(".section[data-sec]")] };
}
const IC_CHEV_D = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
// l'onglet Sommaire se range pendant le défilement, et revient dès qu'on s'arrête
let RANGE_T = null;
addEventListener("scroll", ()=>{
  const f = document.getElementById("somm-flot"); if(!f || !f.classList.contains("on") || f.classList.contains("drag")) return;
  f.classList.add("range");
  clearTimeout(RANGE_T); RANGE_T = setTimeout(()=>f.classList.remove("range"), 900);
}, { passive:true });
// barre fine en haut d'un chapitre : où on en est dans la lecture
function majLecture(){
  let b = document.getElementById("lecture-barre");
  if(!b){ b = el("div","lecture-barre"); b.id = "lecture-barre"; b.innerHTML = "<i></i>"; document.body.appendChild(b); }
  const on = document.documentElement.getAttribute("data-screen") === "split" && curTab !== 2;
  b.classList.toggle("on", on); if(!on) return;
  const h = document.documentElement.scrollHeight - innerHeight;
  b.firstChild.style.transform = "scaleX(" + (h > 40 ? Math.min(1, Math.max(0, scrollY / h)) : 0) + ")";
}
addEventListener("scroll", ()=>requestAnimationFrame(majLecture), { passive:true });
function majProgression(){
  const flot = document.getElementById("somm-flot");
  if(!flot) return;
  const v = sectionsVisibles();
  if(!v || !v.secs.length){ flot.classList.remove("on"); fermerSommaire(); return; }
  const h = v.scr.querySelector(".split-head").offsetHeight;
  let cur = 0;
  v.secs.forEach((s,i)=>{ if(s.getBoundingClientRect().top < h + 90) cur = i; });
  // tout en bas de la page : on est forcément dans la dernière section
  if(window.scrollY + innerHeight >= document.documentElement.scrollHeight - 4) cur = v.secs.length - 1;
  if(!document.getElementById("somm-panneau").classList.contains("open")) flot.classList.add("on");
  flot.querySelector(".somm-flot-txt").textContent = (cur + 1) + "/" + v.secs.length;
  flot._cur = cur;
  // la section où on en est ; arrivé à la fin du chapitre, on repartira du début
  if(v.pane._pret !== false && v.pane.dataset.cle){
    const fin = v.pane.querySelector(".fin-chap");
    const pos = fin && fin.getBoundingClientRect().top < innerHeight ? 0 : cur;
    const L = lectureCharger();
    if((L.pos[v.pane.dataset.cle] || 0) !== pos){ if(pos) L.pos[v.pane.dataset.cle] = pos; else delete L.pos[v.pane.dataset.cle]; lectureSauver(L); }
  }
}
// place le centre de l'onglet à la hauteur y, sans sortir de l'écran ni passer sous l'en-tête
function placerFlot(y){
  const f = document.getElementById("somm-flot"); if(!f) return;
  const h = f.offsetHeight || 72;
  const head = document.querySelector("#screen-split .split-head");
  const min = (head && head.offsetHeight ? head.getBoundingClientRect().bottom : 70) + h / 2 + 8;
  const max = innerHeight - h / 2 - 20;
  f.style.top = Math.round(Math.max(min, Math.min(max, y))) + "px";
}
function fermerSommaire(){
  const pn = document.getElementById("somm-panneau"); if(!pn || !pn.classList.contains("open")) return;
  pn.classList.remove("open"); document.getElementById("somm-voile").classList.remove("open");
  requestAnimationFrame(majProgression);
}
function listeSections(){
  const v = sectionsVisibles(); if(!v) return;
  const flot = document.getElementById("somm-flot");
  const cur = flot._cur || 0;
  const box = document.getElementById("somm-liste");
  document.getElementById("somm-sous").textContent =
    v.secs.length + " sections" + (v.pane.dataset.min ? " · " + v.pane.dataset.min + " min de lecture" : "");
  box.innerHTML = "";
  v.secs.forEach((s,i)=>{
    const t = s.querySelector(".section-title");
    const r = el("button","cal-row chap-ligne" + (i === cur ? " actif" : "") + (i < cur ? " revise" : ""));
    r.type = "button";
    r.innerHTML = `<span class="rv-dot"></span><div class="cal-txt"><div class="cal-name">${esc(t ? t.textContent : "Section " + (i + 1))}</div>
      <div class="cal-url">${i < cur ? "Lu" : i === cur ? "Tu es ici" : "Section " + (i + 1)}</div></div>` +
      (i === cur ? `<span class="chap-ligne-ok">${COCHE_SVG}</span>` : "");
    r.addEventListener("click",()=>{ haptic(); fermerSommaire(); setTimeout(()=>allerSection(v.pane, i), 200); });
    box.appendChild(r);
  });
  flot.classList.remove("on");
  document.getElementById("somm-voile").classList.add("open");
  document.getElementById("somm-panneau").classList.add("open");
  const ici = box.querySelector(".actif");
  if(ici) setTimeout(()=>ici.scrollIntoView({ block:"center" }), 60);
}
(function initProgression(){
  const scr = document.getElementById("screen-split");
  if(scr && !document.getElementById("somm-flot")){
    const f = el("button","somm-flot"); f.id = "somm-flot"; f.type = "button";
    f.setAttribute("aria-label","Ouvrir le sommaire");
    f.innerHTML = IC_SOMMAIRE + '<span class="somm-flot-txt"></span>';
    f.addEventListener("click",()=>{ if(f._glisse){ f._glisse = false; return; } haptic(); listeSections(); });
    // on peut le faire glisser de haut en bas, il garde sa place
    let y0 = null, top0 = 0;
    f.addEventListener("pointerdown",e=>{
      y0 = e.clientY; top0 = f.getBoundingClientRect().top + f.offsetHeight / 2;
      try{ f.setPointerCapture(e.pointerId); }catch(_){}
    });
    f.addEventListener("pointermove",e=>{
      if(y0 === null) return;
      const dy = e.clientY - y0;
      if(!f.classList.contains("drag") && Math.abs(dy) < 6) return;
      f.classList.add("drag");
      placerFlot(top0 + dy);
    });
    const finGlisse = ()=>{
      if(y0 === null) return; y0 = null;
      if(f.classList.contains("drag")){
        f.classList.remove("drag"); f._glisse = true; setTimeout(()=>{ f._glisse = false; }, 400);
        try{ localStorage.setItem("sommFlotY", String(parseFloat(f.style.top) / innerHeight)); }catch(_){}
      }
    };
    f.addEventListener("pointerup", finGlisse);
    f.addEventListener("pointercancel", finGlisse);
    const voile = el("div","somm-voile"); voile.id = "somm-voile";
    voile.addEventListener("click", fermerSommaire);
    const pn = el("aside","somm-panneau"); pn.id = "somm-panneau";
    pn.innerHTML = `<div class="somm-tete"><div class="somm-tete-txt"><div class="somm-titre">Sommaire</div><div class="somm-sous" id="somm-sous"></div></div>
      <button type="button" class="somm-fermer" aria-label="Fermer le sommaire">${IC_CHEV_D}</button></div><div class="somm-liste" id="somm-liste"></div>`;
    pn.querySelector(".somm-fermer").addEventListener("click",()=>{ haptic(); fermerSommaire(); });
    // glisser vers la gauche pour refermer
    let x0 = null;
    pn.addEventListener("touchstart",e=>{ x0 = e.touches[0].clientX; },{ passive:true });
    pn.addEventListener("touchend",e=>{ if(x0 !== null && x0 - e.changedTouches[0].clientX > 60) fermerSommaire(); x0 = null; },{ passive:true });
    document.body.append(f, voile, pn);
    let r = null; try{ r = parseFloat(localStorage.getItem("sommFlotY")); }catch(_){}
    if(r > 0 && r < 1) placerFlot(r * innerHeight);
  }
  window.addEventListener("scroll", ()=>requestAnimationFrame(majProgression), { passive:true });
  window.addEventListener("resize", ()=>requestAnimationFrame(()=>{
    let r = null; try{ r = parseFloat(localStorage.getItem("sommFlotY")); }catch(_){}
    if(r > 0 && r < 1) placerFlot(r * innerHeight);
    majProgression();
  }));
})();

// ── CM / TD / S'entraîner ──
// ── Icônes au trait de l'app (même style que la barre du haut) ──
// icônes au trait, même style que celles des barres (24×24, trait 2)
const P = {
  plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
  cm:'<path d="M2 5.5C4 4.5 7 4.5 12 6.5c5-2 8-2 10-1V19c-2-1-5-1-10 1-5-2-8-2-10-1z"/><path d="M12 6.5V20"/>',
  td:'<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 3h6v3H9z"/><path d="M8.5 11h7M8.5 15h5"/>',
  entrainer:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  lexique:'<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9.5 13l2.5-6 2.5 6M10.4 11h3.2"/>',
  synthese:'<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  taille:'<path d="M3 18l4.5-11L12 18M4.6 14h5.8"/><path d="M14 18l3-7.5 3 7.5M15 15.5h4"/>',
  accueil:'<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  semestres:'<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5L12 21l9-4.5"/>',
  reprendre:'<path d="M7 3h10v18l-5-4-5 4z"/>',
  lien:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  presse:'<rect x="6" y="4" width="12" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5"/><path d="M9.5 11h5M9.5 15h5"/>',
  examen:'<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c2.5 2.5 8.5 2.5 11 0v-5"/><path d="M21.5 9v5"/>',
  fc:'<rect x="3" y="7" width="13" height="14" rx="2.5"/><path d="M8 4.5A2 2 0 0 1 10 3h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2"/>',
  qcm:'<path d="M4 6.5l1.5 1.5L8.5 5"/><path d="M4 12.5l1.5 1.5 3-3"/><path d="M4 18.5l1.5 1.5 3-3"/><path d="M12 7h8M12 13h8M12 19h8"/>',
  oq:'<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/><path d="M13 20h7"/>',
  tr:'<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M8 11v2M12 10.5v3"/><path d="M15.5 12h2"/>',
  devoirs:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  auteurs:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.5-4 3.5-6 7.5-6s7 2 7.5 6"/>',
  grand:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  erreurs:'<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4.5h4.5"/>',
  valide:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  inverse:'<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  loupe:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  calendrier:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  alerte:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
  vide:'<path d="M3 13l2.5-7.5h13L21 13v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  groupe:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.5c2.2.3 3.6 2 4 4.5"/>'
};
// un écran vide : une icône, une phrase courte, une explication, une action si besoin
function vide(ic, titre, sous, extra){
  return `<div class="etat-vide"><span class="vide-ic">${ICO(ic)}</span><div class="vide-t">${titre}</div>${sous ? `<div class="vide-s">${sous}</div>` : ""}${extra || ""}</div>`;
}
function ICO(k){ return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[k]||""}</svg>`; }
const TYPES_VUE = [
  { ic:"cm", nom:"CM",          sub:s=>{ const n=(s.cm||[]).length; return n ? n + " CM" : "Aucun CM pour l'instant"; } },
  { ic:"td", nom:"TD",          sub:s=>{ const n=(s.td||[]).length; return n ? n + " TD" : "Aucun TD pour l'instant"; } },
  { ic:"entrainer", nom:"S'entraîner", sub:()=>"QCM, fiches, textes à trous, auteurs" }
];
const IC_CHEV_DROITE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
const IC_CHEV_BAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
// chapitres jamais ouverts d'un type (cm ou td) dans la matière ouverte
function nouveauxType(type){ return curSubj ? nouveauxDe(curSubj).filter(n=>n.type === type).length : 0; }
function majTypePick(){
  const b = document.getElementById("type-pick"); if(!b) return;
  const t = TYPES_VUE[curTab || 0];
  // un point rose s'il y a du nouveau dans l'autre vue (CM ou TD) : on ne le rate pas
  const ailleurs = ["cm","td"].filter((ty,i)=>i !== curTab).reduce((k,ty)=>k + nouveauxType(ty), 0);
  b.innerHTML = `<span class="type-ic">${ICO(t.ic)}</span><span class="chap-pick-txt">${esc(t.nom)}</span>${ailleurs ? '<span class="tp-pt" aria-label="Du nouveau ailleurs"></span>' : ""}<span class="chap-pick-ic">${IC_CHEV_BAS}</span>`;
}
function listeTypes(){
  document.querySelectorAll("#pick-sheet .pick-actions").forEach(n=>n.remove());
  const box = document.getElementById("pick-list");
  const s = curSubj || {};
  // l'en-tête : le numéro et le nom de la matière, puis l'accueil (la taille du texte est dans le compte)
  const tete = document.getElementById("pick-title");
  tete.innerHTML = `<div class="mt-tete"><div class="mt-tt">${s.ecue ? `<span class="mt-ecue">${esc(s.ecue)}</span>` : ""}<span class="mt-nom">${esc(s.title || "Aller à")}</span></div>` +
    `<button class="mt-rond mt-home" type="button" aria-label="Revenir à l'accueil">${ICO("accueil")}</button></div>`;
  box.innerHTML = "";
  tete.querySelector(".mt-home").addEventListener("click", ()=>{ haptic(); document.getElementById("btn-split-home").click(); });
  // CM, TD, S'entraîner : un sélecteur à trois cases
  const seg = el("div","mt-seg");
  TYPES_VUE.forEach((t,i)=>{
    const n = i < 2 ? (s[i === 0 ? "cm" : "td"] || []).length : 0;
    const sous = i < 2 ? (n ? n + " " + t.nom : "aucun") : "QCM, fiches…";
    const nv = i < 2 ? nouveauxType(i === 0 ? "cm" : "td") : 0;
    const b = el("button", i === curTab ? "on" : ""); b.type = "button";
    b.innerHTML = `<span class="mt-sn">${esc(t.nom)}</span><small>${esc(sous)}</small>` +
      (nv ? `<span class="mt-nv" aria-label="${nv} nouveau${nv > 1 ? "x" : ""}">${nv}</span>` : "");
    b.addEventListener("click", ()=>{ haptic(); closePicker(); if(i !== curTab) setTab(i); });
    seg.appendChild(b);
  });
  box.appendChild(seg);
  // les outils de la matière
  const nLex = curSubj ? lexique(curSubj).length : 0;
  if(nLex){
    const lab = el("div","mt-lab"); lab.textContent = "Outils"; box.appendChild(lab);
    const g = el("div","mt-groupe");
    const ligne = (ic, nom, droite, fn)=>{
      const r = el("button","mt-l"); r.type = "button";
      r.innerHTML = ICO(ic) + `<span class="mt-n">${esc(nom)}</span>` + (droite ? `<span class="mt-c">${esc(droite)}</span>` : "") + `<span class="mt-chev">${IC_CHEV_DROITE}</span>`;
      r.addEventListener("click",()=>{ haptic(); fn(); });
      return r;
    };
    if(nLex) g.appendChild(ligne("lexique", "Lexique", nLex + " terme" + (nLex > 1 ? "s" : ""), ()=>{ closePicker(); setTimeout(ouvrirLexique, 250); }));
    box.appendChild(g);
  }
  // ce qu'on peut ajouter là où on est : plus de + dans l'en-tête d'une matière, tout passe par ce menu
  const ajouts = optionsAjout();
  if(ajouts.length){
    const lab = el("div","mt-lab"); lab.textContent = "Ajouter"; box.appendChild(lab);
    const g = el("div","mt-groupe");
    ajouts.forEach(o=>{
      const r = el("button","mt-l"); r.type = "button";
      r.innerHTML = ICO("plus") + `<span class="mt-n">${esc(o.label)}</span><span class="mt-chev">${IC_CHEV_DROITE}</span>`;
      r.addEventListener("click",()=>{ haptic(); closePicker(); setTimeout(()=>lancerAjout(o.value), 320); });
      g.appendChild(r);
    });
    box.appendChild(g);
  }
  document.getElementById("pick-sheet").classList.add("open");
}
// ce qu'on peut ajouter dans la matière, là où on est (menu TD ⌄ / CM ⌄)
function optionsAjout(){
  if(curTab > 1 || !curSubj) return [];
  const type = curTab === 0 ? "cm" : "td";
  const chapters = type === "cm" ? (curSubj.cm||[]) : (curSubj.td||[]);
  const ch = chapters[type === "cm" ? curCmIdx : curTdIdx];
  const o = [];
  if(ajoutChapitrePossible()) o.push({ label: type === "cm" ? "Un CM" : "Un TD", sub:"Un nouveau chapitre dans cette matière", value:"chap" });
  if(ch && modifiable(ch) && !(isCiva() && !ch._own)){
    o.push({ label:"Une section", sub:"Écrire une section dans ce chapitre", value:"sec" });
    o.push({ label:"Du texte collé", sub:"Un cours copié ailleurs, découpé en sections", value:"coller" });
  }
  if(ch) o.push({ label:"Une note", sub:"Une remarque perso sur ce chapitre", value:"note" });
  return o;
}
function lancerAjout(v){
  const type = curTab === 0 ? "cm" : "td";
  const chapters = type === "cm" ? (curSubj.cm||[]) : (curSubj.td||[]);
  const ch = chapters[type === "cm" ? curCmIdx : curTdIdx];
  if(v === "chap") addChapitre(type);
  else if(v === "sec") addSection(type, ch);
  else if(v === "coller") collerCours(type, ch);
  else if(v === "note"){
    const pane = document.getElementById(type === "cm" ? "pane-0" : "pane-1");
    const b = pane.querySelector(".mn-ouvrir");
    if(b){ b.click(); }
    const n = pane.querySelector(".mes-notes"); if(n) n.scrollIntoView({ behavior:"smooth", block:"center" });
  }
}
function setTab(i){
  fermerRecherchePage();
  curTab=i; majLecture();
  reprendreDemande = i < 2;
  document.querySelectorAll(".seg-btn").forEach((b,k)=>b.classList.toggle("active",k===i));
  majTypePick();
  document.getElementById("seg-thumb").style.transform="translateX(calc("+i+" * (100% + 2px)))";
  document.querySelectorAll(".pane").forEach((p,k)=>p.classList.toggle("active",k===i));
  if(i===0) renderCoursePane("cm");
  else if(i===1) renderCoursePane("td");
  else renderTrainPane();

  const pane=document.getElementById("pane-"+i);
  if(pane){ pane.style.animation="none"; void pane.offsetWidth; pane.style.animation=""; }
  window.scrollTo(0,0);
  requestAnimationFrame(majProgression);
}
function renderCoursePane(type){
  const chapters = type==="cm" ? (curSubj.cm||[]) : (curSubj.td||[]);
  const pane = document.getElementById(type==="cm"?"pane-0":"pane-1");
  pane.innerHTML="";
  if(!chapters.length){
    pane.innerHTML = vide(type === "cm" ? "cm" : "td", type === "cm" ? "Aucun CM pour l'instant" : "Aucun TD pour l'instant",
      ajoutChapitrePossible() ? "Ajoute ton premier " + (type === "cm" ? "CM" : "TD") + " avec le + en haut. Les " + (type === "cm" ? "TD" : "CM") + " sont dans le menu en haut à droite." : "Ils apparaîtront ici dès qu'ils seront ajoutés.");

    return;
  }
  const chIdx = type==="cm"?curCmIdx:curTdIdx;
  // Sélecteur de chapitre : un seul bouton qui affiche le chapitre ouvert.
  // Le toucher ouvre la liste des autres. Marquer « révisé » se fait en bas du chapitre.
  const n = chapters.length;
  const sel = boutonChapitre(type, chapters, chIdx);
  const row = el("div","chap-row");
  row.appendChild(sel);
  // écouter, puis partager : deux carrés à droite du sélecteur
  if((chapters[chIdx].sections||[]).length && TTS_OK) row.appendChild(lecteurBouton(pane, true));
  // seul l'auteur partage son cours : un chapitre reçu d'une classe reste dans l'app
  if(!chapters[chIdx]._shared) row.appendChild(boutonPartager(type, chapters[chIdx], true));
  pane.appendChild(row);
  // un appui long sur le sélecteur ouvre la fiche du chapitre affiché.
  // Un chapitre partagé n'est pas modifiable ici, il se retire depuis sa classe.
  if(modifiable(chapters[chIdx])) onLongPress(sel, ()=>editChapitre(type, chIdx));
  // retouché : on le dit, et on propose de revenir à ma version
  if(curSubj._over && curSubj._over[type]){
    const r = el("button","add-inline");
    r.style.marginTop = "0";
    r.style.fontSize = "12px";
    r.textContent = "Version modifiée · rétablir l'originale";
    r.addEventListener("click",()=>{
      haptic();
      confirmer("Rétablir la version d'origine ?", "Tes modifications sur ces chapitres seront perdues.", "Rétablir", ()=>retablirOriginal(type));
    });
    pane.appendChild(r);
  }
  const ch=chapters[chIdx];
  pane.dataset.cle = cleVu(curSubj, type, ch);
  { const L = lectureCharger(); L.dernier[curSubj.id] = { type, label:ch.label }; L.global = { id:curSubj.id, type, label:ch.label }; lectureSauver(L); }
  if(reprendreDemande){ reprendreDemande = false; pane._pret = false; const cle = pane.dataset.cle, jeton = pane._jeton = (pane._jeton || 0) + 1;
    setTimeout(()=>reprendreLecture(pane, cle, jeton), 60); }
  const titreCh = partiesChapitre(ch.label).titre;
  if(titreCh){ const h = el("h1","chap-titre"); h.textContent = titreCh; pane.appendChild(h); }
  if(chapitreModifie(curSubj, type, ch)){
    const m = el("div","chap-maj");
    const [a, mo, j] = ch.maj.split("-");
    m.innerHTML = `<b>✦ Mis à jour le ${j}/${mo}</b>${ch.majNote ? `<span>${esc(ch.majNote)}</span>` : ""}`;
    pane.appendChild(m);
  }
  marquerVu(curSubj, type, ch);
  majTypePick();
  lecteurStop();
  // chapitres longs : le bouton flottant « Sommaire » donne accès aux sections
  if((ch.sections||[]).length >= SOMMAIRE_MIN){ pane.dataset.somm = "1"; pane.dataset.min = minutesLecture(ch); }
  else { delete pane.dataset.somm; delete pane.dataset.min; }
  requestAnimationFrame(majProgression);
  // un chapitre qui a sa version « en clair » : on choisit sa lecture, l'app retient le choix
  // un chapitre qui a sa version « en clair » s'affiche dans cette version, complète :
  // les blocs sans version expliquée (organisation, vocabulaire, références) restent tels quels
  // une section du cours, telle que tu l'as écrite
  const blocCours = (sec, si)=>{
    const block=el("div","section");
    block.dataset.sec = si;
    const title=el("h2","section-title"); title.textContent=sec.title;
    const card=el("div","card");
    if(sec.body){ const b=el("div","card-body"); b.innerHTML=texteCours(sec.body); card.appendChild(b); }
    if(sec.img && sec.img.src) card.appendChild(figureCours(sec.img));
    // un document joint : il ne se charge qu'en le touchant, et s'ouvre dans le lecteur de l'app
    const cartePdf = (sec.pdf && sec.pdf.src) ? carteDocument(sec.pdf) : null;
    const sousPuce = cartePdf && Number.isInteger(sec.pdf.apres) && sec.list && sec.pdf.apres < sec.list.length ? sec.pdf.apres : -1;
    if(sec.list&&sec.list.length){ const ul=el("ul","card-list"); sec.list.forEach((it,k)=>{const li=el("li");
      if(k === sousPuce){ const col = el("div","li-col"); col.innerHTML='<span class="li-text">'+texteCours(it)+'</span>'; col.appendChild(cartePdf); li.appendChild(col); }
      else li.innerHTML='<span class="li-text">'+texteCours(it)+'</span>';
      ul.appendChild(li);}); card.appendChild(ul); }
    if(cartePdf && sousPuce < 0) card.appendChild(cartePdf);
    block.appendChild(title);
    block.appendChild(card);
    if(modifiable(ch)) onLongPress(block, ()=>editSection(type, ch, ch.sections.indexOf(sec)));
    return block;
  };
  // la même section, expliquée simplement : le texte, les sigles, le mot à retenir, une image pour se le représenter
  const blocClair = (sec, cs, si)=>{
    const o = typeof cs === "string" ? { b:cs } : cs;
    const block=el("div","section clair-sec");
    block.dataset.sec = si;
    const title=el("h2","section-title"); title.textContent=sec.title;
    const card=el("div","card");
    const corps = o.b || o.body || "";
    if(corps){ const b=el("div","card-body clair-txt"); b.innerHTML=insec(/^\s*</.test(corps) ? corps : "<p>" + corps + "</p>"); card.appendChild(b); }
    const sig = o.sig || o.sigles || [];
    if(sig.length){
      const box=el("div","clair-sigles");
      sig.forEach(([a,d])=>{ const r=el("div","clair-sig"); r.innerHTML=`<b>${insec(a)}</b><span>${insec(d)}</span>`; box.appendChild(r); });
      card.appendChild(box);
    }
    if(o.mot){ const m=el("div","clair-mot"); m.innerHTML=insec(o.mot); card.appendChild(m); }
    if(o.imag){ const m=el("div","clair-imag"); m.innerHTML=`<div class="clair-lab">Pour te le représenter</div>${insec(o.imag)}`; card.appendChild(m); }
    if(sec.img && sec.img.src) card.appendChild(figureCours(sec.img));
    if(sec.pdf && sec.pdf.src) card.appendChild(carteDocument(sec.pdf));
    block.appendChild(title);
    block.appendChild(card);
    if(modifiable(ch)) onLongPress(block, ()=>editSection(type, ch, ch.sections.indexOf(sec)));
    return block;
  };
  const enClair = !!(ch.clair && (ch.clair.sections||[]).some(Boolean));
  if(enClair){
    const mn = el("div","clair-minute");
    mn.innerHTML = `<div class="recap-label">En 1 minute</div><div class="clair-txt">${insec(ch.clair.minute)}</div>`;
    pane.appendChild(mn);
    (ch.sections||[]).forEach((sec,si)=>{
      const cs = ch.clair.sections[si];
      pane.appendChild(cs ? blocClair(sec, cs, si) : blocCours(sec, si));
    });
  }
  else (ch.sections||[]).forEach((sec,si)=>pane.appendChild(blocCours(sec, si)));
  // un chapitre encore vide : le plus simple est d'y coller le cours
  const peutEcrire = modifiable(ch) && !(isCiva() && !ch._own);
  const chVide = !(ch.sections||[]).length;
  if(chVide && peutEcrire){
    const c = el("div","colle-carte rise");
    c.innerHTML = `<div class="colle-carte-ic">${ICO("presse")}</div><div class="colle-carte-t">Ce ${type === "cm" ? "CM" : "TD"} est vide</div>
      <div class="colle-carte-s">Copie le texte de ton cours (Word, PDF, Notes…) et colle-le : l'app le range en sections, avec ses titres et ses listes.</div>`;
    const b1 = el("button","btn colle-go"); b1.type = "button"; b1.textContent = "Coller mon cours";
    b1.addEventListener("click",()=>{ haptic(); collerCours(type, ch); });
    const b2 = el("button","colle-ou"); b2.type = "button"; b2.textContent = "ou écrire une section à la main";
    b2.addEventListener("click",()=>{ haptic(); addSection(type, ch); });
    c.appendChild(b1); c.appendChild(b2);
    pane.appendChild(c);
    return;
  }
  // « À retenir » ferme le chapitre, en clair comme dans le cours (il n'y a plus de fiche de synthèse)
  if((ch.recap||[]).length){
    const r = el("div","recap");
    r.innerHTML = `<div class="recap-label">À retenir</div>` +
      ch.recap.map((x,i)=>`<div class="recap-item"><span class="recap-num">${i+1}</span><span>${esc(x)}</span></div>`).join("");
    pane.appendChild(r);
  }
  // les auteurs et notions déjà vus les années d'avant, avec un lien vers le chapitre
  // calculé juste après l'affichage, pour ne pas retarder l'ouverture du chapitre
  { const place = el("div"), cle = pane.dataset.cle, sj = curSubj; pane.appendChild(place);
    if(anneeMatiere(sj).rang < 2){ place.remove(); }
    else { indexAJour(); indexPret(()=>setTimeout(()=>{ if(pane.dataset.cle !== cle || !place.isConnected) return;
      let dv = null; try{ dv = blocDejaVu(sj, ch); }catch(_){} if(dv) place.replaceWith(dv); else place.remove(); }, 0)); } }
  pane.appendChild(blocNotes(pane.dataset.cle));
  // fin du chapitre : révisé, puis son QCM, puis le chapitre suivant
  const fin = el("div","fin-chap");
  const mot = type === "cm" ? "ce CM" : "ce TD";
  fin.innerHTML = `<div class="fin-titre">Tu as fini ${mot} ?</div>`;
  const etape = (k, cls)=>{ const r = el("button","fin-etape" + (cls ? " " + cls : "")); r.type = "button";
    r.innerHTML = `<span class="fin-num">${k}</span>`; fin.appendChild(r); return r; };
  // 1. révisé
  const rv = etape(1, "fin-rv");
  const majRv = ()=>{
    const on = estRevise(curSubj, type, ch);
    rv.classList.toggle("fait", on);
    rv.innerHTML = `<span class="fin-num">${on ? COCHE_SVG : 1}</span><span class="fin-txt"><span class="fin-nom">${on ? "Lu" : "Marquer comme lu"}</span>
      <span class="fin-sub">${on ? "Touche pour enlever" : "Le point devient vert dans la liste"}</span></span><span class="sw"></span>`;
  };
  majRv();
  rv.addEventListener("click",()=>{
    haptic();
    basculerRevise(curSubj, type, ch);
    majRv();
    // la pastille du haut suit
    const pastille = pane.querySelector(".chap-pick");
    if(pastille) pastille.classList.toggle("revise", estRevise(curSubj, type, ch));
  });
  // arrivée en bas après avoir lu : le chapitre se coche tout seul (on peut toujours l'enlever)
  const ouvertA = Date.now();
  if("IntersectionObserver" in window){
    const obs = new IntersectionObserver(es=>{
      if(!es[0].isIntersecting || !fin.isConnected) return;
      obs.disconnect();
      if(window.scrollY < 300) return;   // chapitre visible d'un coup : pas lu pour autant
      // survolé en quelques secondes : pas lu non plus (20 s, plus 4 s par section, 2 min au plus)
      if(Date.now() - ouvertA < Math.min(120000, 20000 + 4000 * (ch.sections || []).length)) return;
      fin.classList.add("vu");
      if(!estRevise(curSubj, type, ch)){
        basculerRevise(curSubj, type, ch); majRv();
        const pastille = pane.querySelector(".chap-pick"); if(pastille) pastille.classList.add("revise");
        if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
      }
    }, { threshold:.5 });
    setTimeout(()=>{ if(fin.isConnected) obs.observe(fin); }, 600);
  }
  // 2. le QCM de ce chapitre
  let num = 2;
  const nQ = exos(curSubj, "qcm").filter(x=>x && x.ch === ch.label).length;
  if(nQ){
    const p = progressionScope(curSubj, "ch:" + ch.label, "qcm");
    const ok = p.ok === p.total;
    const q = etape(num++, ok ? "fait" : "");
    q.innerHTML = `<span class="fin-num">${ok ? COCHE_SVG : 2}</span><span class="fin-txt"><span class="fin-nom">Faire le QCM de ${mot}</span>
      <span class="fin-sub">${ok ? "Validé" : p.ok ? p.ok + (p.ok > 1 ? " questions validées sur " : " question validée sur ") + p.total : p.total + (p.total > 1 ? " questions" : " question")}${!ok && nbSeries(p.total) > 1 ? " · en " + nbSeries(p.total) + " séries" : ""}</span></span><span class="fin-fl">${IC_CHEV_DROITE}</span>`;
    q.addEventListener("click", ()=>{ haptic(); lancerQCMChapitre(ch.label); });
  } else if(peutCreer(curSubj)){
    const q = etape(num++, "");
    q.innerHTML = `<span class="fin-num">2</span><span class="fin-txt"><span class="fin-nom">Créer le QCM de ${mot}</span>
      <span class="fin-sub">Écris tes questions, ou colle des définitions</span></span><span class="fin-fl">${IC_CHEV_DROITE}</span>`;
    q.addEventListener("click",()=>{ haptic(); formExo(curSubj, "qcm", null, ch.label, ()=>renderCoursePane(type)); });
  }
  // 3. la suite
  const suivant = chapters[chIdx + 1];
  const s3 = etape(num, "fin-suite");
  if(suivant){
    const pc = partiesChapitre(suivant.label);
    s3.innerHTML = `<span class="fin-num">${num}</span><span class="fin-txt"><span class="fin-sub">${type === "cm" ? "CM suivant" : "TD suivant"}</span>
      <span class="fin-nom">${esc(pc.court)}${pc.titre ? " · " + esc(pc.titre) : ""}</span></span><span class="fin-fl">${IC_CHEV_DROITE}</span>`;
    s3.addEventListener("click",()=>{
      haptic();
      if(type === "cm") curCmIdx = chIdx + 1; else curTdIdx = chIdx + 1;
      fermerRecherchePage();
      reprendreDemande = true;
      renderCoursePane(type);
    });
  } else {
    s3.innerHTML = `<span class="fin-num">${num}</span><span class="fin-txt"><span class="fin-sub">C'était le dernier ${type === "cm" ? "CM" : "TD"}</span>
      <span class="fin-nom">S'entraîner sur toute la matière</span></span><span class="fin-fl">${IC_CHEV_DROITE}</span>`;
    s3.addEventListener("click",()=>{ haptic(); setTab(2); window.scrollTo({ top:0, behavior:"smooth" }); });
  }
  pane.appendChild(fin);
  // ajouter une section : pour ceux qui écrivent leurs cours. Les miens viennent de data.js.
  // ajouter une section, coller du texte, une note : tout passe par le « + » en haut

}
// ══════════════════════════════════════════════════
// RÉVISER PAR CHAPITRE
// Chaque exercice porte le libellé de son chapitre (champ ch).
// On peut ainsi réviser un CM ou un TD à part, et le valider petit à petit.
// ══════════════════════════════════════════════════
const SCOPES = {};                         // matière → "all" | "ch:<libellé>" | "auteurs"
var sessionScope = "all";
function scopeCourant(){
  const v = curSubj && SCOPES[curSubj.id];
  if(!v || v === "all") return "all";
  const base = scopeSansSerie(v);
  if(base === "auteurs") return quizAuteurs(curSubj).length ? v : "all";
  if(v === "grand" || v === "erreurs" || base === "lex" || base === "lexinv") return v;
  // le chapitre peut avoir disparu (renommé, supprimé)
  return chapitresAReviser(curSubj).some(c=>"ch:"+c.label === scopeSansSerie(v)) ? v : "all";
}
function choisirScope(v){ if(curSubj) SCOPES[curSubj.id] = v; }
// Au-delà de 25, un exercice est trop long d'une traite : on travaille par petits blocs.
// Toute liste (un CM, un TD, le lexique, les auteurs) se coupe en séries égales
// (50 → 2 × 25, 44 → 2 × 22, 109 → 5 × 21 ou 22), et aucune session ne dépasse 25 questions.
// Vaut pour tous les exercices : QCM, flashcards, textes à trous, questions ouvertes.
// Une série s'écrit « <périmètre>§<numéro> », par exemple « ch:CM4 · 27/10§2 » ou « lex§3 ».
const SERIE_MAX = 25;
function nbSeries(total){ return total > SERIE_MAX ? Math.ceil(total / SERIE_MAX) : 1; }
function scopeSansSerie(sc){ return String(sc || "").replace(/§\d+$/, ""); }
function numSerie(sc){ const m = String(sc || "").match(/§(\d+)$/); return m ? +m[1] : 0; }
function scopesDe(subj, m, base){
  const k = nbSeries(itemsDuScopeBrut(subj, m, base).length);
  return k === 1 ? [base] : Array.from({ length:k }, (_, i)=>base + "§" + (i + 1));
}
function scopesDuChapitre(subj, m, label){ return scopesDe(subj, m, "ch:" + label); }
// « série 1/2 » d'un périmètre, ou rien
function libelleSerie(subj, m, sc){
  const i = numSerie(sc); if(!i) return "";
  return "série " + i + "/" + scopesDe(subj, m, scopeSansSerie(sc)).length;
}
// les chapitres qui ont au moins un exercice
function chapitresAReviser(subj){
  const out = [];
  ["cm","td"].forEach(type=>{
    (subj[type]||[]).forEach(ch=>{
      const n = ["fc","qcm","tr","oq"].reduce((k,m)=>k + exos(subj, m).filter(x=>x && x.ch === ch.label).length, 0);
      if(n) out.push({ type, label:ch.label, n });
    });
  });
  return out;
}
// les exercices d'un mode pour un périmètre, avec leur index d'origine (pour la clé)
// flashcards tirées du lexique : terme → définition, ou définition → terme
function texteSeul(html){ const d = document.createElement("div"); d.innerHTML = String(html || ""); return d.textContent.replace(/\s+/g, " ").trim(); }
function cartesLexique(subj, inverse){
  return lexique(subj).map(x=>{
    const terme = x.terme + (x.prec ? " " + x.prec : ""), def = texteSeul(x.def);
    // le contexte : le cours et la section d'où vient le terme (« Royaume-Uni » seul ne dit rien)
    const pc = partiesChapitre(x.label);
    const ctx = pc.court + (pc.titre ? " · " + pc.titre : "") + (x.sec ? " › " + x.sec : "");
    return inverse ? { q:"À quel terme correspond : « " + def + " » ?", a:terme, ch:x.label, ctx } : { q:terme, a:def, ch:x.label, ctx };
  });
}
function itemsDuScope(subj, m, scope){
  const i = numSerie(scope);
  const tout = itemsDuScopeBrut(subj, m, scopeSansSerie(scope));
  if(!i) return tout;
  // la série i sur k : des parts égales, dans l'ordre du cours
  const n = tout.length, k = nbSeries(n);
  return tout.slice(Math.floor((i - 1) * n / k), Math.floor(i * n / k));
}
function itemsDuScopeBrut(subj, m, scope){
  if(scope === "lex" || scope === "lexinv") return m === "fc" ? cartesLexique(subj, scope === "lexinv").map((item,i)=>({ item, i })) : [];
  if(scope === "erreurs") return itemsDuScope(subj, m, "grand").filter(x=>estErreur(cardKey(subj.id, m, x.item, x.i)));
  if(scope === "auteurs") return m === "qcm" ? quizAuteurs(subj).map((item,i)=>({ item, i })) : [];
  if(scope === "grand"){
    // tout dedans : les QCM de tous les CM et TD, plus ceux sur les auteurs
    const reels = exos(subj, m).map((item,i)=>({ item, i }));
    return m === "qcm" ? reels.concat(quizAuteurs(subj).map((item,i)=>({ item, i }))) : reels;
  }
  const arr = exos(subj, m).map((item,i)=>({ item, i }));
  if(!scope || scope === "all") return arr;
  const lab = scope.slice(3);
  return arr.filter(x=>x.item && x.item.ch === lab);
}
// une carte est « validée » quand la dernière réponse était bonne
function estAcquise(key){ const c = SRS[key]; return !!(c && c.rep > 0); }
function progressionScope(subj, scope, m){
  const xs = itemsDuScope(subj, m || "qcm", scope);
  let ok = 0;
  xs.forEach(x=>{ if(estAcquise(cardKey(subj.id, m || "qcm", x.item, x.i))) ok++; });
  return { ok, total:xs.length };
}
function nomScope(scope){
  const ser = numSerie(scope) ? " · " + libelleSerie(curSubj, curMode || "qcm", scope) : "";
  if(ser) return nomScope(scopeSansSerie(scope)) + ser;
  if(scope === "erreurs") return "Mes erreurs";
  if(scope === "lex") return "Lexique";
  if(scope === "lexinv") return "Lexique à l'envers";
  if(scope === "auteurs") return "Auteurs";
  if(scope === "grand") return "Le grand QCM";
  if(scope === "all") return "Toute la matière";
  return scope.slice(3);
}


// ══════════════════════════════════════════════════
// EXERCICES TIRÉS DE TES COURS
// Chaque définition (« Terme : … ») donne deux questions de QCM, rangées dans son chapitre :
// « Que désigne ce terme ? » et « Quel terme correspond à cette définition ? ».
// Les mauvaises réponses sont les autres définitions de tes cours : rien n'est inventé.
// Mes cours de data.js ont déjà leurs QCM écrits à la main : on n'y ajoute rien.
// ══════════════════════════════════════════════════
const QCM_LEX_CACHE = {};
function genereAuto(subj){ return !!subj && !(isCiva() && !subj._own); }
function signatureCours(subj){
  let n = 0, l = 0;
  ["cm","td"].forEach(t=>(subj[t]||[]).forEach(ch=>(ch.sections||[]).forEach(sec=>{ n++; l += String(sec.body||"").length + (sec.list||[]).join("").length + String(sec.title||"").length; })));
  return subj.id + "|" + n + "|" + l;
}
function qcmLexique(subj){
  if(!genereAuto(subj)) return [];
  const sig = signatureCours(subj);
  if(QCM_LEX_CACHE[subj.id] && QCM_LEX_CACHE[subj.id].sig === sig) return QCM_LEX_CACHE[subj.id].qs;
  const propre = x=>({ terme:x.terme, def:couper(texteSeul(x.def), 160), label:x.label, sec:x.sec, plein:texteSeul(x.def) });
  const ici = lexique(subj).map(propre);
  // les définitions des autres matières complètent les mauvaises réponses quand il en manque
  const ailleurs = [];
  if(ici.length < 4) SUBJECTS.forEach(s=>{ if(s !== subj && genereAuto(s)) lexique(s).forEach(x=>ailleurs.push(propre(x))); });
  const qs = [];
  if(ici.length + ailleurs.length >= 4){
    const meme = (a,b)=>nzA(a) === nzA(b);
    const tirer = (rng, x, champ, ok)=>{
      // le même chapitre d'abord (plus difficile), puis la matière, puis le reste
      const groupes = [ici.filter(y=>y.label === x.label), ici.filter(y=>y.label !== x.label), ailleurs];
      const pris = [];
      groupes.forEach(g=>{
        const pool = g.filter(y=>y !== x && !meme(y.terme, x.terme) && !meme(y[champ], x[champ]) && ok(y));
        while(pool.length && pris.length < 3){
          const y = pool.splice(Math.floor(rng() * pool.length), 1)[0];
          if(!pris.some(p=>meme(p[champ], y[champ]))) pris.push(y);
        }
      });
      return pris;
    };
    ici.forEach(x=>{
      const rng = graineDe(subj.id + "|lex|" + x.terme);
      const e = couper(x.terme + " : " + x.plein, 320);
      // 1. le terme → sa définition ; la bonne réponse ne doit pas être la plus longue
      let d = tirer(rng, x, "def", y=>!nzA(y.def).includes(nzA(x.terme)));
      if(d.length === 3 && !d.some(y=>y.def.length >= x.def.length)){
        const plusLongue = tirer(rng, x, "def", y=>y.def.length >= x.def.length && !nzA(y.def).includes(nzA(x.terme)))[0];
        if(plusLongue) d = [plusLongue, ...d.filter(y=>y !== plusLongue).slice(0, 2)];
      }
      if(d.length === 3 && d.some(y=>y.def.length >= x.def.length))
        qs.push({ ch:x.label, q:"Que désigne « " + x.terme + " » ?", opts:[x.def, ...d.map(y=>y.def)], c:0, e, _auto:true });
      // 2. la définition → le terme
      let t = tirer(rng, x, "terme", y=>true);
      if(t.length === 3 && !t.some(y=>y.terme.length >= x.terme.length)){
        const plusLong = tirer(rng, x, "terme", y=>y.terme.length >= x.terme.length)[0];
        if(plusLong) t = [plusLong, ...t.filter(y=>y !== plusLong).slice(0, 2)];
      }
      if(t.length === 3 && t.some(y=>y.terme.length >= x.terme.length))
        qs.push({ ch:x.label, q:"Quel terme correspond à cette définition : « " + couper(x.plein, 220) + " » ?", opts:[x.terme, ...t.map(y=>y.terme)], c:0, e, _auto:true });
    });
  }
  QCM_LEX_CACHE[subj.id] = { sig, qs };
  return qs;
}
// les exercices d'une matière : ceux écrits, plus ceux tirés des définitions
function exos(subj, m){
  const reels = (subj && subj[m]) || [];
  return m === "qcm" ? reels.concat(qcmLexique(subj)) : reels;
}


// ── Écrire ses propres questions et flashcards, rangées dans un chapitre ──
// Mes matières de data.js ne sont pas concernées : leurs exercices viennent de data.js.
function peutCreer(subj){ return canEdit() && !!subj && !subj._shared && !(isCiva() && !subj._own); }
function mesExos(subj, m){ return (subj[m]||[]).map((x,i)=>({ x, i })).filter(o=>o.x && !o.x._shared && !o.x._auto); }
function formExo(subj, m, idx, chDefaut, apres){
  const chs = [...(subj.cm||[]), ...(subj.td||[])].filter(c=>!c._shared);
  if(!chs.length){ toast("Ajoute d'abord un CM ou un TD : chaque question se range dans un chapitre."); return; }
  const item = idx != null ? subj[m][idx] : null;
  const options = chs.map(c=>({ v:c.label, label:partiesChapitre(c.label).court }));
  const chOk = v=>chs.some(c=>c.label === v) ? v : null;
  const ch = { key:"ch", label:"Chapitre", type:"choice", options, value:(item && chOk(item.ch)) || chOk(chDefaut) || chs[chs.length - 1].label };
  const fini = ()=>{ saveContent(); if(apres) apres(); };
  const suppr = item ? ()=>{ subj[m].splice(idx, 1); fini(); toast(m === "qcm" ? "Question supprimée." : "Carte supprimée."); } : null;
  if(m === "fc"){
    openForm(item ? "Modifier la flashcard" : "Nouvelle flashcard", [ch,
      { key:"q", label:"Recto : la question", type:"area", placeholder:"Ex. Qu'est-ce que l'habitus ?", value:item ? item.q : "" },
      { key:"a", label:"Verso : la réponse", type:"area", placeholder:"Ex. Un système de dispositions durables…", value:item ? item.a : "" }
    ], item ? "Enregistrer" : "Ajouter", v=>{
      if(!v.q || !v.a) return "Il faut une question et une réponse.";
      const o = { ch:v.ch, q:v.q, a:v.a, _own:true };
      if(item) subj.fc[idx] = o; else (subj.fc = subj.fc || []).push(o);
      fini(); toast(item ? "Carte modifiée." : "Carte ajoutée.");
    }, suppr);
    return;
  }
  const mauvaises = item ? item.opts.filter((_,k)=>k !== item.c) : [];
  let averti = false;
  openForm(item ? "Modifier la question" : "Nouvelle question", [ch,
    { key:"q", label:"La question", type:"area", placeholder:"Ex. Qui a écrit Les Héritiers ?", value:item ? item.q : "" },
    { key:"bonne", label:"La bonne réponse", placeholder:"Ex. Bourdieu et Passeron", value:item ? item.opts[item.c] : "" },
    { key:"m1", label:"Mauvaise réponse 1", placeholder:"Ex. Durkheim", value:mauvaises[0] || "" },
    { key:"m2", label:"Mauvaise réponse 2", placeholder:"Ex. Boudon et Lahire", value:mauvaises[1] || "" },
    { key:"m3", label:"Mauvaise réponse 3 (facultatif)", placeholder:"Ex. Dubet", value:mauvaises[2] || "" },
    { key:"e", label:"Explication (facultatif)", type:"area", placeholder:"Ce qu'il faut retenir", value:item ? (item.e || "") : "",
      hint:"Elle s'affiche après ta réponse, juste ou fausse. Les réponses sont mélangées à chaque fois." }
  ], item ? "Enregistrer" : "Ajouter", v=>{
    const faux = [v.m1, v.m2, v.m3].filter(Boolean);
    if(!v.q) return "Écris la question.";
    if(!v.bonne) return "Écris la bonne réponse.";
    if(faux.length < 2) return "Il faut au moins deux mauvaises réponses.";
    const tous = [v.bonne, ...faux].map(nzA);
    if(new Set(tous).size !== tous.length) return "Deux réponses sont identiques.";
    // une bonne réponse plus longue que les autres se devine : on prévient une fois
    if(!averti && v.bonne.length > Math.max(...faux.map(x=>x.length)) + 4){
      averti = true;
      return "La bonne réponse est la plus longue : on risque de la deviner. Allonge une mauvaise réponse, ou touche encore « " + (item ? "Enregistrer" : "Ajouter") + " » pour garder comme ça.";
    }
    const o = { ch:v.ch, q:v.q, opts:[v.bonne, ...faux], c:0, _own:true };
    if(v.e) o.e = v.e;
    if(item) subj.qcm[idx] = o; else (subj.qcm = subj.qcm || []).push(o);
    fini(); toast(item ? "Question modifiée." : "Question ajoutée.");
  }, suppr);
}
// la liste de ce que j'ai écrit, rangée par chapitre : toucher pour modifier
function listeMesExos(subj, m, apres){
  const mes = mesExos(subj, m);
  const ordre = [...(subj.cm||[]), ...(subj.td||[])].map(c=>c.label);
  const groupes = [];
  ordre.concat(["\u0000"]).forEach(lab=>{
    const xs = mes.filter(o=>lab === "\u0000" ? !ordre.includes(o.x.ch) : o.x.ch === lab);
    if(!xs.length) return;
    groupes.push({ titre:lab === "\u0000" ? "Sans chapitre" : partiesChapitre(lab).court, lignes:xs.map(o=>({
      nom:couper(o.x.q, 90),
      sous:m === "qcm" ? "Bonne réponse : " + couper(o.x.opts[o.x.c], 60) : couper(o.x.a, 70),
      onTap:()=>{ closePicker(); setTimeout(()=>formExo(subj, m, o.i, null, apres), 320); }
    })) });
  });
  feuillePartage(m === "qcm" ? "Mes questions" : "Mes flashcards", "Touche-en une pour la modifier ou la supprimer.", groupes);
}

// ── QCM sur les auteurs, fabriqués à partir des fiches ──
// Toujours les mêmes questions pour une fiche donnée : le suivi des réponses tient d'une fois sur l'autre.
const QUIZ_AUTEURS_CACHE = {};
function nzA(t){ return String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[’‘]/g,"'").replace(/\s+/g," ").trim(); }
function graineDe(str){
  let h = 2166136261;
  for(let k=0;k<str.length;k++){ h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ()=>{ h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
function ficheAuteur(a0){
  return {
    nom: String(a0.nom||"").trim(),
    courant: a0.courant || "", periode: a0.periode || "",
    texte: a0.these || a0.contrib || "",
    resume: a0.contrib || "",
    concepts: Array.isArray(a0.concepts) ? a0.concepts.filter(Boolean) : [],
    retenir: a0.retenir || ""
  };
}
function nomsPropres(nom){
  return nzA(nom).split(/\s+et\s+|&|,|\s+/).map(x=>x.trim()).filter(x=>x.length >= 4 && !["avec"].includes(x));
}
function memePersonne(a, b){
  const x = nomsPropres(a), y = nomsPropres(b);
  return x.some(t=>y.includes(t));
}
function masquerNom(txt, nom){
  let t = String(txt||"");
  String(nom||"").split(/\s+et\s+|&|,|\s+/).map(x=>x.trim()).filter(x=>x.length >= 4).forEach(mot=>{
    const re = new RegExp("(^|[^\\p{L}])" + mot.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + "(?=[^\\p{L}]|$)", "giu");
    t = t.replace(re, "$1…");
  });
  return t;
}
function couper(t, n){ t = String(t||"").trim(); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/,"") + "…" : t; }
// nombre de QCM : un par chapitre qui a des questions (pas le nombre de questions)
function nbQCM(liste){ return new Set((liste||[]).filter(Boolean).map(x=>x.ch || "")).size; }
function quizAuteurs(subj){
  if(!subj) return [];
  const sig = subj.id + "|" + (subj.auteurs||[]).map(a=>a && a.nom).join("|");
  if(QUIZ_AUTEURS_CACHE[sig]) return QUIZ_AUTEURS_CACHE[sig];
  const fiches = (subj.auteurs||[]).filter(a=>a && a.nom).map(ficheAuteur);
  if(fiches.length < 2){ QUIZ_AUTEURS_CACHE[sig] = []; return []; }
  // de quoi compléter les mauvaises réponses quand la matière a peu d'auteurs
  const ailleurs = [];
  SUBJECTS.forEach(s=>{ if(s.id !== subj.id) (s.auteurs||[]).forEach(a=>{ if(a && a.nom) ailleurs.push(ficheAuteur(a)); }); });
  // les notions de la matière d'abord : des mauvaises réponses venues d'ailleurs seraient trop faciles
  const notionsIci = [], notionsAilleurs = [], vuesN = new Set();
  // une notion normalisée → les fiches qui la portent (calculé une fois, pas à chaque tirage)
  const porteurs = new Map();
  [...fiches, ...ailleurs].forEach(f=>f.concepts.forEach(c=>{ const k = nzA(c); if(!porteurs.has(k)) porteurs.set(k, []); porteurs.get(k).push(f); }));
  fiches.forEach(f=>f.concepts.forEach(c=>{ const k = nzA(c); if(!vuesN.has(k)){ vuesN.add(k); notionsIci.push(c); } }));
  ailleurs.forEach(f=>f.concepts.forEach(c=>{ const k = nzA(c); if(!vuesN.has(k)){ vuesN.add(k); notionsAilleurs.push(c); } }));
  const TC = new Map(), NP = new Map();
  const texteComplet = f => { if(!TC.has(f)) TC.set(f, nzA([f.texte, f.retenir, f.courant, f.concepts.join(" ")].join(" "))); return TC.get(f); };
  const nomsDe = f => { if(!NP.has(f)) NP.set(f, nomsPropres(f.nom)); return NP.get(f); };
  const tirer = (rng, liste, n, ok)=>{
    const pris = [];
    const pool = liste.slice();
    while(pool.length && pris.length < n){
      const k = Math.floor(rng() * pool.length);
      const x = pool.splice(k,1)[0];
      if(ok(x, pris)) pris.push(x);
    }
    return pris;
  };
  const explication = f => couper(f.nom + " : " + (f.retenir || f.texte), 320);
  // deux auteurs qui se citent (Bourdieu et Passeron, par exemple) partagent leurs notions :
  // l'un ne doit jamais servir de mauvaise réponse à l'autre
  const lies = (f, g)=> nomsDe(f).some(t=>nomsDe(g).includes(t))
    || nomsDe(g).some(t=>texteComplet(f).includes(t))
    || nomsDe(f).some(t=>texteComplet(g).includes(t));
  const motsForts = t => nzA(t).split(/[^a-z0-9]+/).filter(w=>w.length >= 7);
  const prochesDe = f => { const m = new Set(); f.concepts.forEach(c=>motsForts(c).forEach(w=>m.add(w))); return m; };
  const nomsDistincts = (f, rng, exclure)=>{
    const ok = (g, pris)=> !lies(f, g) && !pris.some(p=>memePersonne(p.nom, g.nom)) && (!exclure || !exclure(g));
    let d = tirer(rng, fiches, 3, ok);
    if(d.length < 3) d = d.concat(tirer(rng, ailleurs, 3 - d.length, (g,pris)=>ok(g, d.concat(pris))));
    return d.map(g=>g.nom);
  };
  const out = [];
  fiches.forEach(f=>{
    const rng = graineDe(subj.id + f.nom);
    // 1. les notions → l'auteur, seulement avec des notions qui n'appartiennent qu'à lui ici
    const propres = f.concepts.filter(c=>!fiches.some(g=>g !== f && texteComplet(g).includes(nzA(c))));
    if(propres.length){
      const notions = propres.slice(0, 2);
      const d = nomsDistincts(f, rng, g=>notions.some(n=>texteComplet(g).includes(nzA(n))));
      if(d.length === 3) out.push({ ch:"auteurs", q:"Quel auteur associe-t-on à " + notions.map(n=>"« "+n+" »").join(" et ") + " ?", opts:[f.nom, ...d], c:0, e:explication(f) });
    }
    // 2. l'auteur → une de ses notions
    if(f.concepts.length){
      const bonne = f.concepts[f.concepts.length - 1];
      const siens = texteComplet(f);
      const proches = prochesDe(f);
      const proprietaires = n => porteurs.get(nzA(n)) || [];
      const okN = (n, pris)=> nzA(n) !== nzA(bonne) && !siens.includes(nzA(n))
        && !f.concepts.some(c=>nzA(c)===nzA(n))
        && !motsForts(n).some(w=>proches.has(w))
        && !proprietaires(n).some(g=>lies(f, g))
        && !pris.some(p=>nzA(p)===nzA(n));
      let d = tirer(rng, notionsIci, 3, okN);
      if(d.length < 3) d = d.concat(tirer(rng, notionsAilleurs, 3 - d.length, (n,pris)=>okN(n, d.concat(pris))));
      if(d.length === 3) out.push({ ch:"auteurs", q:"Laquelle de ces notions renvoie à " + f.nom + " ?", opts:[bonne, ...d], c:0, e:explication(f) });
    }
    // 3. le portrait → l'auteur
    // un courant seul est trop vague : il faut aussi la période, ou le résumé d'une ancienne fiche
    const portrait = (f.courant && f.periode)
      ? masquerNom(f.courant + " · " + f.periode, f.nom)
      : (!f.courant && f.resume) ? masquerNom(f.resume, f.nom) : "";
    if(portrait && portrait.replace(/[…\s.·]/g,"").length > 6){
      const d = nomsDistincts(f, rng, g=> f.courant && nzA(g.courant) === nzA(f.courant));
      if(d.length === 3) out.push({ ch:"auteurs", q:"Qui est-ce ? " + couper(portrait, 220), opts:[f.nom, ...d], c:0, e:explication(f) });
    }
  });
  QUIZ_AUTEURS_CACHE[sig] = out;
  return out;
}

// ── Barre des périmètres : Tout · CM · TD · Auteurs ──
// lance directement le QCM d'un chapitre (bouton en bas du cours)
function lancerQCMChapitre(label){
  const scs = scopesDuChapitre(curSubj, "qcm", label);
  const suivante = scs.find(sc=>{ const p = progressionScope(curSubj, sc, "qcm"); return p.ok < p.total; }) || scs[0];
  choisirScope(suivante);
  const t = curTab;
  retourSession = ()=>{ setTab(t); showScreen("split"); };
  startSession("qcm");
}
// où revenir en fin de session (null = l'onglet Réviser)
var retourSession = null;
function quitterSession(){
  const f = retourSession;
  if(f) f(); else { setTab(2); showScreen("split"); }
}

// ── La liste des QCM : le grand, chaque CM, chaque TD, les auteurs ──
// La liste d'un type d'exercice : tout d'un coup, chaque CM, chaque TD (et les auteurs pour les QCM).
const CHOIX_MODES = {
  qcm:{ titre:"QCM", grand:"Le grand QCM", unite:"questions", valide:"Un QCM réussi est validé. Chaque session reprend d'abord ceux qui ne le sont pas encore." },
  fc: { titre:"Flashcards", grand:"Toutes les flashcards", unite:"cartes", valide:"Une carte notée « Difficile » ou « Facile » est validée. Chaque session reprend d'abord celles qui ne le sont pas encore." },
  tr: { titre:"Textes à trous", grand:"Tous les textes à trous", unite:"phrases", valide:"Un trou bien rempli est validé. Chaque session reprend d'abord ceux qui ne le sont pas encore." },
  oq: { titre:"Questions ouvertes", grand:"Toutes les questions", unite:"questions", valide:"Une réponse que tu juges réussie est validée. Chaque session reprend d'abord celles qui ne le sont pas encore." }
};
function renderChoix(m){
  document.getElementById("btn-qcmchoix-add").hidden = true;
  const cfg = CHOIX_MODES[m] || CHOIX_MODES.qcm;
  document.getElementById("qcmchoix-eyebrow").textContent = curSubj.title;
  document.getElementById("qcmchoix-titre").textContent = cfg.titre;
  document.getElementById("qcmchoix-sub").textContent = cfg.valide;
  const box = document.getElementById("qcmchoix-inner");
  box.innerHTML = "";
  const carte = (scope, icone, titre, cls)=>{
    const p = progressionScope(curSubj, scope, m);
    if(!p.total) return null;
    const valide = p.ok === p.total;
    const b = el("button","qc-card rise" + (cls ? " " + cls : "") + (valide ? " valide" : ""));
    b.type = "button";
    const sub = valide ? "✓ validé · " + p.total + " " + cfg.unite
      : p.ok ? p.ok + " / " + p.total + " validés"
      : p.total + " " + cfg.unite;
    b.innerHTML = `<div class="mode-icon">${icone}</div>
      <div class="qc-info"><div class="qc-name">${esc(titre)}</div><div class="qc-sub">${esc(sub)}</div>
      <div class="qc-bar"><i style="width:${Math.round(p.ok/p.total*100)}%"></i></div></div>`;
    b.addEventListener("click",()=>{
      haptic();
      choisirScope(scope);
      retourSession = ()=>renderChoix(m);
      startSession(m);
    });
    return b;
  };
  const grand = carte("grand", ICO("grand"), cfg.grand, "grand");
  if(grand){
    const sous = grand.querySelector(".qc-sub");
    sous.textContent = sous.textContent + " · " + SERIE_MAX + " à la fois, le non validé d'abord";
    box.appendChild(grand);
  }
  // mes erreurs : les questions ratées, ici ou en mode examen
  if(m === "qcm" && grand){
    const nErr = itemsDuScope(curSubj, "qcm", "erreurs").length;
    const e = el("button","qc-card rise erreurs" + (nErr ? "" : " vide")); e.type = "button";
    e.innerHTML = `<div class="mode-icon">${ICO(nErr ? "erreurs" : "valide")}</div>
      <div class="qc-info"><div class="qc-name">Mes erreurs</div>
      <div class="qc-sub">${nErr ? nErr + " question" + (nErr > 1 ? "s" : "") + " ratée" + (nErr > 1 ? "s" : "") + " · ici ou en mode examen" : "Aucune pour l'instant. Les questions ratées viendront ici."}</div></div>
      ${nErr ? `<span class="mode-count mode-due">${nErr}</span>` : ""}`;
    if(nErr) e.addEventListener("click",()=>{ haptic(); choisirScope("erreurs"); retourSession = ()=>renderChoix(m); startSession(m); });
    box.appendChild(e);
  }
  const chs = chapitresAReviser(curSubj).filter(c=>exos(curSubj, m).some(x=>x && x.ch === c.label));
  [["cm","Cours",ICO("cm")],["td","TD",ICO("td")]].forEach(([type, nom, icone])=>{
    const liste = chs.filter(c=>c.type === type);
    if(!liste.length) return;
    const g = el("div","qc-group"); g.textContent = nom;
    box.appendChild(g);
    liste.forEach(c=>scopesDuChapitre(curSubj, m, c.label).forEach(sc=>{
      const ser = libelleSerie(curSubj, m, sc);
      const b = carte(sc, icone, c.label + (ser ? " · " + ser : "")); if(b) box.appendChild(b);
    }));
  });
  // les termes du lexique, en cartes, dans les deux sens
  if(m === "fc" && lexique(curSubj).length){
    const g = el("div","qc-group"); g.textContent = "Lexique";
    box.appendChild(g);
    [["lex", ICO("lexique"), "Le terme → sa définition"], ["lexinv", ICO("inverse"), "La définition → le terme"]].forEach(([base, ic, nom])=>
      scopesDe(curSubj, m, base).forEach(sc=>{ const ser = libelleSerie(curSubj, m, sc); const b = carte(sc, ic, nom + (ser ? " · " + ser : "")); if(b) box.appendChild(b); }));
  }
  if(m === "qcm" && quizAuteurs(curSubj).length){
    const g = el("div","qc-group"); g.textContent = "Auteurs";
    box.appendChild(g);
    scopesDe(curSubj, m, "auteurs").forEach(sc=>{ const ser = libelleSerie(curSubj, m, sc); const b = carte(sc, ICO("auteurs"), "Les auteurs et leurs notions" + (ser ? " · " + ser : "")); if(b) box.appendChild(b); });
  }
  // écrire ses propres questions (ou cartes), et retrouver celles déjà écrites
  if((m === "qcm" || m === "fc") && peutCreer(curSubj)){
    if(!box.querySelector(".qc-card")){
      const v = el("div"); v.innerHTML = vide(m, m === "qcm" ? "Aucun QCM pour l'instant" : "Aucune flashcard pour l'instant",
        m === "qcm" ? "Écris tes questions ici. Les définitions de tes cours (« Terme : … ») donnent aussi des QCM tout seuls." : "Écris tes cartes ici. Les définitions de tes cours (« Terme : … ») donnent aussi des cartes toutes seules.");
      box.appendChild(v.firstChild);
    }
    const apres = ()=>renderChoix(m);
    const row = el("div","ajout-row exo-row");
    const qp = document.getElementById("btn-qcmchoix-add");
    qp.hidden = false;
    qp.onclick = ()=>{ haptic(); formExo(curSubj, m, null, null, apres); };
    const n = mesExos(curSubj, m).length;
    if(n){
      const mes = el("button","add-inline"); mes.type = "button";
      mes.textContent = (m === "qcm" ? "Mes questions (" : "Mes cartes (") + n + ")";
      mes.addEventListener("click",()=>{ haptic(); listeMesExos(curSubj, m, apres); });
      row.appendChild(mes);
      box.appendChild(row);
    }
  }
  // les exercices sans chapitre (ajoutés à la main, partagés) restent dans « tout d'un coup »
  showScreen("qcmchoix");
  window.scrollTo(0,0);
}

function renderTrainPane(){
  const pane=document.getElementById("pane-2"); pane.innerHTML="";
  const hasTrain=peutCreer(curSubj)||lexique(curSubj).length||(curSubj.fc&&curSubj.fc.length)||(curSubj.qcm&&curSubj.qcm.length)||(curSubj.oq&&curSubj.oq.length)||(curSubj.tr&&curSubj.tr.length)||(curSubj.auteurs&&curSubj.auteurs.length);
  if(!hasTrain){ pane.innerHTML = vide("entrainer", "Rien à réviser pour l'instant", isCiva() ? "Les QCM et les fiches arriveront avec les cours de cette matière." : "Les QCM et les fiches arrivent par tes classes : quand quelqu'un y partage les exercices d'une matière, ils s'ajoutent ici."); return; }
  // Combien de cartes sont à revoir aujourd'hui ?
  const dueTotal = dueCount(curSubj);
  const intro=el("div","train-intro");
  intro.innerHTML = dueTotal > 0
    ? `<span class="due-pill">${dueTotal} question${dueTotal>1?"s":""} à revoir aujourd'hui</span>`
    : `<span class="due-pill done">✓ Rien à revoir aujourd'hui</span>`;
  pane.appendChild(intro);
  const scope = "all";
  const grid=el("div","mode-grid");
  // mes erreurs : en premier, dès qu'il y en a
  const nErr = itemsDuScope(curSubj, "qcm", "erreurs").length;
  if(nErr){
    const card = el("button","mode-card mode-erreurs");
    card.innerHTML = `<div class="mode-icon">${ICO("qcm")}</div>
      <div class="mode-info"><div class="mode-name">Mes erreurs</div><div class="mode-desc">Les questions ratées, à reprendre</div></div>
      <span class="mode-count mode-due">${nErr}</span>`;
    card.addEventListener("click",()=>{ haptic(); choisirScope("erreurs"); startSession("qcm"); });
    grid.appendChild(card);
  }
  // mode examen : dès qu'il y a de quoi faire un vrai sujet
  const nExam = examSources(curSubj).reduce((k,x)=>k + x.n, 0);
  if(nExam >= 5){
    const der = examNotes()[curSubj.id];
    const card = el("button","mode-card");
    card.innerHTML = `<div class="mode-icon">${ICO("examen")}</div>
      <div class="mode-info"><div class="mode-name">Mode examen</div><div class="mode-desc">${der ? "Dernière note : " + noteFr(der.note) + " / 20" : "Chrono, pas de correction pendant, note sur 20"}</div></div>`;
    card.addEventListener("click",()=>{ haptic(); renderExamenChoix(); });
    grid.appendChild(card);
  }
  const modes=[
    {m:"fc",icon:ICO("fc"),title:"Flashcards",desc:"Question → retourne → tu te notes"},
    {m:"qcm",icon:ICO("qcm"),title:"QCM par chapitre",desc:"4 choix · 20 s · explication après"},
    {m:"oq",icon:ICO("oq"),title:"Questions ouvertes",desc:"Rédige, puis compare au corrigé"},
    {m:"tr",icon:ICO("tr"),title:"Texte à trous",desc:"Le bon mot · 4 choix · 15 s"},
  ];
  modes.forEach(mo=>{
    const arr=itemsDuScope(curSubj, mo.m, scope);
    if(!arr.length && !(mo.m === "fc" && lexique(curSubj).length)){
      if(!((mo.m === "qcm" || mo.m === "fc") && peutCreer(curSubj))) return;
      const card = el("button","mode-card");
      card.innerHTML = `<div class="mode-icon">${mo.icon}</div>
        <div class="mode-info"><div class="mode-name">${mo.title}</div><div class="mode-desc">Aucun pour l'instant · écris les tiens</div></div>
        <span class="mode-count">0</span>`;
      card.addEventListener("click",()=>{ haptic(); renderChoix(mo.m); });
      grid.appendChild(card);
      return;
    }
    // un QCM (ou une série) par CM et TD, plus celui des auteurs : on compte ça, pas les questions
    const series = chapitresAReviser(curSubj).filter(c=>exos(curSubj, mo.m).some(x=>x && x.ch === c.label)).flatMap(c=>scopesDuChapitre(curSubj, mo.m, c.label));
    if(mo.m === "qcm" && curSubj.auteurs && curSubj.auteurs.length && quizAuteurs(curSubj).length) series.push(...scopesDe(curSubj, "qcm", "auteurs"));
    if(mo.m === "fc" && lexique(curSubj).length) series.push(...scopesDe(curSubj, "fc", "lex"), ...scopesDe(curSubj, "fc", "lexinv"));
    const decoupe = series.some(sc=>numSerie(sc));
    const aAuteurs = series.some(sc=>scopeSansSerie(sc) === "auteurs"), aLex = series.some(sc=>scopeSansSerie(sc) === "lex");
    const n = series.length;
    const valides = series.filter(sc=>{ const p = progressionScope(curSubj, sc, mo.m); return p.total && p.ok === p.total; }).length;
    const nom = mo.m === "qcm" ? n + " QCM" : n + " série" + (n > 1 ? "s" : "");
    const unite = { qcm:"questions", fc:"cartes", tr:"phrases", oq:"questions" }[mo.m];
    const detail = decoupe ? SERIE_MAX + " " + unite + " max par série"
      : mo.m === "qcm" ? "un par CM/TD" + (aAuteurs ? ", plus les auteurs" : "")
      : mo.m === "fc" && aLex ? (n > 2 ? "une par CM/TD, plus le lexique" : "le lexique, dans les deux sens") : (n > 1 ? "une par CM/TD" : "");
    const txt = nom + (valides && valides < n ? " · " + valides + " validé" + (mo.m === "qcm" ? "" : "e") + (valides > 1 ? "s" : "") : detail ? " · " + detail : "");
    const fini = n && valides === n;
    const card=el("button","mode-card");
    card.innerHTML=`<div class="mode-icon">${mo.icon}</div>
      <div class="mode-info"><div class="mode-name">${mo.title}</div><div class="mode-desc">${esc(fini ? "Tout validé · " + nom : txt)}</div></div>
      <span class="mode-count${fini ? " mode-badge-done" : ""}">${fini ? "✓" : n}</span>`;
    card.addEventListener("click",()=>{ haptic(); renderChoix(mo.m); });
    grid.appendChild(card);
  });
  // devoirs corrigés : toujours proposé, même vide, sinon impossible d'en créer un
  if(scope === "all" && (canEdit() || (curSubj.dev && curSubj.dev.length))){
    const n = (curSubj.dev||[]).length;
    const nc = (curSubj.dev||[]).filter(estCorrige).length, nr = n - nc;
    const card=el("button","mode-card");
    card.innerHTML=`<div class="mode-icon">${ICO("devoirs")}</div>
      <div class="mode-info"><div class="mode-name">Devoirs</div>
      <div class="mode-desc">${n ? [nr ? nr+" à remplir" : "", nc ? nc+" corrigé"+(nc>1?"s":"") : ""].filter(Boolean).join(" · ") : "Aucun pour l'instant"}</div></div>
      <span class="mode-count${nr ? " mode-due" : ""}">${n}</span>`;
    card.addEventListener("click",renderDevoirs);
    grid.appendChild(card);
  }

  if((scope === "all" || scope === "auteurs") && curSubj.auteurs && curSubj.auteurs.length){
    const card=el("button","mode-card");
    card.innerHTML=`<div class="mode-icon">${ICO("auteurs")}</div>
      <div class="mode-info"><div class="mode-name">Auteurs</div><div class="mode-desc">Fiches à déplier</div></div>
      <span class="mode-count">${curSubj.auteurs.length}</span>`;
    card.addEventListener("click",renderAuteurs);
    grid.appendChild(card);
  }
  pane.appendChild(grid);
}

// ══════════════════════════════════════════════════
// AUTEURS
// ══════════════════════════════════════════════════
// Les noms sous lesquels chercher un auteur dans le texte des chapitres.
function nomsDeRecherche(nom){
  const sansAccents = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const termes = [];
  String(nom||"").split(/\s+et\s+|&|,/).forEach(part=>{
    const mots = part.trim().split(/\s+/).filter(Boolean);
    if(!mots.length) return;
    const patro = sansAccents(mots[mots.length-1]);   // le prénom produirait trop de faux positifs
    if(patro.length >= 5) termes.push(patro);
    patro.split("-").forEach(x=>{ if(x.length >= 5 && !termes.includes(x)) termes.push(x); });
  });
  return termes;
}

// Renvoie les chapitres du cours où l'auteur est nommé.
function chapitresDeLAuteur(nom){
  const termes = nomsDeRecherche(nom);
  if(!termes.length || !curSubj) return [];
  const sansAccents = t => String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const texteDe = ch => {
    let t = ch.label || "";
    (ch.sections||[]).forEach(sec=>{
      t += " " + (sec.title||"") + " " + (sec.body||"") + " " + (sec.list||[]).join(" ");
    });
    t += " " + (ch.recap||[]).join(" ");
    return sansAccents(t);
  };
  const trouves = [];
  ["cm","td"].forEach(type=>{
    (curSubj[type]||[]).forEach((ch,i)=>{
      // on cherche section par section, pour pouvoir amener pile au bon endroit
      let sec = -1;
      (ch.sections||[]).forEach((sc,si)=>{
        if(sec >= 0) return;
        const t = sansAccents((sc.title||"") + " " + (sc.body||"") + " " + (sc.list||[]).join(" "));
        if(termes.some(x=>t.includes(x))) sec = si;
      });
      if(sec < 0 && !termes.some(x=>texteDe(ch).includes(x))) return;
      trouves.push({ type, idx:i, sec, label:ch.label || (type==="cm"?"Cours":"TD") });
    });
  });
  return trouves;
}

function ouvrirChapitre(type, idx, sec){
  if(type === "cm"){ curCmIdx = idx; setTab(0); } else { curTdIdx = idx; setTab(1); }
  showScreen("split");
  if(sec === undefined || sec === null || sec < 0) return;
  // le panneau vient d'être redessiné : on attend qu'il soit posé avant de viser
  setTimeout(()=>{
    const pane = document.getElementById("pane-" + (type === "cm" ? 0 : 1));
    const bloc = pane && pane.querySelector('.section[data-sec="' + sec + '"]');
    if(!bloc) return;
    bloc.scrollIntoView({ behavior:"smooth", block:"center" });
    bloc.classList.remove("vise");
    void bloc.offsetWidth;
    bloc.classList.add("vise");
  }, 260);
}

// ══ Planning manuel ══
const JOURS_COURTS = ["","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

function renderPlanning(){
  showScreen("planning");
  const p = planning();
  const box = document.getElementById("plan-inner");
  box.innerHTML = "";

  // réglage des semaines alternées
  const reg = el("button","cal-row");
  reg.type = "button";
  const anc = p.ancre ? new Date(p.ancre).toLocaleDateString("fr-FR", { day:"numeric", month:"long" }) : "à définir";
  reg.innerHTML = `<div class="cal-txt"><div class="cal-name">Semaines A et B</div>
    <div class="cal-url">${p.ab ? "activées · semaine A à partir du " + esc(anc) : "désactivées · une seule semaine type"}</div></div>
    <span class="cal-pen">${IC_PEN}</span>`;
  reg.addEventListener("click",()=>{ haptic(); editPlanningAB(); });
  box.appendChild(reg);

  if(!p.cours.length){
    const e = el("div");
    e.innerHTML = vide("calendrier", "Aucun créneau pour l'instant", "Ajoute ton premier cours de la semaine.");
    box.appendChild(e);
  }

  for(let j = 1; j <= 7; j++){
    const list = p.cours.filter(c=>Number(c.jour) === j)
      .sort((a,b)=>String(a.debut).localeCompare(String(b.debut)));
    if(!list.length) continue;
    const t = el("div","plan-day"); t.textContent = JOURS_COURTS[j];
    box.appendChild(t);
    list.forEach(c=>{
      const row = el("button","plan-row");
      row.type = "button";
      row.innerHTML = `<div class="plan-h">${esc(c.debut||"")}<span>${esc(c.fin||"")}</span></div>
        <div class="plan-t"><div class="plan-n">${esc(c.titre||"Cours")}</div>
        ${c.salle ? `<div class="plan-s">${esc(c.salle)}</div>` : ""}</div>
        ${p.ab && c.semaine !== "AB" ? `<span class="plan-ab">${esc(c.semaine)}</span>` : ""}`;
      row.addEventListener("click",()=>{ haptic(); editCoursPlanning(c.id); });
      box.appendChild(row);
    });
  }

}

function editPlanningAB(){
  const p = planning();
  const auj = new Date();
  const parDefaut = p.ancre || lundiDe(auj).toISOString().slice(0,10);
  openForm("Semaines A et B", [
    { key:"ab", label:"Alternance", type:"choice", value:p.ab ? "1" : "0",
      options:[{ v:"0", label:"Une seule semaine" }, { v:"1", label:"Semaines A et B" }] },
    { key:"ancre", label:"Une date en semaine A", type:"date", value:parDefaut,
      hint:"N'importe quel jour d'une semaine A. Le calcul se fait de lundi à lundi." }
  ], "Enregistrer", v=>{
    p.ab = v.ab === "1";
    if(p.ab){
      if(!v.ancre) return "Donne une date en semaine A.";
      p.ancre = v.ancre;
    }
    saveContent(); reloadEDT(); renderPlanning();
  });
}

function editCoursPlanning(id, opts){
  // ajouté depuis l'emploi du temps : on y reste, au lieu d'ouvrir la page du planning
  const apres = ()=>{ if(opts && opts.depuisEdt) renderEDT(); else renderPlanning(); };
  const p = planning();
  const c = id ? p.cours.find(x=>x.id === id) : null;
  const champs = [
    { key:"titre", label:"Matière", value:c ? c.titre : "", placeholder:"Sociologie de l'éducation" },
    { key:"jour", label:"Jour", type:"choice", value:c ? String(c.jour) : "1",
      options:[1,2,3,4,5,6,7].map(j=>({ v:String(j), label:JOURS_COURTS[j].slice(0,3) })) },
    { key:"debut", label:"Début", type:"time", value:c ? c.debut : "08:30" },
    { key:"fin",   label:"Fin",   type:"time", value:c ? c.fin   : "10:30" },
    { key:"salle", label:"Salle", value:c ? (c.salle||"") : "", placeholder:"PYR 502" }
  ];
  if(p.ab) champs.push({ key:"semaine", label:"Semaine", type:"choice",
    value:c ? (c.semaine||"AB") : "AB",
    options:[{ v:"AB", label:"Toutes" }, { v:"A", label:"A" }, { v:"B", label:"B" }] });

  openForm(c ? "Modifier le créneau" : "Nouveau créneau", champs, "Enregistrer", v=>{
    if(!v.titre) return "Donne un nom à ce cours.";
    if(!v.debut || !v.fin) return "Indique l'heure de début et de fin.";
    if(v.fin <= v.debut) return "La fin doit venir après le début.";
    const data = { jour:Number(v.jour), debut:v.debut, fin:v.fin,
                   titre:v.titre, salle:v.salle, semaine:p.ab ? (v.semaine||"AB") : "AB" };
    if(c) Object.assign(c, data);
    else  p.cours.push(Object.assign({ id:newId() }, data));
    saveContent(); reloadEDT(); apres();
  }, c ? ()=>{
    p.cours = p.cours.filter(x=>x.id !== id);
    saveContent(); reloadEDT(); renderPlanning();
  } : null);
}

// ══ Devoirs corrigés ══
function devList(){
  if(!Array.isArray(curSubj.dev)) curSubj.dev = [];
  return curSubj.dev;
}
function marquerDev(){
  if(!curSubj || curSubj._own) return;
  curSubj._over = curSubj._over || {};
  curSubj._over.dev = true;
}

// ══════════════════════════════════════════════════
// DEVOIRS : à remplir (je rédige) ou corrigés (sujet puis correction)
// ══════════════════════════════════════════════════
// Mes réponses aux devoirs à remplir : enregistrées chez moi et synchronisées.
var DEVREP_KEY = "revision_devrep_v1";
var DEVREP = {};
try{ DEVREP = JSON.parse(localStorage.getItem(DEVREP_KEY) || "{}") || {}; }catch(e){ DEVREP = {}; }
function devrepSave(){ try{ localStorage.setItem(DEVREP_KEY, JSON.stringify(DEVREP)); }catch(e){} scheduleSync(); }
function devrepCle(d, qi){ return (curSubj ? curSubj.id : "") + "|" + (d.label || "") + "|" + qi; }

// Les questions d'un devoir : celles qui sont fournies, ou celles numérotées dans le sujet.
function questionsDe(d){
  if(Array.isArray(d.questions) && d.questions.length) return { intro:"", qs:d.questions };
  const txt = String(d.enonce || "");
  const lignes = txt.split(/\n/);
  const qs = []; const intro = [];
  lignes.forEach(l=>{
    const m = l.match(/^\s*(\d+)\s*[\).:]\s*(.+)$/);
    if(m){
      let q = m[2].trim(), pts = "";
      const p = q.match(/\(([\d,.]+\s*(?:points?|pts?))\)\s*$/i);
      if(p){ pts = p[1]; q = q.slice(0, p.index).trim(); }
      qs.push({ q, pts });
    } else if(qs.length && l.trim()){
      qs[qs.length-1].q += " " + l.trim();        // suite de la question sur la ligne suivante
    } else if(l.trim()){
      intro.push(l.trim());
    }
  });
  return qs.length >= 2 ? { intro:intro.join("\n"), qs } : { intro:"", qs:[] };
}
function estCorrige(d){
  return !!(d.correction || (Array.isArray(d.questions) && d.questions.some(q=>q && q.corr)));
}
let DEV_ONGLET = {};       // matière → "remplir" | "corriges"

function renderDevoirs(){
  showScreen("devoirs");
  const box = document.getElementById("dev-inner");
  box.innerHTML = "";
  const list = devList();
  const aRemplir = [], corriges = [];
  list.forEach((d,i)=>{ (estCorrige(d) ? corriges : aRemplir).push({ d, i }); });
  let onglet = DEV_ONGLET[curSubj.id] || (aRemplir.length || !corriges.length ? "remplir" : "corriges");

  // deux onglets, comme Cours / TD
  const seg = el("div","chap-seg dev-seg");
  const thumb = el("div","chap-thumb");
  thumb.style.width = "calc((100% - 8px)/2)";
  thumb.style.transform = onglet === "corriges" ? "translateX(calc(100% + 2px))" : "translateX(0)";
  seg.appendChild(thumb);
  [["remplir","À remplir",aRemplir.length],["corriges","Corrigés",corriges.length]].forEach(([k,lbl,n])=>{
    const b = el("button","chap-opt" + (onglet === k ? " active" : ""));
    b.type = "button";
    b.innerHTML = esc(lbl) + `<span class="dev-n">${n}</span>`;
    b.addEventListener("click",()=>{ haptic(); DEV_ONGLET[curSubj.id] = k; renderDevoirs(); });
    seg.appendChild(b);
  });
  box.appendChild(seg);

  const liste = onglet === "remplir" ? aRemplir : corriges;
  if(!liste.length){
    const e = el("div");
    e.innerHTML = onglet === "remplir"
      ? vide("devoirs", "Aucun devoir à remplir", "Tout est à jour dans cette matière.")
      : vide("valide", "Aucun devoir corrigé", "Quand une correction arrive, le devoir passe ici.");
    box.appendChild(e);
  }
  liste.forEach(({d,i})=> box.appendChild(onglet === "remplir" ? carteARemplir(d,i) : carteCorrigee(d,i)));

}

// en-tête commun : titre, document à lire, chapitre lié
function enteteDevoir(card, d){
  const top = el("div","dev-top");
  const nom = el("div","dev-name"); nom.textContent = d.label || "Devoir";
  top.appendChild(nom); card.appendChild(top);
  if(d.doc){
    const doc = el("div","dev-doc");
    doc.innerHTML = `<span>📄</span><span><b>Document à lire :</b> ${esc(d.doc)}</span>`;
    card.appendChild(doc);
  }
  if(d.ch){
    const ou = [["cm",curSubj.cm||[]],["td",curSubj.td||[]]]
      .map(([t,a])=>({ t, k:a.findIndex(c=>c.label === d.ch) })).find(x=>x.k >= 0);
    if(ou){
      const b = el("button","dev-lien");
      b.type = "button";
      b.innerHTML = ICO(ou.t === "cm" ? "cm" : "td").replace('class="ico"','class="ico ico-in"') + "Revoir le " + esc(d.ch);
      b.addEventListener("click", e=>{ e.stopPropagation(); haptic(); ouvrirChapitre(ou.t, ou.k); });
      card.appendChild(b);
    }
  }
}
function textareaQuiGrandit(t){
  const ajuster = ()=>{ t.style.height = "auto"; t.style.height = Math.max(96, t.scrollHeight + 2) + "px"; };
  t.addEventListener("input", ajuster);
  requestAnimationFrame(ajuster);
}

function carteARemplir(d, i){
  const card = el("div","dev-card");
  enteteDevoir(card, d);
  const { intro, qs } = questionsDe(d);
  if(!qs.length){
    // sujet libre : une seule zone de réponse
    if(d.enonce){
      const l = el("div","dev-lbl"); l.textContent = "Sujet";
      const t = el("div","dev-txt"); t.textContent = d.enonce;
      card.appendChild(l); card.appendChild(t);
    }
    card.appendChild(zoneReponse(d, 0));
  } else {
    if(intro){ const t = el("div","dev-txt"); t.textContent = intro; card.appendChild(t); }
    const av = el("div","dev-avance");
    const majAvance = ()=>{
      const n = qs.filter((_,k)=>(DEVREP[devrepCle(d,k)]||"").trim()).length;
      av.className = "dev-avance" + (n === qs.length ? " fini" : "");
      av.innerHTML = `<span>${n === qs.length ? "✓ Tout est rédigé" : n + " / " + qs.length + " rédigées"}</span><span class="bar"><i style="width:${Math.round(n/qs.length*100)}%"></i></span>`;
    };
    majAvance();
    card.appendChild(av);
    qs.forEach((q,k)=>{
      const bloc = el("div","dev-q");
      const head = el("div","dev-q-head");
      head.innerHTML = `<span class="dev-q-num">${k+1}</span><span class="dev-q-txt">${esc(q.q)}</span>` + (q.pts ? `<span class="dev-pts">${esc(q.pts)}</span>` : "");
      bloc.appendChild(head);
      bloc.appendChild(zoneReponse(d, k, majAvance));
      card.appendChild(bloc);
    });
  }
  if(canEdit() && !d._shared){
    const b = el("button","dev-show ghost");
    b.type = "button";
    b.textContent = "J'ai la correction";
    b.addEventListener("click",()=>{ haptic(); editDevoir(i); });
    card.appendChild(b);
    onLongPress(card.querySelector(".dev-top"), ()=>editDevoir(i));
  }
  return card;
}
function zoneReponse(d, k, apres){
  const w = el("div");
  const t = document.createElement("textarea");
  t.className = "dev-rep";
  t.placeholder = "Ta réponse…";
  t.value = DEVREP[devrepCle(d,k)] || "";
  const etat = el("div","dev-etat");
  let minuterie = null;
  t.addEventListener("input",()=>{
    etat.textContent = "…";
    clearTimeout(minuterie);
    minuterie = setTimeout(()=>{
      const v = t.value;
      if(v.trim()) DEVREP[devrepCle(d,k)] = v; else delete DEVREP[devrepCle(d,k)];
      devrepSave();
      etat.textContent = "Enregistré";
      if(apres) apres();
    }, 600);
  });
  textareaQuiGrandit(t);
  w.appendChild(t); w.appendChild(etat);
  return w;
}

function carteCorrigee(d, i){
  const card = el("div","dev-card");
  enteteDevoir(card, d);
  const qs = Array.isArray(d.questions) ? d.questions : [];
  if(d.enonce){
    const l = el("div","dev-lbl"); l.textContent = "Sujet";
    const t = el("div","dev-txt"); t.textContent = d.enonce;
    l.style.marginTop = d.doc ? "" : "0";
    card.appendChild(l); card.appendChild(t);
  }
  // questions corrigées une par une
  qs.forEach((q,k)=>{
    const bloc = el("div","dev-q");
    const head = el("div","dev-q-head");
    head.innerHTML = `<span class="dev-q-num">${k+1}</span><span class="dev-q-txt">${esc(q.q)}</span>` + (q.pts ? `<span class="dev-pts">${esc(q.pts)}</span>` : "");
    bloc.appendChild(head);
    const mine = (DEVREP[devrepCle(d,k)]||"").trim();
    if(mine){ const l = el("div","dev-lbl"); l.textContent = "Ta réponse"; const t = el("div","dev-txt"); t.textContent = mine; bloc.appendChild(l); bloc.appendChild(t); }
    if(q.corr) bloc.appendChild(boutonCorrection(q.corr));
    card.appendChild(bloc);
  });
  if(d.correction) card.appendChild(boutonCorrection(d.correction));
  // appui long pour modifier ou supprimer, comme ailleurs
  if(canEdit() && !d._shared) onLongPress(card, ()=>editDevoir(i));
  return card;
}
function boutonCorrection(texte){
  const w = el("div");
  const btn = el("button","dev-show");
  btn.type = "button";
  btn.textContent = "Voir la correction";
  const zone = el("div","dev-corr");
  zone.hidden = true;
  const l2 = el("div","dev-lbl"); l2.textContent = "Correction";
  const t2 = el("div","dev-txt"); t2.textContent = texte;
  zone.appendChild(l2); zone.appendChild(t2);
  btn.addEventListener("click",()=>{
    haptic();
    zone.hidden = !zone.hidden;
    btn.textContent = zone.hidden ? "Voir la correction" : "Masquer la correction";
  });
  w.appendChild(btn); w.appendChild(zone);
  return w;
}

function editDevoir(i){
  const list = devList();
  const d = i === null ? null : list[i];
  // un devoir à questions fournies : on garde ses questions, on modifie le reste
  const avecQuestions = d && Array.isArray(d.questions) && d.questions.length;
  openForm(d ? "Modifier le devoir" : "Nouveau devoir", [
    { key:"label", label:"Titre", value:d ? d.label : "", placeholder:"Contrôle du 12 novembre" },
    { key:"enonce", label:avecQuestions ? "Consigne (les questions restent)" : "Sujet", type:"area", value:d ? (d.enonce||"") : "",
      placeholder:"L'énoncé, la consigne, les questions numérotées 1), 2)…" },
    { key:"correction", label:"Correction", type:"area", value:d ? (d.correction||"") : "",
      placeholder:"Facultatif. Sans correction, le devoir va dans « À remplir »." }
  ], "Enregistrer", v=>{
    if(!v.label) return "Donne un titre à ce devoir.";
    if(!v.enonce && !v.correction && !avecQuestions) return "Il faut au moins un sujet ou une correction.";
    if(d){
      // si le titre change, mes réponses suivent
      if(d.label !== v.label){
        Object.keys(DEVREP).forEach(k=>{
          const pre = curSubj.id + "|" + d.label + "|";
          if(k.startsWith(pre)){ DEVREP[curSubj.id + "|" + v.label + "|" + k.slice(pre.length)] = DEVREP[k]; delete DEVREP[k]; }
        });
        devrepSave();
      }
      d.label = v.label; d.enonce = v.enonce; d.correction = v.correction;
    }
    else  list.push({ label:v.label, enonce:v.enonce, correction:v.correction });
    marquerDev();
    saveContent(); renderDevoirs();
  }, d ? ()=>{
    list.splice(i,1);
    marquerDev();
    saveContent(); renderDevoirs();
  } : null);
}

function renderAuteurs(){
  const wrap=document.getElementById("auteurs-inner"); wrap.innerHTML="";
  document.getElementById("auteurs-eyebrow").textContent=curSubj.title;
  document.getElementById("auteurs-sub").textContent=curSubj.auteurs.length+" auteurs à connaître. Touche une fiche pour la déplier.";
  const list=el("div","auteur-list");
  curSubj.auteurs.forEach((a0,i)=>{
    // tous les auteurs n'ont pas les mêmes champs : sans garde-fou,
    // un a.concepts absent plantait le rendu et l'écran ne s'ouvrait jamais
    const a = {
      nom:      a0.nom || "Auteur",
      courant:  a0.courant || "",
      periode:  a0.periode || "",
      these:    a0.these || a0.contrib || "",
      concepts: Array.isArray(a0.concepts) ? a0.concepts : [],
      retenir:  a0.retenir || ""
    };
    const initials=a.nom.split(/[ &]/)[0].slice(0,2);
    const card=el("div","auteur rise"); card.style.animationDelay=(0.12+i*0.03)+"s";
    card.innerHTML=`
      <button class="auteur-head">
        <div class="auteur-avatar">${esc(initials)}</div>
        <div class="auteur-headinfo"><div class="auteur-nom">${esc(a.nom)}</div>
          <div class="auteur-meta"><span class="auteur-courant">${esc(a.courant)}</span><span class="auteur-periode">${esc(a.periode)}</span></div></div>
        <span class="auteur-chevron">${chevronR}</span>
      </button>
      <div class="auteur-drawer"><div class="auteur-drawer-inner"><div class="auteur-body">
        ${a.these ? `<p class="auteur-these">${esc(a.these)}</p>` : ""}
        ${a.concepts.length ? `<div class="auteur-concepts">${a.concepts.map(c=>`<span class="auteur-tag">${esc(c)}</span>`).join("")}</div>` : ""}
        ${a.retenir ? `<div class="auteur-retenir"><div class="auteur-retenir-lbl">À retenir</div><div class="auteur-retenir-txt">${esc(a.retenir)}</div></div>` : ""}
      </div></div></div>`;
    // chapitres où l'auteur est nommé : repérés dans le texte, pas devinés
    const liens = chapitresDeLAuteur(a0.nom);
    if(liens.length){
      const body = card.querySelector(".auteur-body");
      const lbl  = el("div","auteur-liens-lbl");
      lbl.textContent = liens.length > 1 ? "Cité dans ces chapitres" : "Cité dans ce chapitre";
      const box  = el("div","auteur-liens");
      liens.forEach(l=>{
        const b = el("button","auteur-lien");
        b.type = "button";
        b.innerHTML = ICO(l.type === "cm" ? "cm" : "td").replace('class="ico"','class="ico ico-in"') + esc(l.label);
        b.addEventListener("click", e=>{ e.stopPropagation(); haptic(); ouvrirChapitre(l.type, l.idx, l.sec); });
        box.appendChild(b);
      });
      body.appendChild(lbl); body.appendChild(box);
    }
    card.querySelector(".auteur-head").addEventListener("click",()=>{
      const open=card.classList.contains("open");
      list.querySelectorAll(".auteur").forEach(c=>c.classList.remove("open"));
      if(!open) card.classList.add("open");
    });
    list.appendChild(card);
  });
  wrap.appendChild(list);
  showScreen("auteurs");
}

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
  const all = [], prio = [];
  // un contrôle dans les 14 jours : ses chapitres passent en premier (même pas encore « dus »)
  const cibles = {};
  try{
    pendingAlerts(true, false).forEach(e=>{
      const N = evNote(e) || {}; if(typeDevoir(N) !== "controle" || N.done) return;
      const j = hmJoursAvant(e.start); if(j < 0 || j > 14) return;
      const sj = matiereDeNote(e, N); if(!sj) return;
      const chs = Array.isArray(N.chs) && N.chs.length ? N.chs : null;
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
        else if(srsIsDue(key)) all.push(entree());
      });
    });
  });
  if(!all.length && !prio.length) return;
  queue = shuffle(prio).concat(shuffle(all)).slice(0, SERIE_MAX);
  sessionDueOnly = true;
  clearInterval(timerInt);
  showScreen("session");
  renderSess();
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

// ══════════════════════════════════════════════════
// PSYCHO
// ══════════════════════════════════════════════════
let psychoMotivIdx = 0;
const MOTIV_DOUX = [
  "Tu avances à ton rythme, et c'est exactement le bon rythme. 💜",
  "Chaque petite chose que tu fais aujourd'hui compte. Vraiment. 🌸",
  "Tu n'as pas à tout comprendre d'un coup. Une étape à la fois. 🫂",
  "Tu es plus capable que tu ne le crois, Nana. 💜",
  "Ce projet a du sens parce que tu en as. Continue. 🌸",
];
function motivDoux(){ return MOTIV_DOUX[Math.floor(Math.random()*MOTIV_DOUX.length)]; }

function loadPsychoSteps(){
  try{ const saved=JSON.parse(localStorage.getItem(PSYCHO_STEPS_KEY)||"{}"); PSYCHO_STEPS.forEach(s=>{ if(saved[s.id]) s.done=true; }); }catch(e){}
}
function savePsychoSteps(){
  const data={}; PSYCHO_STEPS.forEach(s=>{ data[s.id]=s.done; });
  try{ localStorage.setItem(PSYCHO_STEPS_KEY, JSON.stringify(data)); }catch(e){}
  scheduleSync();
}

function renderPsycho(){
  entreeDansEcran(document.getElementById("psycho-inner"));
  const inner=document.getElementById("psycho-inner"); inner.innerHTML="";
  inner.innerHTML=`
    <button class="psy-back" id="psy-back-home">${chevronL}Retour</button>
    <div class="psy-hero rise"><div class="psy-hero-mark">${icone("tetecoeur")}</div>
      <div class="psy-hero-title">${psyTitle()}</div>
      <div class="psy-hero-sub">On est en L3. Objectif : intégrer la Licence de Psychologie à la rentrée 2027.${isNana()?" 🌸":""}</div></div>
    <div class="psy-message rise" style="animation-delay:.06s"><div class="psy-message-name">💌 Un message pour toi, Nana</div>
      <div class="psy-message-text">"Je sais que tu as les capacités pour aller en fac de Psycho, tout est listé et je serai là chaque étape si nécessaire. Tu vas réussir Nana 🫂"</div></div>
    <div class="psy-section-label rise" style="animation-delay:.09s">Par où tu veux commencer ?</div>`;
  const cards=[
    {icon:"📋",title:"Les étapes",sub:"Ton chemin, étape par étape.\nJuste ce qu'il faut faire, quand il faut le faire.",fn:renderPsychoEtapes},
    {icon:"💡",title:"Infos utiles",sub:"Tout sur la VES, Parcoursup, les universités\net les délais. En clair, sans stress.",fn:renderPsychoInfos},
    {icon:"🔍",title:"Quelle spécialité ?",sub:"Vers quelle branche de la psycho aller ?\nOn explore ça ensemble, doucement.",fn:renderPsychoSpecialite},
    {icon:"🧭",title:"Ton fil psycho",sub:"Tout ce que tu as déjà vu en psycho,\nde la L1 à la L3, rangé par thème.",fn:renderFilPsycho},
  ];
  cards.forEach((c,i)=>{
    const b=el("button","psy-nav-card rise"); b.style.animationDelay=(0.12+i*0.03)+"s";
    b.innerHTML=`<div class="psy-nav-icon">${icone(c.icon)}</div><div class="psy-nav-info"><div class="psy-nav-title">${c.title}</div><div class="psy-nav-sub">${c.sub.replace(/\n/g, " ")}</div></div><span class="psy-nav-arrow">${IC_CHEV_DROITE}</span>`;
    b.addEventListener("click",c.fn);
    if(c.fn === renderPsychoEtapes) pastille(b, urgences("psy").length, "étapes à faire bientôt");
    inner.appendChild(b);
  });
  document.getElementById("psy-back-home").addEventListener("click",()=>showScreen("semestres"));
  showScreen("psycho");
}
// ── FIL PSYCHO : les chapitres de psychologie de toutes les années, par thème ──
// Un chapitre entre dans un thème s'il nomme au moins deux de ses repères (auteurs ou notions).
const THEMES_PSY = [
  { ic:"🛋️", nom:"Psychanalyse", mots:["freud","winnicott","klein","lacan","inconscient","pulsion","oedipe","narcissisme","refoulement","surmoi","transfert"] },
  { ic:"👶", nom:"Développement de l'enfant", mots:["piaget","wallon","vygotski","attachement","bowlby","ainsworth","spitz","stade du miroir","zone proximale","hospitalisme"] },
  { ic:"👥", nom:"Psychologie sociale et groupes", mots:["lewin","sherif","asch","milgram","festinger","moscovici","conformisme","influence sociale","dynamique de groupe","representation sociale","cohesion"] },
  { ic:"🧩", nom:"Apprentissage et motivation", mots:["bandura","skinner","pavlov","behaviorisme","constructivisme","socioconstructivisme","motivation","sentiment d'efficacite","conflit sociocognitif","rogers"] },
  { ic:"🌀", nom:"Adolescence et clinique", mots:["adolescence","adolescent","tdah","hyperactif","harcelement","dsm","phobie","carence affective","anorexie","regression"] },
];
function filThemes(themes){
  const I = indexGlobal();
  const parChap = new Map();
  I.sections.forEach(s=>{ const k = s.subj.id + "|" + s.type + "|" + s.ci; if(!parChap.has(k)) parChap.set(k, { s, t:"" }); parChap.get(k).t += s.t; });
  return themes.map(th=>{
    const res = th.mots.map(motEntier);
    const chaps = [];
    parChap.forEach(({ s, t })=>{
      const n = res.filter((r,i)=>t.includes(th.mots[i]) && r.test(t)).length;
      if(n >= 2) chaps.push({ s, n });
    });
    chaps.sort((a,b)=>anneeMatiere(a.s.subj).rang - anneeMatiere(b.s.subj).rang || b.n - a.n);
    return { th, chaps };
  });
}
// les questions de QCM d'un thème : toutes celles qui nomment un de ses auteurs ou une de ses notions,
// de la L1 à la L3. Ce sont les questions déjà là : leur validation est la même que dans la matière.
function questionsDuTheme(th){
  const res = th.mots.map(motEntier), out = [];
  SUBJECTS.forEach(subj=>exos(subj, "qcm").forEach((q,i)=>{
    if(!q || !q.q || !Array.isArray(q.opts)) return;
    const t = norm(q.q + " " + q.opts.join(" ") + " " + (q.e || ""));
    if(res.some(r=>r.test(t))) out.push({ subj, item:q, i, key:cardKey(subj.id, "qcm", q, i) });
  }));
  return out;
}
function startFilSession(th){
  sessionMix = null;
  exam = null; document.getElementById("sess-score").className = "nav-score";
  curMode = "qcm"; idx = 0; score = 0; answers = []; rateesSession = new Set();
  flipped=false; selOpt=null; confirmed=false; showAns=false; showHint=false; lastMotiv=""; oqEcrit="";
  globalSession = false; sessionScope = "fil"; sessionFil = th; sessionDueOnly = false;
  const all = questionsDuTheme(th).map(x=>({ item:melangerQCM(x.item), mode:"qcm", subj:x.subj, key:x.key }));
  if(!all.length) return;
  // comme le grand QCM : ce qui n'est pas validé d'abord, puis le reste
  queue = shuffle(all.filter(x=>!estAcquise(x.key))).concat(shuffle(all.filter(x=>estAcquise(x.key)))).slice(0, SERIE_MAX);
  clearInterval(timerInt);
  showScreen("session");
  renderSess();
}
function carteQcmTheme(th){
  const qs = questionsDuTheme(th);
  if(!qs.length) return null;
  const val = qs.filter(x=>estAcquise(x.key)).length, pct = Math.round(val / qs.length * 100);
  const nMat = new Set(qs.map(x=>x.subj.id)).size;
  const b = el("button","fil-qcm"); b.type = "button";
  b.innerHTML = `<span class="fil-qcm-ic">${ICO("qcm")}</span><span class="fil-qcm-txt"><b>QCM ${esc(th.nom)}</b><small>Tiré de ${nMat} matière${nMat > 1 ? "s" : ""} · ${pct ? "validé à " + pct + "\u00a0%" : "pas encore commencé"}</small></span>${IC_CHEV_DROITE}`;
  b.addEventListener("click",()=>{ haptic(); startFilSession(th); });
  return b;
}
// le fil d'un projet : les chapitres de tous tes cours qui parlent de ses thèmes
let FIL_RETOUR = null;
function renderFilPsycho(){ renderFil(THEMES_PSY, { mark:"🧭", titre:"Ton fil psycho", quoi:"de psycho" }, renderPsycho); }
function renderFil(themes, o, retour){
  entreeDansEcran(document.getElementById("psycho-inner"));
  indexAJour();
  FIL_RETOUR = ()=>renderFil(themes, o, retour);
  const inner = document.getElementById("psycho-inner"); inner.innerHTML = "";
  const back = el("button","psy-back"); back.innerHTML = chevronL + "Retour"; back.addEventListener("click", retour); inner.appendChild(back);
  const fil = filThemes(themes);
  const total = new Set(fil.flatMap(f=>f.chaps.map(c=>c.s.subj.id + "|" + c.s.type + "|" + c.s.ci))).size;
  const hero = el("div","psy-hero rise");
  const ansFil = ["L1","L2","L3"].filter(a=>fil.some(f=>f.chaps.some(c=>anneeMatiere(c.s.subj).cle === a)));
  const ou = isCiva() && ansFil.length ? "de ta " + ansFil.join(", ").replace(/, ([^,]*)$/, " et $1") : "de tes cours";
  hero.innerHTML = `<div class="psy-hero-mark">${icone(o.mark)}</div><div class="psy-hero-title">${esc(o.titre)}</div><div class="psy-hero-sub">${total
    ? total + " chapitre" + (total > 1 ? "s " : " ") + ou + (total > 1 ? " parlent" : " parle") + " déjà " + o.quoi + ". Les voici, rangés par thème."
    : "Aucun de tes chapitres n'en parle encore. Ils apparaîtront ici dès que tes cours en parleront."}</div>`;
  inner.appendChild(hero);
  fil.forEach(({ th, chaps }, i)=>{
    if(!chaps.length) return;
    const c = el("div","fil-theme rise"); c.style.animationDelay = (0.06 + i*0.03) + "s";
    const ans = ["L1","L2","L3"].filter(a=>chaps.some(x=>anneeMatiere(x.s.subj).cle === a));
    c.innerHTML = `<div class="fil-tete"><span class="fil-ic">${icone(th.ic)}</span><span class="fil-txt"><b>${esc(th.nom)}</b><small>${chaps.length} chapitre${chaps.length > 1 ? "s" : ""}</small></span>${isCiva() ? `<span class="idx-ans">${ans.map(a=>`<span class="idx-an">${a}</span>`).join("")}</span>` : ""}</div>`;
    const qb = carteQcmTheme(th); if(qb) c.appendChild(qb);
    const liste = el("div","fil-liste");
    const MAX = 4;
    const montrer = n=>{ liste.innerHTML = ""; chaps.slice(0, n).forEach(x=>liste.appendChild(pastilleChapitre(x.s, []))); };
    montrer(MAX);
    c.appendChild(liste);
    if(chaps.length > MAX){
      const t = el("button","dv-tout"); t.type = "button";
      t.textContent = "Voir les " + chaps.length + " chapitres";
      t.addEventListener("click",()=>{ haptic(); montrer(chaps.length); t.remove(); });
      c.appendChild(t);
    }
    inner.appendChild(c);
  });
  showScreen("psycho");
  window.scrollTo(0, 0);
}
// ══════════════════════════════════════════════════
// PROJETS : Projet Psycho, Concours CPE…
// Un projet, c'est des étapes à cocher, des infos et des outils. Il se partage dans une classe
// comme une matière ; chacun coche ses propres étapes. Le contenu vit ici, dans l'app :
// tous ceux qui l'ont reçu voient donc la même version, à jour.
// Civa et Nana gardent leur Projet Psycho personnel ; les autres reçoivent une version neutre.
// ══════════════════════════════════════════════════
// la version neutre de Projet Psycho : sans dates qui ne valent que pour nous, sans tournures au féminin
function psyNeutre(t){
  return String(t || "")
    .replace(/Dès maintenant \(L2\)/g, "Dès que possible")
    .replace(/\s*2027/g, "")
    .replace(/\(si convoquée\)/g, "(en cas de convocation)")
    .replace(/si convoquée/g, "en cas de convocation")
    .replace(/Sois concrète\./g, "Donne du concret.")
    .replace(/Sois directe et confiante\./g, "Reste direct et confiant.");
}
const PROJETS = {
  psycho: {
    id:"psycho", titre:"Projet Psycho", icone:"💜", sous:"Passerelles · masters", mark:"🧠",
    accroche:"Passer des Sciences de l'éducation à la psychologie : la VES pour entrer directement en L2, Parcoursup en plan B, puis le master.",
    etapes:()=>PSYCHO_STEPS.map(s=>({ id:s.id, titre:psyNeutre(s.title), desc:psyNeutre(s.desc), date:psyNeutre(s.date) })),
    phases:[
      { label:"🌱 Dès que possible", ids:["s1","s2"] },
      { label:"📅 Janvier", ids:["s3","s4"] },
      { label:"✍️ Février → avril", ids:["s5","s6","s7","s7b"] },
      { label:"📬 Avant fin mai", ids:["s8"] },
      { label:"🎓 Juin → septembre", ids:["s9","s10","s11"] }
    ],
    rubriques:[
      { type:"etapes", icon:"📋", titre:"Les étapes", sous:"Ton chemin, étape par étape." },
      { type:"cartes", icon:"💡", titre:"Infos utiles", sous:"La VES, Parcoursup, les universités et les délais.",
        cartes:()=>PSYCHO_INFOS.map(x=>({ icon:x.icon, titre:psyNeutre(x.title), lignes:x.lines.map(psyNeutre), tags:x.tags })) },
      { type:"cartes", icon:"🔍", titre:"Quelle spécialité ?", sous:"Les grandes branches de la psychologie.",
        intro:"En psychologie, la spécialité se choisit au master, pas en licence. La licence donne les bases communes à toutes les branches.",
        cartes:()=>PSYCHO_SPES.map(x=>({ icon:x.icon, titre:x.nom, lignes:[x.desc, "Lien avec ton parcours : " + String(x.lien || "").replace(/^Lien avec ton parcours\s*:\s*/i, ""), "→ " + x.master] })) },
      { type:"fil", icon:"🧭", titre:"Ton fil psycho", sous:"Ce que tes cours disent déjà de la psycho, rangé par thème.", themes:()=>THEMES_PSY, quoi:"de psycho" }
    ]
  },
  cpe: {
    id:"cpe", titre:"Concours CPE", icone:"🏫", sous:"Session 2027 · dès la L3", mark:"🏫",
    accroche:"Devenir conseiller principal d'éducation. Depuis 2026, le concours externe se passe dès la L3. Tout ce qu'il faut pour la session 2027, vérifié sur les sites officiels.",
    alerte:()=>Date.now() < Date.parse("2026-11-25T12:00:00+01:00") ? "Inscriptions ouvertes sur Cyclades jusqu'au mercredi 25 novembre 2026, midi." : "",
    etapes:()=>[
      { id:"c1", titre:"Lire la page officielle du concours", desc:"Sur education.gouv.fr : les conditions, les épreuves, le programme, les sujets et les rapports de jury. C'est la référence, avant tout autre site.", date:"Dès maintenant" },
      { id:"c2", titre:"Vérifier que tu peux t'inscrire", desc:"Pour le concours externe bac+3, il suffit d'être en L3 ou d'avoir une licence.\nAvec un master, le concours bac+5 existe encore en 2027, pour la dernière fois.", date:"Avant l'inscription" },
      { id:"c3", titre:"T'inscrire sur Cyclades", desc:"Cyclades est l'application officielle d'inscription. Crée ton compte, choisis le concours externe bac+3 de CPE et valide ton dossier. Garde ton numéro d'inscription.", date:"⚠️ Avant le mercredi 25 novembre 2026, midi" },
      { id:"c4", titre:"Lire le programme et la bibliographie 2027", desc:"La dissertation porte sur deux thèmes : « Éduquer à la citoyenneté » et « Climat scolaire ». Le ministère publie une bibliographie générale et une bibliographie par thème.", date:"Novembre" },
      { id:"c5", titre:"Maîtriser les textes de base", desc:"La circulaire de missions des CPE (n° 2015-139 du 10 août 2015), le référentiel de compétences de 2013 et le fonctionnement d'un établissement : projet d'établissement, CVL, CVC, CESCE, délégués.", date:"Novembre → janvier" },
      { id:"c6", titre:"Lire le rapport du jury 2026", desc:"C'était la première session du concours bac+3. Le rapport donne les sujets, ce que le jury attend et les erreurs fréquentes, épreuve par épreuve.", date:"Décembre" },
      { id:"c7", titre:"T'entraîner aux deux écrits", desc:"Dissertation et analyse de dossier, 4 heures chacune, en conditions réelles. Fais-toi un répertoire de définitions courtes des notions qui reviennent.", date:"Décembre → février" },
      { id:"c8", titre:"Candidater au master M2E", desc:"Après le concours, la formation dure deux ans, en master à l'INSPE. La candidature se fait sur monmaster.gouv.fr. Il est conseillé de candidater sans attendre les résultats du concours.", date:"Au printemps, sur Mon Master" },
      { id:"c9", titre:"Passer les deux écrits", desc:"La dissertation (4 h) et l'analyse d'un dossier documentaire (4 h). Une note de 5 ou moins est éliminatoire.", date:"Jeudi 4 et vendredi 5 mars 2027" },
      { id:"c10", titre:"Préparer les oraux", desc:"Entraîne-toi à présenter une situation de vie scolaire en 15 minutes, puis à échanger. Prépare ta présentation de 5 minutes : ton parcours et pourquoi le métier de CPE. Le jury conseille de faire des immersions en établissement.", date:"Dès les résultats d'admissibilité" },
      { id:"c11", titre:"Passer les oraux", desc:"L'étude d'une situation de vie scolaire (1 h 30 de préparation, 45 minutes d'épreuve), puis l'entretien (35 minutes). Les dates sont publiées sur Cyclades.", date:"Avant l'été 2027" },
      { id:"c12", titre:"Entrer en formation", desc:"En cas de réussite, tu entres en master M2E à la rentrée, pour deux ans de formation rémunérée à l'INSPE.", date:"Rentrée 2027" }
    ],
    phases:[
      { label:"⏳ Maintenant · octobre et novembre 2026", ids:["c1","c2","c3"] },
      { label:"📚 Novembre → février · se préparer", ids:["c4","c5","c6","c7","c8"] },
      { label:"✍️ Mars 2027 · les écrits", ids:["c9"] },
      { label:"🗣️ Avant l'été 2027 · les oraux", ids:["c10","c11"] },
      { label:"🎓 Rentrée 2027", ids:["c12"] }
    ],
    rubriques:[
      { type:"etapes", icon:"📋", titre:"Les étapes", sous:"De l'inscription à la rentrée 2027." },
      { type:"cartes", icon:"✍️", titre:"Les épreuves", sous:"Deux écrits, deux oraux, et ce que le jury attend.",
        intro:"Quatre épreuves notées sur 20 : deux écrits d'admissibilité, puis deux oraux d'admission. Les conseils viennent du rapport du jury 2026.",
        cartes:()=>[
          { icon:"✍️", titre:"Écrit 1 · La dissertation", tags:["4 h","Coefficient 3"], lignes:[
            "Une dissertation sur une question d'éducation et de formation des jeunes.",
            "Elle s'appuie sur le programme : en 2027, « Éduquer à la citoyenneté » et « Climat scolaire », avec une bibliographie.",
            "Ce que le jury attend :",
            "→ Définir les termes du sujet avant de les relier.",
            "→ Construire un raisonnement, pas un catalogue de réformes ou d'exemples.",
            "→ Soigner la conclusion et relire l'orthographe." ] },
          { icon:"📂", titre:"Écrit 2 · L'analyse de dossier", tags:["4 h","Coefficient 2"], lignes:[
            "Un dossier documentaire sur une question de politique éducative, avec trois ou quatre questions.",
            "Ce que le jury attend :",
            "→ Répondre question par question, pas en une dissertation.",
            "→ Citer les documents par leur numéro ou leur auteur, et les analyser au lieu de les paraphraser.",
            "→ Définir les notions clés et partager le temps entre les questions." ] },
          { icon:"🗣️", titre:"Oral 1 · La situation de vie scolaire", tags:["1 h 30 de préparation","45 min","Coefficient 5"], lignes:[
            "Un dossier de cinq pages au plus sur une situation en collège ou en lycée.",
            "15 minutes d'exposé, puis 30 minutes d'échange avec le jury. C'est l'épreuve qui compte le plus.",
            "Ce que le jury attend :",
            "→ Tenir dans le temps : beaucoup de candidats dépassent.",
            "→ Analyser et poser le problème, pas seulement décrire, puis proposer des actions précises.",
            "→ Citer les documents et se détacher de ses notes." ] },
          { icon:"🤝", titre:"Oral 2 · L'entretien", tags:["35 min","Coefficient 3"], lignes:[
            "5 minutes pour présenter ton parcours et ta motivation, 10 minutes d'échange, puis 20 minutes autour d'une mise en situation.",
            "On y parle des valeurs de la République, dont la laïcité, du métier de CPE, des obligations du service public, de la transition écologique et du bien-être des élèves.",
            "Ce que le jury attend :",
            "→ Prendre un temps de réflexion sur les enjeux avant de répondre.",
            "→ Savoir dire pourquoi tu veux être CPE.",
            "→ Pas une réponse parfaite : une analyse, un raisonnement structuré et du bon sens." ] },
          { icon:"📏", titre:"La notation", lignes:[
            "Chaque épreuve est notée sur 20.",
            "À l'écrit, une note de 5 ou moins est éliminatoire. À l'oral, un 0 est éliminatoire.",
            "Les oraux pèsent 8 coefficients sur 13 : ils font souvent la différence." ] }
        ] },
      { type:"cartes", icon:"💡", titre:"Infos utiles", sous:"Les dates, les chiffres, les textes et l'après-concours.",
        cartes:()=>[
          { icon:"🎓", titre:"Le concours dès la L3", lignes:[
            "Depuis la session 2026, le concours externe de CPE se passe au niveau bac+3.",
            "Il suffit d'être en L3 ou d'avoir une licence.",
            "Le concours bac+5 existe encore en 2027, pour la dernière fois.",
            "Il existe aussi un concours interne et un troisième concours, pour ceux qui ont déjà une expérience professionnelle." ] },
          { icon:"📅", titre:"Les dates de la session 2027", lignes:[
            "Inscriptions sur Cyclades jusqu'au mercredi 25 novembre 2026, midi (heure de Paris).",
            "Écrits : jeudi 4 et vendredi 5 mars 2027.",
            "Oraux : le calendrier sera publié sur Cyclades.",
            "Concours interne : dossier RAEP au plus tard le jeudi 3 décembre 2026, 23 h 59." ] },
          { icon:"📊", titre:"Les chiffres de 2026", lignes:[
            "200 postes au concours bac+3.",
            "1 872 présents à l'écrit, 450 admissibles, 200 admis : environ 1 sur 10.",
            "Moyenne du dernier admis : 13,43 sur 20.",
            "Les postes de 2027 seront annoncés plus tard." ] },
          { icon:"🏫", titre:"Après le concours", lignes:[
            "Les reçus au concours bac+3 suivent une formation rémunérée de deux ans, de niveau master, à l'INSPE.",
            "Ce master s'appelle M2E. La candidature se fait sur monmaster.gouv.fr.",
            "Une plaquette d'INSPE indique environ 1 400 € par mois la première année, puis 1 800 € la seconde.",
            "Après le master, on est titularisé, avec un engagement à servir l'État plusieurs années." ] },
          { icon:"📚", titre:"Les textes à connaître", lignes:[
            "→ La circulaire de missions des CPE : n° 2015-139 du 10 août 2015.",
            "→ Le référentiel des compétences professionnelles des métiers du professorat et de l'éducation (2013).",
            "→ Le Code de l'éducation, notamment l'article L111-1, cité dans le sujet de dissertation 2026.",
            "→ Le fonctionnement d'un EPLE et ses instances : CVL, CVC, CESCE, projet d'établissement, délégués." ] },
          { icon:"🧭", titre:"Les conseils du jury", lignes:[
            "→ Faire des immersions en établissement, auprès d'un CPE.",
            "→ Se faire un répertoire de définitions courtes des notions qui reviennent.",
            "→ Lire les rapports de jury : sujets, attentes et erreurs fréquentes.",
            "→ Le jury n'attend pas des réponses parfaites, mais une analyse, un raisonnement structuré et du bon sens." ] },
          { icon:"🔗", titre:"Les sources officielles", lignes:["Toutes les infos de ce projet viennent de ces pages."], liens:[
            { t:"Les concours de CPE (education.gouv.fr)", u:"https://www.education.gouv.fr/les-concours-de-recrutement-de-conseillers-principaux-d-education-cpe-6719" },
            { t:"Les épreuves du concours externe bac+3", u:"https://www.education.gouv.fr/les-epreuves-du-concours-externe-bac-3-de-cpe-450225" },
            { t:"Le programme de la session 2027 (PDF)", u:"https://www.education.gouv.fr/sites/default/files/document/programme-du-concours-externe-bac-3-de-recrutement-de-cpe-de-la-session-2027-519964.pdf" },
            { t:"Le rapport du jury 2026, bac+3 (PDF)", u:"https://www.education.gouv.fr/sites/default/files/document/rapport-du-jury-du-concours-externe-bac-3-de-recrutement-de-cpe-de-la-session-2026-520510.pdf" },
            { t:"Mon Master, pour le master M2E", u:"https://www.monmaster.gouv.fr" } ] }
        ] },
      { type:"fil", icon:"🧭", titre:"Le programme dans tes cours", sous:"Ce que tes cours disent déjà des thèmes du concours.", quoi:"des thèmes du concours",
        themes:()=>[
          { ic:"🗳️", nom:"Éduquer à la citoyenneté", mots:["citoyennete","citoyen","citoyens","laicite","democratie","cvl","cvc","delegues","engagement","participation","valeurs de la republique","emc","vie lyceenne","eco-delegues"] },
          { ic:"🌤️", nom:"Climat scolaire", mots:["climat scolaire","harcelement","violence","violences","discipline","sanction","sanctions","punition","bien-etre","decrochage","absenteisme","exclusion","conflit","conflits"] },
          { ic:"🏫", nom:"Le métier de CPE", mots:["cpe","conseiller principal","vie scolaire","eple","assistants d'education","suivi des eleves","projet d'etablissement","cesce","parents","familles"] }
        ] }
    ]
  }
};
// les projets que j'ai : ceux reçus d'une classe ; Civa a aussi Concours CPE, qu'elle partage
function projetsSuivis(){ return follows().filter(f=>f.type === "projet" && PROJETS[f.projet]); }
function mesProjets(){
  const ids = new Set(projetsSuivis().map(f=>f.projet));
  if(isCiva()) ids.add("cpe");
  if(isCloseFriend()) ids.delete("psycho");          // le nôtre est déjà là, en version perso
  return [...ids].filter(id=>PROJETS[id]);
}
// ce que je peux publier dans une classe
function projetsPubliables(){
  const ids = new Set(mesProjets());
  if(isCloseFriend()) ids.add("psycho");
  return [...ids].filter(id=>PROJETS[id]);
}
function estProjetItem(it){ return !!it && /^projet:/.test(String(it.subject_title || "")); }
function projetDeItem(it){ return String(it.subject_title || "").replace(/^projet:/, ""); }
// mes étapes cochées, enregistrées avec mes réglages : elles suivent sur tous mes appareils
function projetEtat(pid){
  USER_SETTINGS.projets = USER_SETTINGS.projets || {};
  return (USER_SETTINGS.projets[pid] = USER_SETTINGS.projets[pid] || {});
}
// Les dates de fin des étapes, lisibles par la machine (le texte affiché reste « Décembre », etc.).
// debut : le 1er du mois où l'étape commence. Sans date ici, une étape n'a ni pastille ni rappel.
const ECHEANCES = {
  cpe:{
    c3:{ fin:"2026-11-25" },
    c4:{ debut:"2026-11-01", fin:"2026-11-30" },
    c5:{ debut:"2026-11-01", fin:"2027-01-31" },
    c6:{ debut:"2026-12-01", fin:"2026-12-31" },
    c7:{ debut:"2026-12-01", fin:"2027-02-28" },
    c9:{ fin:"2027-03-04" }
  },
  psycho:{
    s3:{ debut:"2027-01-01", fin:"2027-01-31" },
    s4:{ debut:"2027-01-01", fin:"2027-02-28" },
    s5:{ debut:"2027-02-01", fin:"2027-03-31" },
    s6:{ debut:"2027-03-01", fin:"2027-04-30" },
    s7:{ fin:"2027-04-30" },
    s7b:{ debut:"2027-03-01", fin:"2027-04-30" },
    s8:{ fin:"2027-05-31" }
  }
};
// « psy » : le projet perso de Civa et Nana (PSYCHO_STEPS) ; les autres : PROJETS
function projetsVisibles(){ return (isCloseFriend() ? ["psy"] : []).concat(mesProjets()); }
function etapesProjet(pid){
  if(pid === "psy"){ loadPsychoSteps(); return PSYCHO_STEPS.map(s=>({ id:s.id, titre:s.title, fait:!!s.done })); }
  const p = PROJETS[pid]; if(!p) return [];
  const e = projetEtat(pid);
  return p.etapes().map(s=>({ id:s.id, titre:s.titre, fait:!!e[s.id] }));
}
function echeancesDe(pid){ return ECHEANCES[pid === "psy" ? "psycho" : pid] || {}; }
function joursAvant(iso){
  const [y, m, d] = iso.split("-").map(Number);
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - auj) / 864e5);
}
// les étapes pas cochées dont la date de fin est dans 7 jours ou moins (ou passée)
function urgences(pid){
  const E = echeancesDe(pid);
  return etapesProjet(pid).filter(s=>!s.fait && E[s.id]).map(s=>({ id:s.id, j:joursAvant(E[s.id].fin) })).filter(u=>u.j <= 7);
}
function libelleUrgence(j){ return j < 0 ? "En retard" : j === 0 ? "Aujourd'hui" : j === 1 ? "Demain" : "Plus que " + j + " jours"; }
function marquerUrgence(step, pid, id){
  const u = urgences(pid).find(x=>x.id === id); if(!u) return;
  step.classList.add("urgent");
  const t = el("span","psy-step-urgent"); t.innerHTML = icone("reveil") + esc(libelleUrgence(u.j));
  step.querySelector(".psy-step-content").appendChild(t);
}
function majBadgeProjets(){
  BADGE_APP.proj = projetsVisibles().reduce((n, pid)=>n + urgences(pid).length, 0);
  poserBadgeApp();
}
// pour les rappels du serveur : chaque étape datée, avec son projet et si elle est faite
function projetsPourServeur(){
  const out = [];
  projetsVisibles().forEach(pid=>{
    const E = echeancesDe(pid), nom = pid === "psy" ? "Projet psycho" : PROJETS[pid].titre;
    etapesProjet(pid).forEach(s=>{ if(E[s.id]) out.push({ id:pid, p:nom, t:s.titre, d:E[s.id].debut || "", f:E[s.id].fin, ok:s.fait }); });
  });
  return out;
}
function projetAvancement(pid){
  const p = PROJETS[pid]; if(!p) return 0;
  const et = p.etapes(), e = projetEtat(pid);
  return et.length ? Math.round(et.filter(s=>e[s.id]).length / et.length * 100) : 0;
}
function retirerProjet(pid){
  USER_SETTINGS.follows = follows().filter(f=>!(f.type === "projet" && f.projet === pid));
  saveContent();
}
function renderProjet(pid){
  const p = PROJETS[pid]; if(!p) return;
  entreeDansEcran(document.getElementById("psycho-inner"));
  const inner = document.getElementById("psycho-inner"); inner.innerHTML = "";
  const back = el("button","psy-back"); back.innerHTML = chevronL + "Retour";
  back.addEventListener("click",()=>{ renderSemestres(); showScreen("semchoice"); });
  inner.appendChild(back);
  const hero = el("div","psy-hero rise");
  hero.innerHTML = `<div class="psy-hero-mark">${icone(p.mark)}</div><div class="psy-hero-title">${esc(p.titre)}</div><div class="psy-hero-sub">${esc(p.accroche)}</div>`;
  inner.appendChild(hero);
  const al = p.alerte ? p.alerte() : "";
  if(al){ const a = el("div","projet-alerte rise"); a.innerHTML = `<span>${icone("reveil")}</span><span>${esc(al)}</span>`; inner.appendChild(a); }
  const lab = el("div","psy-section-label rise"); lab.textContent = "Par où tu veux commencer ?"; inner.appendChild(lab);
  p.rubriques.forEach((r,i)=>{
    const b = el("button","psy-nav-card rise"); b.style.animationDelay = (0.08 + i*0.03) + "s";
    let sous = r.sous;
    if(r.type === "etapes"){ const et = p.etapes(), e = projetEtat(pid), n = et.filter(s=>e[s.id]).length; sous = n ? n + " étape" + (n > 1 ? "s" : "") + " sur " + et.length + " · " + projetAvancement(pid) + " %" : r.sous; }
    b.innerHTML = `<div class="psy-nav-icon">${icone(r.icon)}</div><div class="psy-nav-info"><div class="psy-nav-title">${esc(r.titre)}</div><div class="psy-nav-sub">${esc(sous)}</div></div><span class="psy-nav-arrow">${IC_CHEV_DROITE}</span>`;
    b.addEventListener("click",()=>{ haptic(); ouvrirRubrique(pid, i); });
    if(r.type === "etapes") pastille(b, urgences(pid).length, "étapes à faire bientôt");
    inner.appendChild(b);
  });
  // un projet reçu d'une classe peut se retirer ; celui de Civa vient de l'app
  if(projetsSuivis().some(f=>f.projet === pid)){
    const x = el("button","colle-ou projet-retirer"); x.type = "button"; x.textContent = "Retirer ce projet de mes projets";
    x.addEventListener("click",()=>confirmer("Retirer « " + p.titre + " » ?", "Tes étapes cochées restent enregistrées si tu l'ajoutes à nouveau depuis ta classe.", "Retirer", ()=>{ retirerProjet(pid); renderSemestres(); showScreen("semchoice"); }));
    inner.appendChild(x);
  }
  showScreen("psycho");
  window.scrollTo(0, 0);
}
// les guillemets ne restent jamais seuls en bout de ligne
function escFr(t){ return esc(t).replace(/« /g, "«\u00a0").replace(/ »/g, "\u00a0»").replace(/ ([:;?!])/g, "\u00a0$1"); }
function ouvrirRubrique(pid, i){
  entreeDansEcran(document.getElementById("psycho-inner"));
  const p = PROJETS[pid], r = p.rubriques[i];
  if(r.type === "fil") return renderFil(r.themes(), { mark:r.icon, titre:r.titre, quoi:r.quoi }, ()=>renderProjet(pid));
  const inner = document.getElementById("psycho-inner"); inner.innerHTML = "";
  const back = el("button","psy-back"); back.innerHTML = chevronL + esc(p.titre);
  back.addEventListener("click",()=>{ haptic(); renderProjet(pid); });
  inner.appendChild(back);
  const hero = el("div","psy-hero rise");
  hero.innerHTML = `<div class="psy-hero-mark">${icone(r.icon)}</div><div class="psy-hero-title">${esc(r.titre)}</div><div class="psy-hero-sub">${esc(r.type === "etapes" ? "Coche au fur et à mesure. Tes étapes suivent sur tous tes appareils." : (r.intro || r.sous))}</div>`;
  inner.appendChild(hero);
  if(r.type === "etapes"){
    const et = p.etapes(), e = projetEtat(pid);
    const done = et.filter(s=>e[s.id]).length, pct = et.length ? Math.round(done / et.length * 100) : 0;
    const circ = 2*Math.PI*24, offset = circ - (pct/100)*circ;
    const ph = el("div","psy-prog-head rise");
    ph.innerHTML = `<div class="psy-ring"><svg width="56" height="56"><circle class="psy-ring-bg" cx="28" cy="28" r="24"/><circle class="psy-ring-fill" cx="28" cy="28" r="24" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="psy-ring-num">${pct}%</div></div>
      <div><div class="psy-prog-title">${done === 0 ? "C'est parti : première étape !" : done === et.length ? "Tout est fait, bravo !" : done + " / " + et.length + " étapes faites"}</div><div class="psy-prog-sub">${done === et.length ? "Tout est coché." : "À ton rythme."}</div></div>`;
    inner.appendChild(ph);
    p.phases.forEach(phase=>{
      const st = et.filter(s=>phase.ids.includes(s.id)); if(!st.length) return;
      const box = el("div","psy-phase"); box.innerHTML = `<div class="psy-phase-label">${esc(sansEmoji(phase.label))}</div>`;
      const sw = el("div","psy-steps");
      st.forEach(s=>{
        const fait = !!e[s.id];
        const step = el("button","psy-step" + (fait ? " done" : ""));
        step.innerHTML = `<span class="psy-check">${checkSvg}</span><span class="psy-step-content"><span class="psy-step-title">${esc(s.titre)}</span><span class="psy-step-desc">${s.desc.split("\n").map(l=>"<p>" + escFr(l) + "</p>").join("")}</span><span class="psy-step-date">${icone("calendrier")}${esc(s.date)}</span></span>`;
        if(!fait) marquerUrgence(step, pid, s.id);
        step.addEventListener("click",()=>{ haptic(); if(fait) delete e[s.id]; else e[s.id] = true; scheduleSync(); majBadgeProjets(); const y = window.scrollY; SANS_ENTREE = true; ouvrirRubrique(pid, i); window.scrollTo(0, y); });
        sw.appendChild(step);
      });
      box.appendChild(sw); inner.appendChild(box);
    });
  } else {
    r.cartes().forEach(c=>{
      const box = el("div","psy-info-card");
      const tags = c.tags ? '<div class="psy-info-tags">' + c.tags.map(t=>'<span class="psy-info-tag">' + esc(t) + '</span>').join("") + '</div>' : "";
      const liens = c.liens ? '<div class="projet-liens">' + c.liens.map(l=>`<a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.t)}</a>`).join("") + '</div>' : "";
      box.innerHTML = `<div class="psy-info-header"><span class="psy-info-icon">${icone(c.icon)}</span><span class="psy-info-title">${esc(c.titre)}</span></div>${tags}<div class="psy-info-lines">${c.lignes.map(l=>'<div class="psy-info-line">' + escFr(l) + '</div>').join("")}</div>${liens}`;
      inner.appendChild(box);
    });
  }
  showScreen("psycho");
  window.scrollTo(0, 0);
}

function psyBack(inner,fn){ const b=el("button","psy-back"); b.innerHTML=chevronL+psyTitle(); b.addEventListener("click",fn); inner.appendChild(b); }
// En violet (ton espace) : pas de petits messages d'encouragement.
function psyMini(text){ if(!isNana()) return document.createComment(""); const d=el("div","psy-mini-msg"); d.textContent=text; return d; }

function renderPsychoEtapes(){
  entreeDansEcran(document.getElementById("psycho-inner"));
  loadPsychoSteps();
  const inner=document.getElementById("psycho-inner"); inner.innerHTML="";
  psyBack(inner,renderPsycho);
  const hero=el("div","psy-hero rise"); hero.innerHTML=`<div class="psy-hero-mark">${icone("etapes")}</div><div class="psy-hero-title">Les étapes</div><div class="psy-hero-sub">Coche au fur et à mesure. Pas de pression, tu reviens quand tu veux. 💜</div>`; inner.appendChild(hero);
  const done=PSYCHO_STEPS.filter(s=>s.done).length, total=PSYCHO_STEPS.length, pct=Math.round(done/total*100);
  const circ=2*Math.PI*24, offset=circ-(pct/100)*circ;
  const pt=done===0?"C'est parti : première étape !":done===total?"Tout est fait 🎉 Bravo Nana !":done+" / "+total+" étapes complétées";
  const ps=done===0?"Tu peux y aller à ton rythme 💜":done===total?"Le dossier est prêt. Tu l'as fait ! 🌸":"Tu avances bien, continue comme ça 🌸";
  const ph=el("div","psy-prog-head rise"); ph.style.animationDelay=".05s";
  ph.innerHTML=`<div class="psy-ring"><svg width="56" height="56"><circle class="psy-ring-bg" cx="28" cy="28" r="24"/><circle class="psy-ring-fill" cx="28" cy="28" r="24" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="psy-ring-num">${pct}%</div></div><div><div class="psy-prog-title">${pt}</div><div class="psy-prog-sub">${ps}</div></div>`;
  inner.appendChild(ph);
  const phases=[
    {label:"🌱 Dès maintenant",motiv:"Le plus tôt tu te renseignes, le plus sereine tu seras. 🌸",ids:["s1","s2"]},
    {label:"📅 Janvier 2027",motiv:"Parcoursup ouvre en janvier, juste un vœu à déposer en plus. 💜",ids:["s3","s4"]},
    {label:"✍️ Février → Avril 2027",motiv:"Cette étape prend du temps, mais tu as largement le tien. 🫂",ids:["s5","s6","s7","s7b"]},
    {label:"📬 Avant fin Mai 2027",motiv:"Tu auras tout bouclé un mois à l'avance. Sereine, promis. 🌸",ids:["s8"]},
    {label:"🎓 Juin → Septembre 2027",motiv:"Tu es presque au bout. Tout ce travail va payer. 💜",ids:["s9","s10","s11"]},
  ];
  phases.forEach(phase=>{
    const st=PSYCHO_STEPS.filter(s=>phase.ids.includes(s.id)); if(!st.length)return;
    const ph2=el("div","psy-phase");
    ph2.innerHTML=`<div class="psy-phase-label">${esc(sansEmoji(phase.label))}</div>`;
    ph2.appendChild(psyMini(phase.motiv));
    const sw=el("div","psy-steps");
    st.forEach(s=>{
      const descLines=s.desc.split("\n").map(l=>"<p>"+esc(l)+"</p>").join("");
      const step=el("button","psy-step"+(s.done?" done":""));
      step.innerHTML=`<span class="psy-check">${checkSvg}</span><span class="psy-step-content"><span class="psy-step-title">${esc(s.title)}</span><span class="psy-step-desc">${descLines}</span><span class="psy-step-date">${icone("calendrier")}${esc(s.date)}</span></span>`;
      if(!s.done) marquerUrgence(step, "psy", s.id);
      step.addEventListener("click",()=>{ haptic(); s.done=!s.done; savePsychoSteps(); majBadgeProjets(); const y = window.scrollY; SANS_ENTREE = true; renderPsychoEtapes(); window.scrollTo(0, y); });
      sw.appendChild(step);
    });
    ph2.appendChild(sw); inner.appendChild(ph2);
  });
  if(done===total && isNana()){
    const c=el("div","psy-congrats");
    c.innerHTML=`<div class="psy-congrats-emoji">🎉💜🌸</div><div class="psy-congrats-title">Tu l'as fait, Nana.</div><div class="psy-congrats-text">Chaque étape cochée, c'était un pas de plus vers la version de toi que tu veux devenir.<br><br>Le dossier est prêt. Maintenant tu attends, et tu mérites d'être fière. 💜</div>`;
    inner.appendChild(c);
  }
  // Le carrousel de motivation n'existe que dans l'espace rose (Nana)
  if(isNana()){
    const ml=el("div","psy-section-label"); ml.textContent="💜 Des mots pour te porter"; inner.appendChild(ml);
    const mv=el("div","psy-motiv");
    mv.innerHTML=`<div class="psy-motiv-quote">"${esc(PSYCHO_MOTIV[psychoMotivIdx])}"</div><button class="psy-motiv-btn">Un autre message 💜</button>`;
    mv.querySelector(".psy-motiv-btn").addEventListener("click",()=>{ psychoMotivIdx=(psychoMotivIdx+1)%PSYCHO_MOTIV.length; mv.querySelector(".psy-motiv-quote").textContent='"'+PSYCHO_MOTIV[psychoMotivIdx]+'"'; });
    inner.appendChild(mv);
  }
  showScreen("psycho");
}

function renderPsychoInfos(){
  entreeDansEcran(document.getElementById("psycho-inner"));
  const inner=document.getElementById("psycho-inner"); inner.innerHTML="";
  psyBack(inner,renderPsycho);
  const hero=el("div","psy-hero rise"); hero.innerHTML=`<div class="psy-hero-mark">${icone("ampoule")}</div><div class="psy-hero-title">Infos utiles</div><div class="psy-hero-sub">Tout ce qu'il faut savoir, expliqué clairement. Pas de jargon, pas de pression. 🌸</div>`; inner.appendChild(hero);
  inner.appendChild(psyMini(motivDoux()));
  PSYCHO_INFOS.forEach(info=>{
    const box=el("div","psy-info-card");
    const tags=info.tags?'<div class="psy-info-tags">'+info.tags.map(t=>'<span class="psy-info-tag">'+esc(t)+'</span>').join("")+'</div>':"";
    const lines=info.lines.map(l=>'<div class="psy-info-line">'+esc(l)+'</div>').join("");
    box.innerHTML=`<div class="psy-info-header"><span class="psy-info-icon">${icone(info.icon)}</span><span class="psy-info-title">${esc(info.title)}</span></div><div class="psy-info-lines">${lines}</div>${tags}`;
    inner.appendChild(box);
  });
  inner.appendChild(psyMini(motivDoux()));
  showScreen("psycho");
}

function renderPsychoSpecialite(){
  entreeDansEcran(document.getElementById("psycho-inner"));
  const inner=document.getElementById("psycho-inner"); inner.innerHTML="";
  psyBack(inner,renderPsycho);
  const hero=el("div","psy-hero rise"); hero.innerHTML=`<div class="psy-hero-mark">${icone("rech")}</div><div class="psy-hero-title">Quelle spécialité ?</div><div class="psy-hero-sub">Pas besoin de tout décider maintenant. Lis tranquillement, quelque chose va résonner en toi. 💜</div>`; inner.appendChild(hero);
  inner.appendChild(psyMini(motivDoux()));
  const intro=el("div","psy-info-card");
  intro.innerHTML=`<div class="psy-info-header"><span class="psy-info-icon">${icone("com")}</span><span class="psy-info-title">Comment ça fonctionne ?</span></div><div class="psy-info-lines"><div class="psy-info-line">En psychologie, on choisit sa spécialité au moment du Master, pas de la licence.</div><div class="psy-info-line">La licence donne les bases communes à toutes les branches.</div><div class="psy-info-line">Mais connaître les spécialités maintenant, c'est savoir vers où on marche. 🌸</div></div>`;
  inner.appendChild(intro);
  const st=el("div","psy-section-label"); st.textContent="Les grandes spécialités"; inner.appendChild(st);
  PSYCHO_SPES.forEach(s=>{
    const card=el("div","psy-spe-card");
    card.innerHTML=`<div class="psy-spe-header"><span class="psy-spe-icon">${icone(s.icon)}</span><div class="psy-spe-nom">${esc(s.nom)}</div></div><div class="psy-spe-desc">${esc(s.desc)}</div><div class="psy-spe-lien">💜 ${esc(s.lien)}</div><div class="psy-spe-master">→ ${esc(s.master)}</div>`;
    inner.appendChild(card);
  });
  inner.appendChild(psyMini("Tu n'as pas à choisir tout de suite. Laisse juste l'idée germer. 🌱"));
  const conclu=el("div","psy-info-card");
  conclu.innerHTML=`<div class="psy-info-header"><span class="psy-info-icon">${icone("fleur")}</span><span class="psy-info-title">Et si tu n'es pas encore sûre ?</span></div><div class="psy-info-lines"><div class="psy-info-line">C'est tout à fait normal à ce stade. La licence sert justement à découvrir chaque branche avant de choisir.</div><div class="psy-info-line">Ce qui compte maintenant c'est d'entrer en psycho. La spécialité, tu la choisiras quand tu la sentiras vraiment. 💜</div></div>`;
  inner.appendChild(conclu);
  showScreen("psycho");
}

// ══════════════════════════════════════════════════
// INIT / EVENTS
// ══════════════════════════════════════════════════
document.getElementById("pick-girly").addEventListener("click",()=>chooseTheme("girly"));
document.getElementById("pick-purple").addEventListener("click",()=>chooseTheme("purple"));
document.getElementById("btn-sem-back").addEventListener("click",()=>{ renderSemestres(); showScreen("semchoice"); });
document.getElementById("btn-split-back").addEventListener("click",()=>{ if(CONTROLE_OUVERT){ renderControle(); showScreen("controle"); return; } if(curSubj && MATIERE_OUVERTE === curSubj.id){ renderMatiere(); showScreen("matiere"); return; } renderSubjectCards(curSemestre); showScreen("subjects"); });
// feuille de changement rapide de matière
document.getElementById("split-chip").addEventListener("click",openSubjSheet);
document.getElementById("subj-sheet").addEventListener("click",e=>{ if(e.target.id==="subj-sheet") closeSubjSheet(); });
document.getElementById("edt-link").addEventListener("click",()=>{ haptic(); openCalSheet(); });
// le « + » de l'emploi du temps : un devoir pour un jour précis, ou un cours qui revient chaque semaine
document.getElementById("edt-add").addEventListener("click",()=>{
  haptic();
  openPicker("Ajouter", [
    { label:"Un devoir", sub:"Pour un jour précis, même sans cours ce jour-là", value:"devoir" },
    { label:"Un cours", sub:"Un créneau qui revient chaque semaine", value:"cours" }
  ], v=>setTimeout(()=>{ if(v === "devoir") nouvelleEcheance(); else editCoursPlanning(null, { depuisEdt:true }); }, 320));
});
document.getElementById("cal-close").addEventListener("click",()=>{ haptic(); closeCalSheet(); });
document.getElementById("cal-add").addEventListener("click",()=>{ haptic(); editCalendar(null); });
document.getElementById("cal-sheet").addEventListener("click",e=>{ if(e.target.id==="cal-sheet") closeCalSheet(); });
document.getElementById("btn-split-home").addEventListener("click",()=>{
  haptic();
  // une feuille ouverte doit se refermer, sinon elle resterait par-dessus l'accueil
  closeForm(); closePicker(); closeCalSheet(); closeSubjSheet();
  showScreen("semestres");
});
// ══════════════════════════════════════════════════
// POMODORO : 25 min de travail, 5 min de pause, une pause de 15 min après 4.
// Le temps se calcule sur l'heure de fin : il continue même app fermée.
// Juste avant la pause, 5 questions sur ce qu'on vient de lire (l'effet test).
// ══════════════════════════════════════════════════
const POMO_KEY = "revision_pomo_v1";
const POMO_MIN = { travail:25, pause:5, longue:15 };
// une option du compte : activée, la pastille du minuteur apparaît en bas à gauche
function pomoActif(){ return !!USER_SETTINGS.pomodoro; }
const POMO_SANS = ["login","pick","welcome","session"];   // pas de pastille sur ces écrans
let POMO_VITESSE = 1;                       // la démo accélère le temps
const IC_MINUTEUR = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/></svg>';
function pomoCharger(){
  let p = null; try{ p = JSON.parse(localStorage.getItem(POMO_KEY) || "null"); }catch(e){}
  if(!p || typeof p !== "object") p = {};
  const j = jourIso(new Date());
  if(p.jour !== j){ p.jour = j; p.faits = 0; }
  p.cycle = p.cycle || 0;
  return p;
}
let POMO = pomoCharger(), POMO_T = null;
function pomoSauver(){ try{ localStorage.setItem(POMO_KEY, JSON.stringify(POMO)); }catch(e){} }
function pomoDuree(ph){ return POMO_MIN[ph] * 60000 / POMO_VITESSE; }
function pomoReste(){ if(!POMO.phase) return 0; if(POMO.arret != null) return POMO.arret; return Math.max(0, POMO.fin - Date.now()); }
function pomoMMSS(ms){ const s = Math.ceil(ms / 1000 * POMO_VITESSE); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function pomoNomPhase(ph){ return ph === "travail" ? "Travail" : ph === "longue" ? "Grande pause" : "Pause"; }
// la pause qui vient : la grande après le 4e pomodoro
function pomoPauseSuivante(){ return POMO.cycle >= 4 ? "longue" : "pause"; }
function pomoLancer(ph){
  if(ph === "travail" && POMO.cycle >= 4) POMO.cycle = 0;
  POMO.phase = ph; POMO.fin = Date.now() + pomoDuree(ph); POMO.arret = null; POMO.finie = false;
  pomoSauver(); pomoBoucle(); pomoMaj();
}
function pomoPause(){ if(!POMO.phase || POMO.arret != null || POMO.finie) return; POMO.arret = pomoReste(); pomoSauver(); pomoMaj(); }
function pomoReprendre(){ if(POMO.arret == null) return; POMO.fin = Date.now() + POMO.arret; POMO.arret = null; pomoSauver(); pomoBoucle(); pomoMaj(); }
function pomoArreter(){ POMO.phase = null; POMO.arret = null; POMO.finie = false; pomoSauver(); pomoMaj(); }
function pomoBoucle(){ clearInterval(POMO_T); POMO_T = setInterval(pomoTic, 1000 / Math.min(POMO_VITESSE, 4)); pomoTic(); }
function pomoTic(){
  if(!POMO.phase){ clearInterval(POMO_T); return; }
  if(POMO.arret == null && !POMO.finie && pomoReste() <= 0){
    POMO.finie = true;
    if(POMO.phase === "travail"){ POMO.faits = (POMO.faits || 0) + 1; POMO.cycle = (POMO.cycle || 0) + 1; }
    else if(POMO.phase === "longue") POMO.cycle = 0;
    pomoSauver(); haptic(); try{ navigator.vibrate && navigator.vibrate([120, 80, 120]); }catch(e){}
    pomoOuvrir();
  }
  pomoMaj();
}
// les 4 pomodoros d'une série, en points
function pomoPoints(){
  const n = Math.min(POMO.cycle || 0, 4);
  return `<span class="pomo-pts" aria-label="${n} pomodoro${n > 1 ? "s" : ""} sur 4">${[0,1,2,3].map(i=>`<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
}
// la tuile de l'accueil, la pastille des autres pages, la feuille si elle est ouverte
function pomoMaj(){
  const t = document.getElementById("home-pomo");
  if(t){
    const ph = POMO.phase, reste = pomoReste();
    t.classList.toggle("en-cours", !!ph && !POMO.finie);
    t.classList.toggle("pause", ph === "pause" || ph === "longue");
    if(!t.querySelector(".ht-ic")) t.innerHTML = `<span class="ht-ic ic-box">${IC_MINUTEUR}</span><span class="ht-lbl"></span><span class="ht-t"></span><span class="ht-s"></span><span class="next-bar"><span></span></span>`;
    const lbl = t.querySelector(".ht-lbl"), tt = t.querySelector(".ht-t"), ss = t.querySelector(".ht-s"), bar = t.querySelector(".next-bar");
    if(!ph){ lbl.textContent = ""; lbl.hidden = true; tt.textContent = "Pomodoro"; ss.textContent = POMO.faits ? POMO.faits + " aujourd'hui" : "25 min de travail"; bar.hidden = true; }
    else {
      lbl.hidden = false;
      lbl.textContent = pomoNomPhase(ph) + (POMO.arret != null ? " · en pause" : "");
      tt.textContent = POMO.finie ? (ph === "travail" ? "Bravo !" : "On reprend ?") : pomoMMSS(reste);
      ss.textContent = POMO.finie ? "Touche pour la suite" : ph === "travail" ? "Pomodoro " + Math.min((POMO.cycle || 0) + 1, 4) + " sur 4" : "Lève-toi, bois de l'eau";
      bar.hidden = false;
      bar.firstChild.style.width = (POMO.finie ? 100 : Math.round((1 - reste / pomoDuree(ph)) * 100)) + "%";
    }
  }
  const pill = document.getElementById("pomo-pill");
  if(pill){
    const ecran = document.documentElement.getAttribute("data-screen");
    const montrer = (pomoActif() || !!POMO.phase) && !POMO_SANS.includes(ecran) && !document.getElementById("pomo-overlay").classList.contains("open");
    pill.hidden = !montrer;
    if(montrer){
      pill.classList.toggle("pause", !!POMO.phase && POMO.phase !== "travail");
      pill.classList.toggle("repos", !POMO.phase);
      pill.innerHTML = IC_MINUTEUR + `<span>${!POMO.phase ? "Pomodoro" : POMO.finie ? (POMO.phase === "travail" ? "Terminé" : "On reprend ?") : pomoMMSS(pomoReste())}</span>`;
    }
  }
  if(document.getElementById("pomo-overlay").classList.contains("open")) pomoFeuille(true);
}
function pomoOuvrir(){ pomoFeuille(); document.getElementById("pomo-overlay").classList.add("open"); pomoMaj(); }
function pomoFermer(){ document.getElementById("pomo-overlay").classList.remove("open"); pomoMaj(); }
// juste avant la pause : 5 questions du dernier chapitre lu, ce qui n'est pas validé d'abord
function pomoRappelPossible(){
  const g = lectureCharger().global; if(!g) return null;
  const subj = SUBJECTS.find(x=>x.id === g.id); if(!subj) return null;
  const n = exos(subj, "qcm").filter(x=>x && x.ch === g.label).length;
  return n ? { subj, label:g.label } : null;
}
function pomoRappel(){
  const r = pomoRappelPossible(); if(!r) return;
  const avant = document.documentElement.getAttribute("data-screen");
  pomoFermer();
  curSubj = r.subj; curSemestre = SEMESTRES[r.subj.id];
  choisirScope("ch:" + r.label);
  retourSession = ()=>{ showScreen(avant && avant !== "session" ? avant : "semestres"); pomoOuvrir(); };
  startSession("qcm");
  queue = queue.slice(0, 5); renderSess();
}
function pomoFeuille(maj){
  const box = document.getElementById("pomo-body");
  const ph = POMO.phase, reste = pomoReste();
  // pendant le décompte, on ne redessine que le chiffre et l'anneau
  if(maj && box.dataset.etat === (ph || "") + "|" + (POMO.finie ? 1 : 0) + "|" + (POMO.arret != null ? 1 : 0)){
    if(!ph || POMO.finie) return;
    const c = box.querySelector(".pomo-chiffre"); if(c) c.textContent = pomoMMSS(reste);
    const r = box.querySelector(".pomo-anneau-fill"); if(r && ph) r.style.strokeDashoffset = (1 - reste / pomoDuree(ph)) * 2 * Math.PI * 92;
    return;
  }
  box.dataset.etat = (ph || "") + "|" + (POMO.finie ? 1 : 0) + "|" + (POMO.arret != null ? 1 : 0);
  const circ = 2 * Math.PI * 92;
  const anneau = (fait, txt, sous)=>`<div class="pomo-anneau"><svg viewBox="0 0 200 200"><circle class="pomo-anneau-bg" cx="100" cy="100" r="92"/><circle class="pomo-anneau-fill" cx="100" cy="100" r="92" stroke-dasharray="${circ}" style="stroke-dashoffset:${fait * circ}"/></svg>
    <div class="pomo-centre"><div class="pomo-chiffre">${txt}</div><div class="pomo-sous">${sous}</div></div></div>`;
  let html = "", boutons = [];
  if(!ph){
    html = `<div class="sheet-title">Pomodoro</div><div class="sheet-sub">Travailler par blocs courts, c'est rester concentrée plus longtemps.</div>` +
      anneau(0, pomoMMSS(pomoDuree("travail")), "de travail") +
      `<ul class="pomo-regles"><li><b>25 min</b> de travail, sans téléphone ni autre onglet.</li><li><b>5 min</b> de pause : lève-toi, bouge, bois de l'eau.</li><li>Après <b>4 pomodoros</b>, une pause de 15 min.</li><li>Juste avant la pause, <b>5 questions</b> sur ce que tu viens de lire : se tester ancre mieux que relire.</li></ul>` +
      `<div class="pomo-jour">${pomoPoints()}<span>${POMO.faits ? POMO.faits + " pomodoro" + (POMO.faits > 1 ? "s" : "") + " aujourd'hui" : "Aucun pomodoro aujourd'hui"}</span></div>`;
    boutons = [["Lancer 25 min", ()=>pomoLancer("travail"), "primaire"]];
  } else if(POMO.finie && ph === "travail"){
    const r = pomoRappelPossible(), pp = pomoPauseSuivante();
    html = `<div class="sheet-title">Pomodoro terminé</div><div class="sheet-sub">${POMO.cycle >= 4 ? "4 pomodoros d'affilée : tu as gagné une grande pause." : "Bravo. Encore un effort avant la pause ?"}</div>` +
      anneau(0, "✓", "pomodoro " + Math.min(POMO.cycle, 4) + " sur 4") +
      `<div class="pomo-jour">${pomoPoints()}<span>${POMO.faits} aujourd'hui</span></div>` +
      (r ? `<div class="pomo-rappel"><b>5 questions avant la pause</b><span>Sur ${esc(partiesChapitre(r.label).court)} · ${esc(r.subj.title)}. Te tester tout de suite fixe ce que tu viens de lire.</span></div>` : "");
    if(r) boutons.push(["Faire les 5 questions", pomoRappel, "primaire"]);
    boutons.push([(pp === "longue" ? "Grande pause, 15 min" : "Pause, 5 min"), ()=>pomoLancer(pp), r ? "" : "primaire"]);
    boutons.push(["Arrêter là", ()=>{ pomoArreter(); pomoFermer(); }, "discret"]);
  } else if(POMO.finie){
    html = `<div class="sheet-title">Pause terminée</div><div class="sheet-sub">${ph === "longue" ? "Nouvelle série de 4. Tu peux y aller." : "On s'y remet pour 25 minutes ?"}</div>` +
      anneau(0, "☕", pomoNomPhase(ph).toLowerCase() + " finie") +
      `<div class="pomo-jour">${pomoPoints()}<span>${POMO.faits || 0} aujourd'hui</span></div>`;
    boutons = [["Lancer le pomodoro suivant", ()=>pomoLancer("travail"), "primaire"], ["Arrêter là", ()=>{ pomoArreter(); pomoFermer(); }, "discret"]];
  } else {
    const enPause = POMO.arret != null;
    html = `<div class="sheet-title">${pomoNomPhase(ph)}</div><div class="sheet-sub">${ph === "travail" ? "Pomodoro " + Math.min((POMO.cycle || 0) + 1, 4) + " sur 4. Une seule chose à la fois." : "Éloigne-toi de l'écran. Le cerveau consolide pendant la pause."}</div>` +
      anneau(1 - reste / pomoDuree(ph), pomoMMSS(reste), enPause ? "en pause" : ph === "travail" ? "restantes" : "de pause") +
      `<div class="pomo-jour">${pomoPoints()}<span>${POMO.faits || 0} aujourd'hui</span></div>`;
    boutons = [[enPause ? "Reprendre" : "Mettre en pause", enPause ? pomoReprendre : pomoPause, "primaire"],
      [ph === "travail" ? "Arrêter ce pomodoro" : "Passer la pause", ph === "travail" ? ()=>{ pomoArreter(); pomoFermer(); } : ()=>pomoLancer("travail"), "discret"]];
  }
  box.innerHTML = html + `<div class="pomo-actions"></div>`;
  const act = box.querySelector(".pomo-actions");
  boutons.forEach(([t, f, c])=>{ const b = el("button", "pomo-bt " + c); b.type = "button"; b.textContent = t; b.addEventListener("click",()=>{ haptic(); f(); }); act.appendChild(b); });
  box.classList.toggle("pause", ph === "pause" || ph === "longue");
}
(function(){
  const ov = document.getElementById("pomo-overlay");
  ov.addEventListener("click", e=>{ if(e.target === ov) pomoFermer(); });
  document.getElementById("pomo-pill").addEventListener("click",()=>{ haptic(); pomoOuvrir(); });
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden && POMO.phase) pomoTic(); });
  if(POMO.phase && POMO.arret == null && !POMO.finie) pomoBoucle();
  pomoMaj();
})();

// ── Tirer vers le bas, tout en haut d'une page, pour actualiser ──
// On enregistre ce qui reste à envoyer, on recharge l'emploi du temps, puis la page :
// la dernière version de l'app et des cours arrive, comme à une nouvelle ouverture.
(function(){
  const ptr = document.getElementById("ptr"); if(!ptr) return;
  const SEUIL = 80, MAX = 120;
  let y0 = null, d = 0, actif = false, charge = false;
  const bloque = ()=>{
    const ecran = document.documentElement.getAttribute("data-screen");
    return charge || ["login","pick","welcome","session"].includes(ecran)
      || document.querySelector(".sheet-overlay.open, #pick-sheet.open, #form-sheet.open, .img-voile, .pdf-voile, .somm-panneau.open");
  };
  // la page descend avec le doigt, la pastille apparaît dans l'espace libéré
  const page = ()=>document.querySelector(".screen.active > .wrap, .screen.active > #psycho-inner, .screen.active > .content-scroll");
  const poser = v=>{
    const pg = page(); if(pg){ pg.classList.toggle("ptr-pousse", ptr.classList.contains("anim")); pg.style.transform = v ? "translateY(" + v + "px)" : ""; }
    ptr.style.transform = "translate(-50%," + (v * 0.55 - 50) + "px)";
    ptr.style.opacity = Math.min(1, v / 40);
    const ok = d >= SEUIL;
    ptr.classList.toggle("pret", ok);
    ptr.querySelector(".ptr-txt").textContent = ok ? "Relâche pour actualiser" : "Tire pour actualiser";
    ptr.querySelector(".ptr-rond svg").style.transform = "rotate(" + Math.round(d / SEUIL * 270) + "deg)";
  };
  const debut = y=>{ if(bloque() || window.scrollY > 0) return; y0 = y; d = 0; actif = false; ptr.classList.remove("anim"); };
  const bouge = (y, ev)=>{
    if(y0 === null) return;
    const brut = y - y0;
    if(brut <= 0 || window.scrollY > 0){ if(actif){ d = 0; poser(0); } return; }
    actif = true;
    d = Math.min(MAX, brut * 0.55);          // résistance : on tire, ça suit moins vite que le doigt
    if(ev && ev.cancelable) ev.preventDefault();
    poser(d);
  };
  const fin = async ()=>{
    if(y0 === null) return;
    y0 = null;
    ptr.classList.add("anim");
    if(!actif || d < SEUIL){ d = 0; poser(0); return; }
    charge = true; haptic();
    poser(56); ptr.style.opacity = 1;
    ptr.classList.add("charge"); ptr.classList.remove("pret");
    ptr.querySelector(".ptr-txt").textContent = "Actualisation…";
    await actualiserTout();
  };
  window.actualiserTout = async ()=>{
    try{ if(typeof pushState === "function" && syncOn) await Promise.race([pushState(true), new Promise(r=>setTimeout(r, 2500))]); }catch(e){}
    try{ localStorage.removeItem(EDT_CACHE_KEY); }catch(e){}
    const finir = msg=>{ charge = false; ptr.classList.remove("charge"); d = 0; poser(0); if(msg) toast(msg); };
    // sur l'emploi du temps : on recharge juste les cours, sur place
    if(document.documentElement.getAttribute("data-screen") === "edt"){
      await Promise.all([ loadEDT(true), new Promise(r=>setTimeout(r, 600)) ]);
      renderEDT(); renderTodayCourses(); finir(edtState === "ok" ? "Emploi du temps à jour." : "");
      return;
    }
    if(window.PTR_DEMO){ setTimeout(()=>finir("À jour."), 1200); return; }
    location.reload();
  };
  document.addEventListener("touchstart", e=>debut(e.touches[0].clientY), { passive:true });
  document.addEventListener("touchmove",  e=>bouge(e.touches[0].clientY, e), { passive:false });
  document.addEventListener("touchend", fin);
  document.addEventListener("touchcancel", fin);
  // à la souris aussi (ordinateur, démo)
  document.addEventListener("mousedown", e=>{ if(e.button === 0 && !e.target.closest("button,a,input,textarea,select")) debut(e.clientY); });
  document.addEventListener("mousemove", e=>{ if(y0 !== null && e.buttons) bouge(e.clientY, e); });
  document.addEventListener("mouseup", fin);
})();
document.getElementById("fab-add").addEventListener("click",()=>{
  haptic();
  const a = FAB_ACTIONS[document.getElementById("fab-add").dataset.target];
  if(a) a.fn();
});
document.getElementById("fs-del").addEventListener("click",()=>{ haptic(); if(fsDelete) fsDelete(); });
document.getElementById("fs-extra").addEventListener("click",()=>{ haptic(); if(fsExtra) fsExtra(); });
document.getElementById("fs-cancel").addEventListener("click",()=>{ haptic(); closeForm(); });
// Au retour dans l'app : on retire ce qui a changé côté classes,
// sans obliger à recharger la page.
let dernierRefresh = 0;
async function refreshPartage(){
  if(!syncOn || !PSEUDO) return;
  if(Date.now() - dernierRefresh < 60000) return;  // au plus une fois par minute : moins d'appels, moins de journaux
  dernierRefresh = Date.now();
  await syncFollows();
  rafraichirNouveautesClasses();
  const scr = document.documentElement.getAttribute("data-screen");
  if(scr === "class" && curClass) openClass(curClass);
  else if(scr === "classes") openClasses();
}
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshPartage(); });
window.addEventListener("focus", refreshPartage);

function ouvrirMesDevoirs(){
  haptic(); renderKnowBlock(); showScreen("mesdevoirs"); window.scrollTo(0, 0);
  // les étiquettes « Nouveau » restent affichées pendant cette visite ; la pastille, elle, s'éteint
  marquerDevoirsVus(pendingAlerts(true, true));
}
document.getElementById("btn-sites-back").addEventListener("click",()=>{ haptic(); renderSemestres(); showScreen("semestres"); });
document.getElementById("btn-mesdevoirs-back").addEventListener("click",()=>{ haptic(); renderSemestres(); showScreen("semestres"); });

document.getElementById("btn-compte").addEventListener("click",()=>{ haptic(); ouvrirCompte(); });
document.getElementById("btn-classes-back").addEventListener("click",()=>{ showScreen("semestres"); });
document.getElementById("btn-class-back").addEventListener("click",()=>{ openClasses(); });
document.getElementById("btn-shared-back").addEventListener("click",()=>{ if(curClass) openClass(curClass); else showScreen("search"); });

document.getElementById("pick-sheet").addEventListener("click",e=>{ if(e.target.id==="pick-sheet") closePicker(); });
document.getElementById("fs-ok").addEventListener("click",()=>{ haptic(); if(fsSubmit) fsSubmit(); });
document.getElementById("form-sheet").addEventListener("click",e=>{ if(e.target.id==="form-sheet") closeForm(); });
// Toutes les feuilles : on ferme en glissant le HAUT (poignée, titre) vers le bas, ou en touchant à côté.
// Glisser dans le contenu fait défiler, il ne ferme jamais : plus de fermeture par erreur.
[["form-sheet", ()=>closeForm()], ["pick-sheet", ()=>closePicker()], ["cal-sheet", ()=>closeCalSheet()],
 ["ev-overlay", ()=>closeEvSheet()], ["memo-overlay", ()=>closeMemoSheet()], ["subj-sheet", ()=>closeSubjSheet()]].forEach(([id, fermer])=>{
  const sh = document.querySelector("#" + id + " .sheet"); if(!sh) return;
  let y0 = null, x0 = 0;
  sh.addEventListener("touchstart", e=>{
    const t = e.touches[0];
    const dansHaut = (t.clientY - sh.getBoundingClientRect().top) < 80;
    const champ = e.target.closest("input, textarea, select, button");
    y0 = dansHaut && !champ ? t.clientY : null; x0 = t.clientX;
  }, { passive:true });
  sh.addEventListener("touchend", e=>{
    const t = e.changedTouches[0];
    if(y0 !== null && t.clientY - y0 > 70 && Math.abs(t.clientX - x0) < 60){ haptic(); fermer(); }
    y0 = null;
  }, { passive:true });
});
document.getElementById("btn-session-back").addEventListener("click",()=>{
  if(exam){
    if(exam.fini){ exam = null; renderExamenChoix(); return; }
    confirmer("Quitter l'examen ?", "Tes réponses ne seront pas gardées.", "Quitter", ()=>{ clearInterval(timerInt); exam = null; renderExamenChoix(); });
    return;
  }
  clearInterval(timerInt); if(sessionFil){ (FIL_RETOUR || renderFilPsycho)(); } else if(globalSession){ renderSemestres(); showScreen("semestres"); } else if(retourSession){ quitterSession(); } else { showScreen("split"); } });
document.getElementById("btn-qcmchoix-back").addEventListener("click",()=>{ haptic(); setTab(2); showScreen("split"); });
document.getElementById("btn-auteurs-back").addEventListener("click",()=>{ setTab(2); showScreen("split"); });
document.getElementById("btn-dev-back").addEventListener("click",()=>{ setTab(2); showScreen("split"); });
document.getElementById("btn-plan-back").addEventListener("click",()=>{ showScreen("edt"); });
// recherche
document.getElementById("btn-search").addEventListener("click",()=>openSearch());
document.getElementById("btn-split-search").addEventListener("click",()=>{ haptic(); ouvrirRecherchePage(); });
(function(){
  const inp = document.getElementById("pf-input");
  let t = null;
  inp.addEventListener("input",()=>{ clearTimeout(t); t = setTimeout(()=>chercherDansPage(inp.value), 160); });
  // Entrée : on ferme le clavier et on va à la première occurrence (ou à la suivante)
  inp.addEventListener("keydown",e=>{ if(e.key === "Enter"){ e.preventDefault(); inp.blur(); allerOccurrence(e.shiftKey ? -1 : 1); } });
  document.getElementById("pf-prev").addEventListener("click",()=>{ haptic(); allerOccurrence(-1); });
  document.getElementById("pf-next").addEventListener("click",()=>{ haptic(); allerOccurrence(1); });
  document.getElementById("pf-close").addEventListener("click",()=>{ haptic(); fermerRecherchePage(); });
  document.getElementById("pf-tout").addEventListener("click",()=>{
    haptic();
    const q = inp.value;
    fermerRecherchePage();
    openSearch("split");
    const si = document.getElementById("search-input"); si.value = q; doSearch(q);
  });
})();
// sections repliables de l'accueil
// le bouton Mémo ouvre la feuille mémo
// actualités de la licence : ouvre la page de scolarité dans le navigateur.
// Appui long pour la remplacer par celle de sa propre formation.
document.querySelectorAll("[data-liens]").forEach(b=>b.addEventListener("click",()=>{
  haptic();
  const ici = document.documentElement.getAttribute("data-screen");
  if(b.dataset.liens === "sites" && ici !== "sites") openSitesSheet();
  else if(b.dataset.liens === "classes" && ici !== "classes") openClasses();
}));
document.getElementById("btn-semchoice-back").addEventListener("click",()=>{ renderSemestres(); showScreen("semestres"); });
document.getElementById("btn-memo").addEventListener("click",()=>{ haptic(); openMemoSheet(); });
document.getElementById("memo-overlay").addEventListener("click", e=>{
  if(e.target.id === "memo-overlay") closeMemoSheet();
});

// emploi du temps

document.getElementById("btn-edt-back").addEventListener("click",()=>{ renderSemestres(); showScreen("semestres"); });
document.getElementById("edt-prev").addEventListener("click",()=>{ haptic(); edtWeekOffset--; renderEDT(); });
document.getElementById("edt-next").addEventListener("click",()=>{ haptic(); edtWeekOffset++; renderEDT(); });
// bascule Semaine / Jour
document.querySelectorAll("#edt-seg .seg-opt").forEach(b=>{
  b.addEventListener("click",()=>{
    if(b.classList.contains("active")) return;
    haptic();
    document.querySelectorAll("#edt-seg .seg-opt").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    const wasDay = edtMode === "day";
    setEdtMode(b.dataset.mode);
    // on garde le repère : semaine ↔ jour
    edtWeekOffset = wasDay ? Math.floor(edtWeekOffset/7) : edtWeekOffset*7;
    renderEDT();
  });
});
// feuille d'annotation
document.getElementById("ev-overlay").addEventListener("click", e=>{
  if(e.target.id === "ev-overlay") closeEvSheet();
});
document.getElementById("ev-save").addEventListener("click", ()=>{ haptic(); saveEvSheet(); });
document.getElementById("ev-clear").addEventListener("click", ()=>{
  haptic();
  if(evEditing){
    const k = evKey(evEditing), N = EDTNOTES[k];
    if(N && N.src && N.moi){
      // effacer un devoir que j'ai partagé : il quitte aussi la classe
      N.type = ""; N.note = "";
      partagerAnnotation(k, evEditing, null).then(()=>{ delete EDTNOTES[k]; notesSave(); });
    }else if(N && N.src){
      // reçu d'une classe : mis de côté, il ne revient que si son auteur le change
      const N0 = { type:"", subj:"", note:"", done:false };
      if(autresDe(N).length) N0.autres = N.autres;
      if(N.ignores) N0.ignores = N.ignores;
      ignorer(N0, N.src, N.v);
      EDTNOTES[k] = N0;
    }else if(N && autresDe(N).length){
      // ta note part, les devoirs de la classe gardés à côté restent
      EDTNOTES[k] = { type:"", subj:"", note:"", done:false, autres:N.autres, ignores:N.ignores };
    }else delete EDTNOTES[k];
    notesSave();
  }
  closeEvSheet(); renderEDT(); renderDashboard();
});
document.getElementById("ev-subj").addEventListener("change", ()=>{
  if(!evEditing || !evEditing.jour) return;
  const id = document.getElementById("ev-subj").value;
  const sj = id ? SUBJECTS.find(x=>x.id === id) : null;
  const note = premiereLigne(document.getElementById("ev-note").value);
  evEditing = Object.assign({}, evEditing, { subjChoisi:id, title:sj ? sj.title : (note || "Nouveau devoir") });
  document.getElementById("ev-title").textContent = evEditing.title;
  renderEvProf(evEditing, false);
});
document.querySelectorAll("#ev-types .ev-type").forEach(b=>{
  b.addEventListener("click",()=>{
    haptic();
    document.querySelectorAll("#ev-types .ev-type").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
  });
});

// actualiser manuellement (force le rechargement, sans attendre les 6 h)
// balayage pour changer de semaine
onSwipe(document.getElementById("screen-edt"), {
  onLeft:  ()=>{ haptic(); edtWeekOffset++; renderEDT(); },
  onRight: ()=>{ haptic(); edtWeekOffset--; renderEDT(); },
});
// en vue Jour, openEDT doit viser le bon jour
document.getElementById("btn-search-back").addEventListener("click",()=>{
  if(rechercheDepuis === "split" && curSubj){ showScreen("split"); setTab(curTab); }
  else { renderSemestres(); showScreen("semestres"); }
});
document.getElementById("btn-lex-back").addEventListener("click",()=>{ haptic(); showScreen("split"); setTab(curTab); });
document.getElementById("lex-input").addEventListener("input",e=>renderLexique(e.target.value));
document.getElementById("btn-idx-back").addEventListener("click",()=>{ haptic(); showScreen("search"); });
document.querySelectorAll("#idx-genre .seg-opt").forEach(b=>b.addEventListener("click",()=>{ haptic(); IDX.genre = b.dataset.g; renderIndex(); }));
document.getElementById("idx-multi").addEventListener("click",()=>{ haptic(); IDX.multi = !IDX.multi; renderIndex(); });
(function(){
  const i = document.getElementById("idx-input"); let t = null;
  i.addEventListener("input",()=>{ clearTimeout(t); t = setTimeout(()=>{ IDX.q = i.value; renderIndex(); }, 160); });
  document.getElementById("idx-clear").addEventListener("click",()=>{ i.value = ""; IDX.q = ""; renderIndex(); i.focus(); });
})();
document.getElementById("lex-clear").addEventListener("click",()=>{ const i=document.getElementById("lex-input"); i.value=""; renderLexique(""); i.focus(); });
(function(){
  const inp = document.getElementById("search-input");
  let t = null;
  inp.addEventListener("input",()=>{ clearTimeout(t); t = setTimeout(()=>doSearch(inp.value), 160); });
  document.getElementById("search-clear").addEventListener("click",()=>{ inp.value=""; doSearch(""); inp.focus(); });
})();
document.querySelectorAll(".seg-btn").forEach((b,i)=>b.addEventListener("click",()=>{ haptic(); setTab(i); }));
document.getElementById("type-pick").addEventListener("click",()=>{ haptic(); listeTypes(); });

// ── Gestes ──
// Balayer le contenu d'une matière : gauche/droite = onglet suivant/précédent
document.getElementById("ev-fait").addEventListener("click", function(){ haptic(); this.classList.toggle("on"); });
document.getElementById("ev-note").addEventListener("input", majLiensFiche);
document.getElementById("ev-subj").addEventListener("change", ()=>{ EV_CHS.clear(); majReviserFiche(); });
document.querySelectorAll("#ev-types .ev-type").forEach(b=>b.addEventListener("click", ()=>setTimeout(majReviserFiche, 0)));
onSwipe(document.querySelector("#screen-split .content-scroll"), {
  onLeft:  ()=>{ if(curTab < 2){ haptic(); setTab(curTab + 1); } },
  onRight: ()=>{ if(curTab > 0){ haptic(); setTab(curTab - 1); } },
});


// ── HORS LIGNE ──
// Le service worker met le site en cache : tu peux réviser sans réseau.
if("serviceWorker" in navigator){
  // L'app s'ouvre sur la copie gardée ; quand une version plus récente arrive (cours ou app) :
  // tout juste ouverte et pas encore touchée, on recharge tout de suite ; sinon, un bandeau propose de le faire.
  // Écouté dès le début : le message peut arriver avant la fin du chargement.
  navigator.serviceWorker.addEventListener("message", ev=>{
    if(!ev.data || ev.data.type !== "nouvelle-version") return;
    if(!DEJA_TOUCHE && performance.now() < 6000){ location.reload(); return; }
    bandeauNouvelleVersion();
  });
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("sw.js").then(reg=>{
      // une app installée peut rester des semaines sur une ancienne version :
      // on vérifie à chaque lancement, et au retour au premier plan
      reg.update().catch(()=>{});
      document.addEventListener("visibilitychange",()=>{
        if(!document.hidden) reg.update().catch(()=>{});
      });
      // dès qu'une nouvelle version a pris la main, on recharge une fois
      let recharge = false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(recharge) return;
        recharge = true;
        location.reload();
      });
    }).catch(()=>{});
  });
}
let DEJA_TOUCHE = false;
addEventListener("pointerdown", ()=>{ DEJA_TOUCHE = true; }, { once:true, capture:true });
function bandeauNouvelleVersion(){
  if(document.getElementById("maj-bandeau")) return;
  const b = document.createElement("button");
  b.id = "maj-bandeau"; b.type = "button";
  b.innerHTML = `<span>Nouvelle version prête</span><b>Mettre à jour</b>`;
  b.addEventListener("click", ()=>{ haptic(); location.reload(); });
  document.body.appendChild(b);
  requestAnimationFrame(()=>b.classList.add("on"));
}
// petit bandeau quand la connexion est coupée
(function initOfflineBanner(){
  const b = document.createElement("div");
  b.id = "offline-banner";
  b.textContent = "Hors ligne : tes révisions restent accessibles";
  document.body.appendChild(b);
  const sync = ()=> b.classList.toggle("show", !navigator.onLine);
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
  // badge de synchro
  const s = document.createElement("div");
  s.id = "sync-badge";
  s.className = "sync-badge";
  document.body.appendChild(s);
})();

// ══════════════════════════════════════════════════
// SUPABASE — synchro par pseudo
// ══════════════════════════════════════════════════
function supaReady(){ return !!(SUPA_URL && SUPA_KEY); }

const CODE_KEY = "revision_code_v1";
let CODE = null;
try{ CODE = localStorage.getItem(CODE_KEY); }catch(e){}

// Tout passe par la fonction Edge : elle seule connaît la clé service.
async function api(action, extra, enPartant){
  const body = JSON.stringify(Object.assign({ action, pseudo:PSEUDO, code:CODE }, extra||{}));
  // en quittant l'app, keepalive laisse finir l'envoi (le navigateur le limite à 64 Ko)
  const r = await fetch(`${SUPA_URL}/functions/v1/${API_FN_NAME}`, {
    method:"POST",
    headers:{ apikey:SUPA_KEY, Authorization:"Bearer "+SUPA_KEY, "Content-Type":"application/json" },
    body, keepalive: !!enPartant && body.length < 60000
  });
  const out = await r.json().catch(()=>({}));
  if((action === "class_items" || action === "search_shared") && Array.isArray(out.items)){
    out.projets = out.items.filter(estProjetItem);
    out.items = out.items.filter(it=>!estProjetItem(it));
  }
  if(!r.ok) throw Object.assign(new Error(out.error||("http "+r.status)), { code: out.error });
  return out;
}

// ── Contenu : data.js appartient à Civa, les autres ont le leur sur Supabase ──
const DATA_UES      = Object.assign({}, UES);
const DATA_SUBJECTS = SUBJECTS.slice();

// Une matière venue du serveur peut être incomplète : on garantit les tableaux.
function normChapitre(ch){
  const o = Object.assign({}, ch||{});
  if(!Array.isArray(o.sections)) o.sections = [];
  if(!Array.isArray(o.recap))    o.recap = [];
  return o;
}

function normSubject(s){
  const o = Object.assign({}, s||{});
  ["cm","td","fc","qcm","oq","auteurs","dev","tr"].forEach(k=>{ if(!Array.isArray(o[k])) o[k]=[]; });
  return o;
}

// Mes retouches sur une matière de data.js, fusionnées chapitre par chapitre avec data.js :
// un chapitre que je n'ai pas retouché suit data.js (nouveaux CM, images, mises à jour) ;
// un chapitre retouché garde mon texte, mais reçoit les images et la date de mise à jour de data.js.
function signatureChapitre(c){
  return JSON.stringify({ s:(c.sections||[]).map(x=>({ t:x.title || "", b:x.body || "", l:x.list || [] })), r:c.recap || [] });
}
function fusionChapitres(orig, ov){
  const parLabel = new Map(ov.map(c=>[c.label, c]));
  const out = (orig||[]).map(c=>{
    const o = parLabel.get(c.label); if(!o) return c;
    parLabel.delete(c.label);
    if(signatureChapitre(o) === signatureChapitre(c)) return c;
    const m = normChapitre(o);
    if(c.maj){ m.maj = c.maj; m.majNote = c.majNote; }
    m.sections = m.sections.map(sec=>{
      if(sec.img) return sec;
      const d = (c.sections||[]).find(x=>x.title === sec.title && x.img);
      return d ? Object.assign({}, sec, { img:d.img }) : sec;
    });
    return m;
  });
  // un chapitre qui n'existe que dans mes retouches (renommé, ajouté) reste à la fin
  parLabel.forEach(c=>out.push(normChapitre(c)));
  return out;
}
// Remplace UES / SUBJECTS / SEMESTRES sur place (le reste de l'app pointe dessus).
// Tout ce qui porte _own a été créé dans l'app et vit sur Supabase.
// Le reste vient de data.js : lecture seule, je le régénère de mon côté.
function applyContent(row){
  const c = (row && row.content) || {};
  let ues, subs;
  if(isCiva()){
    // copie : sans ça, les ajouts pollueraient data.js et s'empileraient à chaque rechargement
    ues  = JSON.parse(JSON.stringify(DATA_UES));
    subs = JSON.parse(JSON.stringify(DATA_SUBJECTS)).map(normSubject);
    Object.assign(ues, (c.ues && typeof c.ues === "object") ? c.ues : {});
    (Array.isArray(c.subjects) ? c.subjects : []).forEach(x=>{
      const o = normSubject(x); o._own = true;
      o.cm.forEach(ch=>ch._own = true); o.td.forEach(ch=>ch._own = true);
      subs.push(o);
    });
    // retouches sur une matière de data.js : la liste de chapitres retouchée
    // remplace la mienne, et on garde la trace pour pouvoir revenir en arrière
    const over = (c.overrides && typeof c.overrides === "object") ? c.overrides : {};
    subs.forEach(sj=>{
      const o = over[sj.id]; if(!o) return;
      sj._over = {};
      ["cm","td"].forEach(type=>{
        if(!Array.isArray(o[type])) return;
        sj["_orig_" + type] = sj[type];          // ma version, conservée pour le rétablissement
        sj[type] = fusionChapitres(sj[type], o[type]);
        sj._over[type] = true;
      });
      if(Array.isArray(o.dev)){
        // les devoirs ajoutés depuis dans data.js ne doivent pas disparaître derrière une ancienne retouche
        const deja = new Set(o.dev.map(x=>x && x.label));
        sj.dev = o.dev.concat((sj.dev||[]).filter(x=>x && !deja.has(x.label)));
        sj._over.dev = true;
      }
    });
    // chapitres ajoutés dans l'app à une matière de data.js
    const extra = (c.extra && typeof c.extra === "object") ? c.extra : {};
    subs.forEach(sj=>{
      const e = extra[sj.id]; if(!e) return;
      (e.cm||[]).forEach(ch=>sj.cm.push(Object.assign({}, ch, { _own:true })));
      (e.td||[]).forEach(ch=>sj.td.push(Object.assign({}, ch, { _own:true })));
    });
  }else{
    ues  = (c.ues && typeof c.ues === "object") ? c.ues : {};
    subs = (Array.isArray(c.subjects) ? c.subjects : []).map(x=>{
      const o = normSubject(x); o._own = true;
      o.cm.forEach(ch=>ch._own = true); o.td.forEach(ch=>ch._own = true);
      return o;
    });
  }
  Object.keys(UES).forEach(k=>delete UES[k]);
  Object.assign(UES, ues);
  SUBJECTS.length = 0;
  subs.forEach(x=>SUBJECTS.push(x));
  Object.keys(SEMESTRES).forEach(k=>delete SEMESTRES[k]);
  fusionnerUEsDoublons();
  if(!isCiva() && reparerMatieresSansCode()) saveContent();
  SUBJECTS.forEach(x=>{ if(UES[x.ue]) SEMESTRES[x.id] = UES[x.ue].sem; });
}

// Une matière créée depuis une classe sans ses codes atterrit dans « Mes matières »,
// sans ECUE. Si son nom est celui d'une matière du programme, on lui rend
// son ECUE et on la range dans la bonne UE. On ne touche à rien d'autre.
function reparerMatieresSansCode(){
  let change = false;
  SUBJECTS.forEach(sj=>{
    if(!sj._own || sj.ecue) return;
    const u = UES[sj.ue];
    if(u && u.title && u.title !== "Mes matières") return;   // rangée à la main : on respecte
    const m = metaDepuisDonnees(sj.title);
    if(!m || !m.sem) return;
    sj.ecue = m.ecue;
    sj.ue = trouverOuCreerUE(m.sem, m.ue_title, m.ue_num);
    change = true;
  });
  if(change) nettoyerUEsVides();
  return change;
}

// Sauvegarde (locale toujours, distante si dispo). Groupée pour ne pas spammer.
let saveTimer = null;
// Moins d'envois = moins de journaux côté Supabase. Pendant qu'on révise, les changements
// s'accumulent et partent au plus une fois par minute ; tout part aussitôt quand l'app passe
// en arrière-plan, pour ne rien perdre si iOS la ferme.
const SYNC_ECART = 60000;
let dernierEnvoi = 0, envoiEnAttente = false;
function scheduleSync(){
  if(!syncOn || !PSEUDO) return;
  envoiEnAttente = true;
  if(saveTimer) return;                       // un envoi est déjà prévu : il emportera ce changement
  const attente = Math.max(3000, SYNC_ECART - (Date.now() - dernierEnvoi));
  saveTimer = setTimeout(()=>{ saveTimer = null; pushState(); }, attente);
}
function envoyerMaintenant(){
  if(!envoiEnAttente) return;
  clearTimeout(saveTimer); saveTimer = null;
  pushState(true);
}
document.addEventListener("visibilitychange",()=>{ if(document.hidden) envoyerMaintenant(); });
window.addEventListener("pagehide", envoyerMaintenant);
// Le nom de chaque matière, pour que les rappels du serveur disent « Droits de l'enfant » et pas un code
// pour les rappels de contrôle : par matière, les QCM pas encore validés (q) et les erreurs à revoir (e)
// seulement les matières qui ont un contrôle pas encore fait : le calcul est lourd
function bilanMatieres(){
  const o = {}, avecControle = {};
  Object.values(EDTNOTES || {}).forEach(N=>{ if(N && N.type === "controle" && !N.done && N.subj) avecControle[N.subj] = 1; });
  SUBJECTS.forEach(sj=>{
    if(!sj || !sj.id || !avecControle[sj.id]) return;
    try{
      const xs = itemsDuScope(sj, "qcm", "grand");
      if(!xs.length) return;
      let q = 0, e = 0;
      xs.forEach(x=>{ const k = cardKey(sj.id, "qcm", x.item, x.i); if(!estAcquise(k)) q++; if(estErreur(k)) e++; });
      o[sj.id] = { q, e };
    }catch(err){}
  });
  return o;
}
function nomsMatieres(){ const o = {}; SUBJECTS.forEach(sj=>{ if(sj && sj.id && sj.title) o[sj.id] = sj.title; }); return o; }
async function pushState(enPartant){
  if(!syncOn || !PSEUDO) return;
  envoiEnAttente = false; dernierEnvoi = Date.now();
  try{
    const psy = {};
    PSYCHO_STEPS.forEach(s=>{ psy[s.id] = !!s.done; });
    const patch = {
      theme: document.documentElement.getAttribute("data-theme") || "girly",
      srs: Object.assign({}, SRS, { __matieres: nomsMatieres(), __bilan: bilanMatieres(), __projets: projetsPourServeur(), __edtnotes: EDTNOTES, __memo: MEMO, __devrep: DEVREP, __revises: REVISES, __vus: vusCharger(), __clsvus: clsVus(), __profs: PROFS, __notes: CHNOTES, __errexam: ERREXAM, __jours: joursCharger() }),
      psycho: psy,
      settings: USER_SETTINGS
    };
    if(isCiva()){
      // on ne renvoie QUE les ajouts : data.js reste ma source, jamais écrasée
      const ownUes = {};
      Object.keys(UES).forEach(k=>{ if(!(k in DATA_UES)) ownUes[k] = UES[k]; });
      const extra = {}, overrides = {};
      SUBJECTS.forEach(sj=>{
        if(sj._own) return;
        const cm = sj.cm.filter(ch=>ch._own), td = sj.td.filter(ch=>ch._own);
        if(cm.length || td.length) extra[sj.id] = { cm, td };
        // une liste retouchée est enregistrée en entier : elle prendra le pas sur data.js
        if(sj._over){
          const o = {};
          ["cm","td"].forEach(type=>{
            // seulement les chapitres vraiment retouchés : les autres continuent de suivre data.js
            const src = (DATA_SUBJECTS.find(x=>x.id === sj.id) || {})[type] || [];
            const origine = new Map(src.map(c=>[c.label, signatureChapitre(c)]));
            if(sj._over[type]) o[type] = sj[type].filter(ch=>!ch._own && !ch._shared && origine.get(ch.label) !== signatureChapitre(ch))
              .map(ch=>({ label:ch.label, sections:ch.sections||[], recap:ch.recap||[] }));
          });
          if(sj._over.dev) o.dev = (sj.dev||[]).filter(x=>!x._shared);
          if(Object.keys(o).length) overrides[sj.id] = o;
        }
      });
      patch.content = { ues: ownUes, subjects: SUBJECTS.filter(x=>x._own), extra, overrides };
    }else{
      patch.content = { ues: UES, subjects: SUBJECTS };
    }
    await api("save", { patch }, enPartant === true);
    setSyncBadge("ok");
    return true;
  }catch(e){ setSyncBadge("off"); return false; }
}
// Applique un état venu du serveur
function applyRemote(row){
  if(row.srs && typeof row.srs === "object"){
    const incoming = Object.assign({}, row.srs);
    if(incoming.__edtnotes && typeof incoming.__edtnotes === "object"){
      EDTNOTES = incoming.__edtnotes;
      try{ localStorage.setItem(NOTES_KEY, JSON.stringify(EDTNOTES)); }catch(e){}
    }
    if(incoming.__memo && typeof incoming.__memo === "object"){
      MEMO = {
        todos: Array.isArray(incoming.__memo.todos) ? incoming.__memo.todos : [],
        note:  typeof incoming.__memo.note === "string" ? incoming.__memo.note : ""
      };
      try{ localStorage.setItem(MEMO_KEY, JSON.stringify(MEMO)); }catch(e){}
    }
    if(incoming.__devrep && typeof incoming.__devrep === "object"){
      DEVREP = incoming.__devrep;
      try{ localStorage.setItem(DEVREP_KEY, JSON.stringify(DEVREP)); }catch(e){}
    }
    if(incoming.__revises && typeof incoming.__revises === "object"){
      REVISES = incoming.__revises;
      try{ localStorage.setItem(REVISES_KEY, JSON.stringify(REVISES)); }catch(e){}
    }
    if(incoming.__vus && typeof incoming.__vus === "object"){
      // on fusionne : un chapitre vu sur un appareil l'est partout
      VUS = Object.assign({}, vusCharger(), incoming.__vus);
      try{ localStorage.setItem(VUS_KEY, JSON.stringify(VUS)); }catch(e){}
    }
    if(incoming.__clsvus && typeof incoming.__clsvus === "object"){
      // on fusionne : vu sur un appareil, vu partout
      const v = clsVus();
      Object.assign(v.init, incoming.__clsvus.init || {});
      Object.assign(v.vus, incoming.__clsvus.vus || {});
      clsVusSave(false);
    }
    if(incoming.__profs && typeof incoming.__profs === "object"){
      PROFS = incoming.__profs;
      try{ localStorage.setItem(PROFS_KEY, JSON.stringify(PROFS)); }catch(e){}
    }
    if(incoming.__notes && typeof incoming.__notes === "object"){
      // on garde la note la plus récente de chaque chapitre
      const L = Object.assign({}, CHNOTES);
      Object.keys(incoming.__notes).forEach(k=>{ const n = incoming.__notes[k]; if(n && (!L[k] || (n.d || 0) >= (L[k].d || 0))) L[k] = n; });
      Object.keys(L).forEach(k=>{ if(!L[k] || !L[k].t) delete L[k]; });
      CHNOTES = L;
      try{ localStorage.setItem(CHNOTES_KEY, JSON.stringify(CHNOTES)); }catch(e){}
    }
    if(incoming.__errexam && typeof incoming.__errexam === "object"){
      ERREXAM = incoming.__errexam;
      try{ localStorage.setItem(ERREXAM_KEY, JSON.stringify(ERREXAM)); }catch(e){}
    }
    if(Array.isArray(incoming.__jours)){ try{ const l = new Set(joursCharger()); incoming.__jours.forEach(j=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(j)) l.add(j); }); joursSave([...l].sort()); }catch(e){} }
    delete incoming.__jours;
    delete incoming.__matieres; delete incoming.__bilan; delete incoming.__projets; delete incoming.__edtnotes; delete incoming.__memo; delete incoming.__devrep; delete incoming.__revises; delete incoming.__vus; delete incoming.__profs; delete incoming.__notes; delete incoming.__errexam;
    SRS = incoming;
    try{ localStorage.setItem(SRS_KEY, JSON.stringify(SRS)); }catch(e){}
  }
  if(row.psycho && typeof row.psycho === "object"){
    PSYCHO_STEPS.forEach(s=>{ s.done = !!row.psycho[s.id]; });
    savePsychoSteps();
  }
  if(row.theme){
    applyTheme(row.theme);
    try{ localStorage.setItem(THEME_KEY, row.theme); }catch(e){}
  }
  USER_SETTINGS = (row.settings && typeof row.settings === "object") ? row.settings : {};
  applyContent(row);
  // les chapitres suivis sont rechargés depuis leur classe : c'est le lien vivant
  if(syncOn) syncFollows().then(()=>{ renderSemestres(); rafraichirNouveautesClasses(); });
}
// synchro silencieuse : plus aucun badge affiché
function setSyncBadge(state){ /* volontairement vide */ }

// ── Connexion par pseudo ──
async function doLogin(){
  const inp  = document.getElementById("login-input");
  const cinp = document.getElementById("login-code");
  const msg  = document.getElementById("login-msg");
  // on translittère les accents (é → e) avant de nettoyer,
  // sinon "Nawäl" deviendrait "nawl" au lieu de "nawal"
  const raw = (inp.value || "").trim().toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const p   = raw.replace(/[^a-z0-9_-]/g, "");
  const c   = (cinp.value || "").trim();
  if(p.length < 2){ msg.textContent = "Choisis un pseudo (2 lettres minimum)."; return; }
  if(c.length < 4){ msg.textContent = "Choisis un code d'au moins 4 caractères."; return; }

  PSEUDO = p; CODE = c;

  // Pas de Supabase configuré : on reste en local, ça marche quand même.
  if(!supaReady()){
    syncOn = false;
    try{ localStorage.setItem(PSEUDO_KEY, p); localStorage.setItem(CODE_KEY, c); }catch(e){}
    applyContent(null);
    afterLogin(null);
    return;
  }

  msg.textContent = "Chargement…";
  try{
    const out = await api("login");
    syncOn = true;
    try{ localStorage.setItem(PSEUDO_KEY, p); localStorage.setItem(CODE_KEY, c); }catch(e){}
    msg.textContent = "";
    afterLogin(out.nouveau ? null : out.row);
    if(out.nouveau) await pushState();
    apresConnexionServeur();
  }catch(e){
    PSEUDO = null; CODE = null;
    if(e.code === "code_faux"){
      msg.textContent = "Ce pseudo est déjà pris, et le code ne correspond pas.";
    }else if(e.code === "code_court"){
      msg.textContent = "Choisis un code d'au moins 4 caractères.";
    }else{
      // hors ligne ou serveur muet : on laisse entrer en local
      syncOn = false;
      PSEUDO = p; CODE = c;
      try{ localStorage.setItem(PSEUDO_KEY, p); localStorage.setItem(CODE_KEY, c); }catch(e2){}
      msg.textContent = "";
      applyContent(null);
      setTimeout(()=>afterLogin(null), 600);
    }
  }
}

// ── Glisser depuis le bord gauche pour revenir (comme sur l'iPhone) ──
// Sur les pages qui ont un bouton retour ; pas pendant une série de QCM, pour ne pas la quitter par erreur.
(function(){
  let x0 = null, y0 = null, dx = 0, scr = null, actif = false, dessous = null;
  const rangerDessous = ()=>{ if(dessous){ dessous.classList.remove("dessous"); dessous.style.transform = ""; dessous = null; } };
  const boutonRetour = ()=>{
    const id = document.documentElement.getAttribute("data-screen");
    if(!id || id === "session" || document.documentElement.classList.contains("tabbar-on")) return null;
    if(id === "matiere") return document.getElementById("mt-bk");
    const cands = [...document.querySelectorAll(".page-head .back-btn, #screen-" + id + " .back-btn, #screen-" + id + " .nav-back, #screen-" + id + " .psy-back")];
    return cands.find(b=>b.offsetParent && !b.closest("[hidden]")) || null;
  };
  addEventListener("touchstart", e=>{
    const t = e.touches[0]; if(e.touches.length > 1 || t.clientX > 22) return;
    if(e.target && e.target.closest && e.target.closest("#somm-flot, .sheet-overlay.open, input, textarea")) return;
    if(!boutonRetour()) return;
    x0 = t.clientX; y0 = t.clientY; dx = 0; actif = false; scr = document.querySelector(".screen.active");
  }, { passive:true });
  addEventListener("touchmove", e=>{
    if(x0 === null || !scr) return;
    const t = e.touches[0]; dx = Math.max(0, t.clientX - x0);
    if(!actif){ if(Math.abs(t.clientY - y0) > 14 && Math.abs(t.clientY - y0) > dx){ x0 = null; return; } if(dx < 8) return; actif = true; scr.classList.add("au-doigt");
      // la page d'avant apparaît derrière, légèrement décalée, comme sur l'iPhone
      dessous = ECRAN_AVANT && ECRAN_AVANT !== document.documentElement.getAttribute("data-screen") ? document.getElementById("screen-" + ECRAN_AVANT) : null;
      if(dessous) dessous.classList.add("dessous");
      document.documentElement.classList.add("glisse-retour");
    }
    scr.style.transform = "translateX(" + dx + "px)";
    if(dessous) dessous.style.transform = "translateX(" + (-26 + 26 * Math.min(1, dx / innerWidth)) + "%)";
  }, { passive:true });
  const fin = ()=>{
    if(x0 === null || !scr){ x0 = null; return; }
    x0 = null; const s = scr; scr = null;
    if(!actif) return;
    s.classList.remove("au-doigt");
    document.documentElement.classList.remove("glisse-retour");
    if(dx > innerWidth * .33){
      const b = boutonRetour();
      s.classList.add("relache"); s.style.transform = "translateX(" + innerWidth + "px)";
      if(dessous){ dessous.classList.add("relache"); dessous.style.transform = "translateX(0)"; }
      setTimeout(()=>{ s.classList.remove("relache"); s.style.transform = ""; const d = dessous; dessous = null; if(b) b.click(); if(d){ d.classList.remove("relache","dessous"); d.style.transform = ""; } }, 230);
    } else {
      s.classList.add("relache"); s.style.transform = "";
      if(dessous){ dessous.classList.add("relache"); dessous.style.transform = "translateX(-26%)"; }
      setTimeout(()=>{ s.classList.remove("relache"); if(dessous) dessous.classList.remove("relache"); rangerDessous(); }, 340);
    }
  };
  addEventListener("touchend", fin, { passive:true });
  addEventListener("touchcancel", fin, { passive:true });
})();
function afterLogin(row){
  updatePersonalText();   // le pseudo est connu : on ajuste les messages
  if(!row) applyContent(null);
  if(row){
    applyRemote(row);
    renderSemestres();
    showScreen("semestres");
  } else {
    // pseudo inconnu (ou pas de réseau) : on demande l'ambiance
    let saved=null; try{ saved=localStorage.getItem(THEME_KEY); }catch(e){}
    if(saved){ applyTheme(saved); renderSemestres(); showScreen("semestres"); }
    else { showScreen("pick"); }
  }
}


// ── Événements de connexion ──
document.getElementById("login-oeil").addEventListener("click",function(){
  const i = document.getElementById("login-code"); const voir = i.type === "password";
  i.type = voir ? "text" : "password"; this.classList.toggle("on", voir); this.setAttribute("aria-label", voir ? "Cacher le code" : "Afficher le code");
});
document.getElementById("login-go").addEventListener("click",()=>{ haptic(); doLogin(); });
document.getElementById("login-input").addEventListener("keydown",e=>{ if(e.key==="Enter") document.getElementById("login-code").focus(); });
document.getElementById("login-code").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });


// ── RESTER SUR LA MÊME PAGE QUAND ON ACTUALISE ──
// La page ouverte est notée pour cet onglet (sessionStorage) : une actualisation y ramène,
// au même chapitre et au même endroit. Une app rouverte de zéro repart de l'accueil.
const OU_KEY = "revision_ou_v1";
const PAGES_GARDEES = ["semestres","semchoice","subjects","split","edt","planning","classes","class","shared",
  "devoirs","mesdevoirs","sites","search","index","auteurs","lexique","synthese","qcmchoix","session","psycho"];
function memoriserPage(){
  try{
    const id = document.documentElement.getAttribute("data-screen");
    if(!PAGES_GARDEES.includes(id)){ sessionStorage.removeItem(OU_KEY); return; }
    sessionStorage.setItem(OU_KEY, JSON.stringify({ id, subj: curSubj ? curSubj.id : null, tab: curTab,
      cm: curCmIdx, td: curTdIdx, sem: curSemestre, y: Math.round(window.scrollY), t: Date.now() }));
  }catch(e){}
}
window.addEventListener("pagehide", memoriserPage);
window.addEventListener("beforeunload", memoriserPage);
document.addEventListener("visibilitychange", ()=>{ if(document.hidden) memoriserPage(); });
let PAGE_RESTAUREE = null;
function lirePageGardee(){
  let o = null; try{ o = JSON.parse(sessionStorage.getItem(OU_KEY) || "null"); }catch(e){}
  if(!o || !o.id || !PAGES_GARDEES.includes(o.id)) return null;
  if(Date.now() - (o.t || 0) > 12 * 3600e3) return null;   // une vieille trace ne compte plus
  return o;
}
// rouvre la page notée ; renvoie faux si ce n'est pas possible (l'appelant montre l'accueil)
function restaurerPage(o){
  if(!o) return false;
  try{
    if(o.sem) curSemestre = o.sem;
    const sj = o.subj ? SUBJECTS.find(s=>s.id === o.subj) : null;
    const matiere = ()=>{
      if(!sj) return false;
      openSubject(sj.id);
      const tab = o.tab === 1 ? 1 : 0;
      const n = (sj[tab ? "td" : "cm"] || []).length;
      const i = Math.max(0, Math.min(tab ? (o.td || 0) : (o.cm || 0), n - 1));
      if(tab) curTdIdx = i; else curCmIdx = i;
      setTab(tab);
      return true;
    };
    let ok = true;
    switch(o.id){
      case "semestres": renderSemestres(); showScreen("semestres"); break;
      case "semchoice": renderSemestres(); showScreen("semchoice"); break;
      case "subjects": renderSubjectCards(curSemestre); showScreen("subjects"); break;
      case "split": case "qcmchoix": case "session": ok = matiere(); break;
      case "devoirs": ok = matiere(); if(ok) renderDevoirs(); break;
      case "auteurs": ok = matiere(); if(ok) renderAuteurs(); break;
      case "lexique": ok = matiere(); if(ok) ouvrirLexique(); break;
      case "synthese": ok = matiere(); break;   // l'ancienne fiche de synthèse : on rouvre le cours
      case "edt": case "planning": renderSemestres(); showScreen("semestres"); openEDT(); break;
      case "classes": case "class": case "shared": renderSemestres(); showScreen("semestres"); openClasses(); break;
      case "mesdevoirs": renderKnowBlock(); showScreen("mesdevoirs"); break;
      case "sites": openSitesSheet(); break;
      case "search": case "index": openSearch(); break;
      case "psycho": renderPsycho(); break;
      default: ok = false;
    }
    if(!ok) return false;
    PAGE_RESTAUREE = o;
    // on revient au même endroit dans la page, une fois le contenu posé
    if(o.y > 0 && !["edt","planning","classes","class","shared"].includes(o.id)){
      const y = o.y;
      [60, 350, 900].forEach(ms=>setTimeout(()=>{ if(!DEJA_TOUCHE) window.scrollTo(0, y); }, ms));
    }
    return true;
  }catch(e){ return false; }
}

// start
(async function(){
  let p=null; try{ p = localStorage.getItem(PSEUDO_KEY); }catch(e){}

  if(!p || !CODE){
    // première fois (ou code perdu) : on redemande pseudo + code
    applyContent(null);
    renderSemestres();
    showScreen("login");
    setTimeout(()=>document.getElementById("login-input").focus(), 350);
    return;
  }

  // pseudo connu : on applique le thème local tout de suite (pas d'écran blanc)
  PSEUDO = p;
  let saved=null; try{ saved=localStorage.getItem(THEME_KEY); }catch(e){}
  if(saved) applyTheme(saved);
  updatePersonalText();   // pseudo connu dès le départ
  applyContent(null);     // évite d'afficher le contenu de quelqu'un d'autre le temps du chargement
  renderSemestres();
  // une actualisation ramène sur la page où l'on était
  const garde = saved ? lirePageGardee() : null;
  if(!restaurerPage(garde)) showScreen(saved ? "semestres" : "pick");

  // puis, en arrière-plan, on récupère la version du serveur si elle est plus récente
  if(supaReady()){
    try{
      const out = await api("login");
      syncOn = true;
      if(out.nouveau){ await pushState(); }   // pseudo pas encore sur le serveur : on l'y met
      else {
        applyRemote(out.row); renderSemestres();
        // tes ajouts et retouches viennent d'arriver : la page rouverte est redessinée avec,
        // ou ouverte maintenant si elle n'existait que dans tes ajouts
        const garde = lirePageGardee();
        if(garde && !DEJA_TOUCHE){
          const ici = document.documentElement.getAttribute("data-screen");
          if(PAGE_RESTAUREE ? ici === PAGE_RESTAUREE.id : ici === "semestres") restaurerPage(garde);
        }
      }
      setSyncBadge("ok");
      apresConnexionServeur();
    }catch(e){
      syncOn = false; setSyncBadge("off");
      if(e.code === "code_faux"){             // code changé ailleurs : on redemande
        try{ localStorage.removeItem(CODE_KEY); }catch(e2){}
        CODE = null; showScreen("login");
      }
    }
  }

  // emploi du temps : chargé en arrière-plan, sans bloquer l'affichage
  loadEDT().then(()=>renderTodayCourses());
  // l'index des auteurs et des notions se prépare tranquillement, pour être prêt quand on ouvre un cours
  setTimeout(()=>{ if(SUBJECTS.length) indexEnFond(); }, 2500);
})();
