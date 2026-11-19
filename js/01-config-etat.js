// ── Réglages, état, révision espacée, annotations, mémo, texte des cours, édition
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
  body.innerHTML = ""; body.style.removeProperty("--pc");
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
    }else if(f.type === "couleur"){
      inp = el("input","fs-input"); inp.type = "hidden"; inp.value = f.value || "";
      const row = el("div","fs-couleurs");
      ((f.defaut ? [""] : []).concat(COULEURS_CHOIX)).forEach(k=>{
        const b = el("button","fs-coul" + (k === inp.value ? " on" : "") + (k ? "" : " auto")); b.type = "button";
        b.style.setProperty("--fc", HM_HEX[k || f.defaut] || f.defaut);
        b.setAttribute("aria-label", k ? "Couleur " + k : "Couleur automatique");
        if(!k) b.textContent = "A";
        b.addEventListener("click",()=>{ haptic(); inp.value = k; row.querySelectorAll(".fs-coul").forEach(x=>x.classList.remove("on")); b.classList.add("on"); apercu(); });
        row.appendChild(b);
      });
      // les icônes en dessous prennent la couleur choisie : on voit le résultat avant d'enregistrer
      const apercu = ()=>body.style.setProperty("--pc", HM_HEX[inp.value || f.defaut] || f.defaut || "var(--accent)");
      apercu();
      w.appendChild(row); w.appendChild(inp);
    }else if(f.type === "icone"){
      // toutes les icônes dessinées, au choix ; « Auto » garde celle que l'app donne d'elle-même
      inp = el("input","fs-input"); inp.type = "hidden"; inp.value = f.value || "";
      const g = el("div","fs-icones");
      const cases = (f.defaut ? [""] : []).concat(ICONES_CHOIX);
      cases.forEach(k=>{
        const b = el("button","fs-ic" + (k === inp.value ? " on" : "") + (k ? "" : " auto")); b.type = "button";
        b.setAttribute("aria-label", k || "Icône automatique");
        b.innerHTML = k ? icone(k) : icone(f.defaut) + "<small>Auto</small>";
        b.addEventListener("click",()=>{ haptic(); inp.value = k; g.querySelectorAll(".fs-ic").forEach(x=>x.classList.remove("on")); b.classList.add("on"); });
        g.appendChild(b);
      });
      w.appendChild(g); w.appendChild(inp);
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
