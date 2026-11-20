// ── Emploi du temps, planning manuel, contrôles, notifications
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
    else if(key === "UID")     cur.uid = val.trim();
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
    try{ comparerEDT(theme); }catch(e){}
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

// ── Les changements de l'emploi du temps : cours annulés, déplacés, salle changée ──
// On compare la version gardée et celle qui arrive, sur les trois semaines à venir.
// Ce qui change est écrit dans l'historique des notifications (sur ce téléphone).
function comparerEDT(theme){
  let avant = null;
  try{ const c = JSON.parse(localStorage.getItem(EDT_CACHE_KEY) || "null"); if(c && c.theme === theme) avant = c.events || null; }catch(e){}
  if(!avant || !avant.length || !EDT.length) return;
  const maint = Date.now(), fin = maint + 21 * 86400000;
  const dansFenetre = t => t > maint && t < fin;
  // la nouvelle version doit couvrir la période, sinon un calendrier en panne ferait « annuler » tout
  const finNouveau = EDT[EDT.length - 1].start.getTime();
  const cle = e => e.uid || (e.title + "@" + new Date(e.start).toISOString());
  const nouveaux = new Map(EDT.map(e=>[cle(e), e]));
  const anciens = new Map(avant.map(e=>[cle(e), e]));
  // « vendredi 20 novembre, 13h30 » ; court : « mardi 24, 13h30 »
  const quand = (d, court) => { d = new Date(d); return JOURS[d.getDay()].toLowerCase() + " " + d.getDate() + (court ? "" : " " + MOIS[d.getMonth()]) + ", " + hhmm(d).replace(":", "h"); };
  const ajouts = [];
  avant.forEach(a=>{
    const t = new Date(a.start).getTime();
    if(!dansFenetre(t) || t > finNouveau) return;
    const n = nouveaux.get(cle(a)), nom = nomCourt(a.title || "Cours");
    if(!n){
      // le même cours ailleurs dans la semaine : déplacé, sinon annulé
      const ailleurs = EDT.find(x=>x.title === a.title && !anciens.has(cle(x)) && Math.abs(x.start - t) < 7 * 86400000);
      if(ailleurs) ajouts.push({ titre:nom, texte:"Déplacé : " + quand(t, 1) + " → " + quand(ailleurs.start, 1) + ".", date:ailleurs.start });
      else ajouts.push({ titre:nom, texte:"Annulé : " + quand(t) + (a.place ? " (" + a.place + ")" : "") + ".", date:t });
      return;
    }
    if(n.start.getTime() !== t) ajouts.push({ titre:nom, texte:"Déplacé : " + quand(t, 1) + " → " + quand(n.start, 1) + ".", date:n.start });
    else if((a.place || "") !== (n.place || "") && n.place) ajouts.push({ titre:nom, texte:"Nouvelle salle : " + n.place + (a.place ? " au lieu de " + a.place : "") + ", " + quand(t) + ".", date:t });
  });
  // un cours ajouté dans les deux semaines (rattrapage…)
  EDT.forEach(n=>{
    const t = n.start.getTime();
    if(t > maint && t < maint + 14 * 86400000 && !anciens.has(cle(n)) && !avant.some(a=>a.title === n.title && Math.abs(new Date(a.start) - t) < 7 * 86400000))
      ajouts.push({ titre:nomCourt(n.title || "Cours"), texte:"Cours ajouté : " + quand(t) + (n.place ? " (" + n.place + ")" : "") + ".", date:t });
  });
  // connecté : c'est le serveur qui surveille l'emploi du temps (et prévient même app fermée)
  if(syncOn && PSEUDO) return;
  ajouts.forEach(x=>notifLocale("edt", x.titre, x.texte, { type:"edt", date:new Date(x.date).toISOString() }));
}
// ── L'historique des notifications ──
// Celles envoyées par le serveur (cours, devoirs, classes, rappels, projets) + celles vues sur ce téléphone (emploi du temps).
const NOTIFS_LOCALES_CLE = "revision_notifs_locales_v1";
function notifsLocales(){ try{ const a = JSON.parse(localStorage.getItem(NOTIFS_LOCALES_CLE) || "[]"); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
function notifsLocalesSauver(a){ try{ localStorage.setItem(NOTIFS_LOCALES_CLE, JSON.stringify(a.slice(0, 200))); }catch(e){} }
function notifLocale(famille, title, body, data){
  const a = notifsLocales();
  // pas deux fois le même changement
  if(a.some(x=>x.title === title && x.body === body)) return;
  a.unshift({ id:"l" + Date.now() + Math.random().toString(36).slice(2, 6), famille, title, body, data:data || {}, lu:false, created_at:new Date().toISOString(), local:true });
  notifsLocalesSauver(a.filter(x=>Date.now() - new Date(x.created_at) < 60 * 86400000));
  majPastilleNotifs();
}
let NOTIFS_SERVEUR = null;   // dernière liste reçue du serveur
var NOTIFS_VUES = [];        // les non lues affichées : elles passent en « lu » quand on quitte la page
async function chargerNotifs(){
  if(!syncOn || !PSEUDO) return NOTIFS_SERVEUR || [];
  try{ NOTIFS_SERVEUR = (await api("notif_list")).items || []; }catch(e){}
  return NOTIFS_SERVEUR || [];
}
function toutesNotifs(){
  return [...(NOTIFS_SERVEUR || []), ...notifsLocales()].sort((a,b)=>(!!a.ancien - !!b.ancien) || (new Date(b.created_at) - new Date(a.created_at)));
}
const NOTIF_CAT = [
  { k:"tout",    nom:"Tout", ic:"cloche" },
  { k:"edt",     nom:"Horaires", fam:["edt"], ic:"calendrier" },
  { k:"devoirs", nom:"Devoirs",  fam:["devoirs","rappels","semaine"], ic:"etapes" },
  { k:"cours",   nom:"Cours",    fam:["cours"], ic:"livre" },
  { k:"classe",  nom:"Classe",   fam:["classe"], ic:"membres" },
  { k:"projets", nom:"Projets",  fam:["projets"], ic:"projet" }
];
function catDe(n){ return (NOTIF_CAT.find(c=>c.fam && c.fam.includes(n.famille)) || { k:"autre", ic:"reveil" }); }
// le dernier choix (Non lues / Toutes, catégorie) est gardé d'une ouverture à l'autre
const NOTIF_FILTRE_CLE = "revision_notif_filtre_v1";
let NOTIF_FILTRE = (()=>{ try{ const f = JSON.parse(localStorage.getItem(NOTIF_FILTRE_CLE) || "null"); if(f && f.cat && f.lu) return f; }catch(e){} return { cat:"tout", lu:null }; })();
function notifFiltreSauver(){ try{ localStorage.setItem(NOTIF_FILTRE_CLE, JSON.stringify(NOTIF_FILTRE)); }catch(e){} }
function majPastilleNotifs(){
  const b = document.getElementById("btn-notifs"); if(!b) return;
  const n = toutesNotifs().filter(x=>!x.lu).length;
  if(BADGE_APP.notifs !== n){ BADGE_APP.notifs = n; poserBadgeApp(); }
  let p = b.querySelector(".nb");
  if(!n){ if(p) p.remove(); return; }
  if(!p){ p = el("span","nb"); b.appendChild(p); }
  p.textContent = n > 99 ? "99+" : n;
}
async function marquerNotifs(liste, lu){
  liste = liste.filter(x=>!x.ancien);
  const serveur = liste.filter(x=>!x.local).map(x=>x.id), loc = new Set(liste.filter(x=>x.local).map(x=>x.id));
  liste.forEach(x=>{ x.lu = lu; });
  if(loc.size){ const a = notifsLocales(); a.forEach(x=>{ if(loc.has(x.id)) x.lu = lu; }); notifsLocalesSauver(a); }
  majPastilleNotifs();
  if(serveur.length && syncOn) try{ await api("notif_lu", { ids:serveur, lu }); }catch(e){}
}
async function openNotifs(){
  showScreen("notifs"); window.scrollTo(0, 0);
  renderNotifs();
  await chargerNotifs();
  renderNotifs();
}
function renderNotifs(){
  const box = document.getElementById("notifs-liste"); if(!box) return;
  const tout = toutesNotifs();
  const nonLus = tout.filter(n=>!n.lu);
  if(!NOTIF_FILTRE.lu) NOTIF_FILTRE.lu = nonLus.length ? "nonlu" : "tout";
  const ici = tout.filter(n=>(NOTIF_FILTRE.cat === "tout" || catDe(n).k === NOTIF_FILTRE.cat) && (NOTIF_FILTRE.lu === "tout" || !n.lu));
  // en haut : non lues ou toutes
  const seg = document.getElementById("notifs-seg");
  seg.innerHTML = [["nonlu","Non lues"],["tout","Toutes"]].map(([k,t])=>`<button type="button" class="${NOTIF_FILTRE.lu === k ? "on" : ""}" data-lu="${k}">${t}</button>`).join("");
  seg.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{ haptic(); NOTIF_FILTRE.lu = b.dataset.lu; notifFiltreSauver(); renderNotifs(); }));
  // dessous : une tuile par catégorie, avec ses non lues (Projets seulement s'il y en a)
  const f = document.getElementById("notifs-filtres");
  const cats = NOTIF_CAT.filter(c=>c.k !== "projets" || tout.some(n=>catDe(n).k === "projets"));
  f.innerHTML = `<div class="nf-cats">${cats.map(c=>{
      const nb = (c.k === "tout" ? nonLus : nonLus.filter(n=>catDe(n).k === c.k)).length;
      return `<button type="button" class="nf-cat${NOTIF_FILTRE.cat === c.k ? " on" : ""}" data-cat="${c.k}"><span class="nf-ic nf-${c.k}">${icone(c.ic)}</span><span class="nf-cat-n">${esc(c.nom)}</span>${nb ? `<em>${nb > 99 ? "99+" : nb}</em>` : ""}</button>`; }).join("")}</div>`;
  f.querySelectorAll(".nf-cat").forEach(b=>b.addEventListener("click",()=>{ haptic(); NOTIF_FILTRE.cat = b.dataset.cat; notifFiltreSauver(); renderNotifs(); }));
  const tl = document.getElementById("notifs-tout-lu");
  const aLire = ici.filter(n=>!n.lu);
  NOTIFS_VUES = aLire.slice();
  tl.hidden = !aLire.length;
  tl.onclick = ()=>{ haptic(); marquerNotifs(aLire, true); renderNotifs(); };
  box.innerHTML = "";
  const voirToutes = ()=>{
    const p = el("p","nf-fin");
    p.innerHTML = `Tout le reste est lu · <button type="button">Voir toutes</button>`;
    p.querySelector("button").addEventListener("click",()=>{ haptic(); NOTIF_FILTRE.lu = "tout"; notifFiltreSauver(); renderNotifs(); });
    box.appendChild(p);
  };
  if(!ici.length){
    if(NOTIF_FILTRE.lu === "nonlu" && tout.length){
      box.innerHTML = vide("cloche", "Tout est lu", "Rien de nouveau ici.");
      voirToutes(); return;
    }
    box.innerHTML = vide("cloche", tout.length ? "Rien ici" : "Aucune notification pour l'instant",
      tout.length ? "Choisis une autre catégorie pour voir les autres." : "Les cours publiés, les devoirs, les rappels et les changements de l'emploi du temps s'afficheront ici, même si tu as balayé la notification.");
    return;
  }
  // groupées par jour ; les anciennes (retrouvées dans les classes) à part, à la fin
  let jour = "", carte = null, separe = false;
  ici.forEach(n=>{
    const d = new Date(n.created_at), j = d.toDateString();
    if(n.ancien && !separe){ separe = true; jour = ""; }
    if(j !== jour){
      jour = j;
      const auj = new Date().toDateString(), hier = new Date(Date.now() - 86400000).toDateString();
      const t = el("div","nf-jour"); t.textContent = j === auj ? "Aujourd'hui" : j === hier ? "Hier" : JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()];
      box.appendChild(t);
      carte = el("div","nf-groupe"); box.appendChild(carte);
    }
    const c = catDe(n);
    const r = el("button","nf-row" + (n.lu ? " lu" : "")); r.type = "button";
    r.innerHTML = `<span class="nf-ic nf-${c.k}">${icone(c.ic)}</span><span class="nf-t"><b>${esc(n.title || "Révisioner")}</b><small>${esc(n.body || "")}</small></span><span class="nf-h">${hhmm(d)}</span>${n.lu ? "" : '<i class="nf-pt" aria-label="non lue"></i>'}`;
    r.addEventListener("click",()=>{
      haptic();
      if(!n.lu) marquerNotifs([n], true);
      const data = n.data || {};
      if(data.type === "edt"){ openEDTAt(new Date(data.date || n.created_at)); return; }
      if(data.type) ouvrirDepuisNotif(data); else renderNotifs();
    });
    // appui long : lue / non lue
    if(!n.ancien) onLongPress(r, ()=>{ marquerNotifs([n], !n.lu); renderNotifs(); toast(n.lu ? "Marquée comme lue." : "Marquée comme non lue."); });
    carte.appendChild(r);
  });
  if(NOTIF_FILTRE.lu === "nonlu" && tout.some(n=>n.lu)) voirToutes();
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
// Les cours annulés repérés par le serveur (ses alertes « Annulé : … ») : ils restent visibles dans l'agenda, barrés
function coursAnnulesDu(date){
  let ns = [];
  try{ ns = toutesNotifs(); }catch(e){ return []; }
  const vus = new Set(), out = [];
  ns.forEach(n=>{
    if(n.famille !== "edt" || !n.data || !n.data.date) return;
    const ancien = /^Cours annulé · /.test(n.title || "");
    if(!ancien && !/^Annulé :/.test(n.body || "")) return;
    const d = new Date(n.data.date);
    if(isNaN(d) || !sameDay(d, date)) return;
    const nom = String(n.title || "Cours").replace(/^Cours annulé · /, "");
    const k = nom + "@" + d.getTime();
    if(vus.has(k)) return; vus.add(k);
    // revenu dans l'emploi du temps entre-temps : ce n'est plus une annulation
    if(EDT.some(e=>e.start && e.start.getTime() === d.getTime() && nomCourt(e.title) === nom)) return;
    const lieu = (String(n.body || "").match(/\(([^)]+)\)\.?$/) || String(n.body || "").match(/, ([^,]+)\.$/) || [])[1] || "";
    out.push({ title:nom, start:d, end:null, place:lieu, annule:true, uid:"annule:" + k });
  });
  return out;
}
function joursOn(date){ return echeancesDu(date).concat(eventsOn(date)).sort((a,b)=>a.start - b.start); }
// le jour que l'agenda montre : en vue Jour, ce jour-là ; en vue Semaine, le lundi de la semaine affichée.
// Sur la semaine (ou le jour) en cours : rien de particulier (null).
function jourVuAgenda(){
  if(!edtWeekOffset) return null;
  const t0 = new Date(); t0.setHours(12,0,0,0);
  const d = new Date(t0);
  if(edtMode === "day"){ d.setDate(d.getDate() + edtWeekOffset); return d; }
  d.setDate(d.getDate() + 7 * edtWeekOffset);
  const l = mondayOf(d); l.setHours(12,0,0,0); return l;
}
function nouvelleEcheance(opts){
  const vu = opts && opts.depuisEdt ? jourVuAgenda() : null;
  const d = vu || new Date(); if(!vu) d.setDate(d.getDate() + 1);
  if(opts) delete opts.depuisEdt;
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
    const evs = joursOn(d).concat(coursAnnulesDu(d)).sort((a,b)=>a.start - b.start);
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
    lienLegende(body);
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
    const evs = joursOn(d).concat(coursAnnulesDu(d)).sort((a,b)=>a.start - b.start);
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
  if(total) lienLegende(body);
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
  // la matière déjà choisie pour ce cours, un autre jour : elle vaut pour tous ses créneaux
  const retenue = (USER_SETTINGS.coursMat || {})[cleCoursMat(e)];
  if(retenue){ const s = SUBJECTS.find(x=>x.id === retenue); if(s) return s; }
  const m = String(e.title||"").match(/\b(?:ECUE|UE)\s*([0-9]+(?:\.[0-9]+)*)/i);
  if(!m) return matiereLangue(e);
  const cands = SUBJECTS.filter(x=>String(x.ecue||"").split(/\s/)[0] === m[1]);
  if(!cands.length) return matiereLangue(e);
  if(cands.length < 2) return cands[0];
  // même code pour plusieurs matières : on garde celle dont le nom colle le mieux
  const mots = t=>plat(t).split(/[^a-z0-9]+/).filter(w=>w.length > 3);
  const titre = new Set(mots(e.title));
  const score = x=>mots(x.title).filter(w=>titre.has(w)).length;
  const best = cands.slice().sort((a,b)=>score(b) - score(a));
  return score(best[0]) > score(best[1]) ? best[0] : null;
}
// le nom du cours sans son type ni ses accents : « Anglais C TD » et « Anglais C » sont le même cours
function cleCoursMat(e){ return plat(nomCourt(String(e.title || ""))).replace(/\b(cm|td|tp)\b/g, "").replace(/\s+/g, " ").trim(); }
// « Anglais C », « Espagnol B1 »… : l'emploi du temps n'a pas le code de la matière.
// On le relie à la matière de langue du semestre de ce cours (septembre à janvier : semestre impair, sinon pair).
const LANGUE_RE = /\b(anglais|espagnol|allemand|italien|portugais|arabe|chinois|english|spanish|langues?|lv ?\d?)\b/;
function matiereLangue(e){
  if(!LANGUE_RE.test(plat(e.title || ""))) return null;
  const cands = SUBJECTS.filter(x=>x.bilingue || /^langue/.test(plat(x.title || "")));
  if(!cands.length) return null;
  const an = Math.max(1, Math.ceil((hmSemCourant() || 1) / 2)), mo = (e.start || new Date()).getMonth();
  const vise = mo >= 7 || mo === 0 ? an * 2 - 1 : an * 2;
  return cands.slice().sort((a,b)=>Math.abs((SEMESTRES[a.id]||0) - vise) - Math.abs((SEMESTRES[b.id]||0) - vise))[0] || null;
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
// Un cours que le serveur a vu changer (déplacé, nouvelle salle, ajouté) : étiquette « Modifié » turquoise
function coursModifie(e){
  if(!e || e.jour || e.annule || !e.start) return false;
  let ns = []; try{ ns = toutesNotifs(); }catch(err){ return false; }
  // le serveur retire « CM » / « TD » et le code du nom : on compare sans
  const net = t=>plat(nomCourt(String(t || ""))).replace(/\b(cm|td|tp)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const nom = net(e.title);
  return ns.some(n=>n.famille === "edt" && n.data && n.data.date && /^(Déplacé|Nouvelle salle|Cours ajouté)/.test(n.body || "")
    && new Date(n.data.date).getTime() === e.start.getTime() && net(n.title) === nom);
}
// La légende des couleurs de l'agenda et des devoirs (un lien en bas de ces deux pages)
const LEGENDE = [
  ["fait", "Fait", "Ce que tu as coché"],
  ["devoir", "À rendre", "Un devoir à rendre"],
  ["controle", "Contrôle", "Un contrôle"],
  ["note", "Note", "Une note sur un cours"],
  ["annule", "Annulé", "Un cours annulé, barré dans l'agenda"],
  ["retard", "En retard", "Un rendu pas coché après sa date"],
  ["modifie", "Modifié", "Un cours déplacé, ou son horaire ou sa salle changés"]
];
function ouvrirLegende(){
  document.querySelectorAll("#pick-sheet .pick-actions, #pick-sheet .fp-retour").forEach(n=>n.remove());
  document.getElementById("pick-title").textContent = "Légende";
  const box = document.getElementById("pick-list");
  box.innerHTML = `<p class="lg-sous">Les couleurs de l'agenda et des devoirs</p>` +
    LEGENDE.map(([k, nom, txt])=>`<div class="lg-row"><span class="ev-badge lg-pill ${k}">${nom}</span><span>${txt}</span></div>`).join("");
  document.getElementById("pick-sheet").classList.add("open");
}
function lienLegende(parent){
  if(!parent) return;
  const b = el("button","lg-lien"); b.type = "button"; b.textContent = "Légende des couleurs";
  b.addEventListener("click",()=>{ haptic(); ouvrirLegende(); });
  parent.appendChild(b);
}
function courseCard(e){
  // un cours annulé : barré, avec l'étiquette « Annulé » (noire en clair, blanche en sombre)
  if(e.annule){
    const c = el("div","edt-course annule");
    c.innerHTML = `<div class="edt-time"><span>${hhmm(e.start)}</span></div>
      <div class="edt-info"><div class="edt-annule-tag"><span class="ev-badge annule">Annulé</span></div>
        <div class="edt-title">${esc(e.title)}</div>${e.place ? `<div class="edt-place"><span>${esc(e.place)}</span></div>` : ""}</div>`;
    c.addEventListener("click",()=>{ haptic(); toast("Ce cours a été annulé."); });
    return c;
  }
  const n = evNote(e);
  // un cours peut être marqué (contrôle / à rendre) ou simplement annoté
  const aut = autresDe(n);
  const kind = n ? (n.type || ((n.note || n.subj) ? "note" : "") || (aut[0] ? aut[0].type || "note" : "")) : "";
  const maint = new Date(), enCours = !e.jour && e.start <= maint && (e.end || e.start) > maint;
  const c = el("div","edt-course" + (kind ? " flagged "+kind : "") + (n && n.done ? " done" : "") + (enCours ? " live" : ""));
  // un cours marqué ressort à la couleur de son étiquette (contrôle rose, à rendre jaune, note bleue) :
  // la barre, une teinte légère, l'heure ; un cours sans rien reste neutre
  if(kind) c.classList.add("a-mat");
  // fait : l'étiquette elle-même passe au vert, avec la coche (plus besoin d'une étiquette « Fait » à côté)
  const fait = !!(n && n.done && kind);
  // un rendu pas coché dont le jour est passé : « En retard » (orange vif) à la place de « À rendre »
  const hier = new Date(); hier.setHours(0,0,0,0);
  const enRetard = kind === "devoir" && !fait && new Date(e.start).setHours(0,0,0,0) < hier.getTime();
  if(enRetard) c.classList.add("en-retard");
  const badge = (kind
    ? `<span class="ev-badge ${enRetard ? "retard" : kind}${fait ? " fait" : ""}">${fait ? "✓ " : ""}${enRetard ? "En retard" : kind==="controle"?"Contrôle":kind==="devoir"?"À rendre":"Note"}</span>` : "") +
    aut.filter(a=>(a.type || "note") !== kind).map(a=>`<span class="ev-badge ${a.type || "note"}">${TAG_DEVOIR[a.type || ""]}</span>`).join("") +
    (coursModifie(e) ? `<span class="ev-badge modifie">Modifié</span>` : "") +
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
  // la matière du cours, devinée d'après l'emploi du temps (code ECUE, ou « Anglais C » → Langue vivante)
  const devinee = !e.jour && !n.subj ? matiereDuCours(e) : null;
  sel.value = n.subj || (devinee ? devinee.id : "");
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
  let subj = document.getElementById("ev-subj").value;
  // la matière devinée n'est pas enregistrée en plus : elle se retrouve toute seule (un cours sans rien reste neutre)
  const note = document.getElementById("ev-note").value.trim();
  // retenir la matière choisie pour ce cours : elle sera déjà remplie les autres jours
  if(!evEditing.jour && evEditing.title){
    const ck = cleCoursMat(evEditing), cm = USER_SETTINGS.coursMat || {};
    if(ck && subj && cm[ck] !== subj){ USER_SETTINGS.coursMat = Object.assign({}, cm, { [ck]:subj }); saveContent(); }
  }
  if(subj && !evEditing.jour && !type && !note){ const dv = matiereDuCours(Object.assign({}, evEditing)); if(dv && dv.id === subj && !(evNote(evEditing) || {}).subj) subj = ""; }
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

// Déplacé depuis 02 : il faut que loadEDT existe déjà.
// l'emploi du temps vient d'arriver : on y pose les devoirs suivis
loadEDT = (orig => async function(force){ const r = await orig(force); try{ appliquerDevoirsSuivis(); }catch(e){} return r; })(loadEDT);
