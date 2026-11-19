// ── Chapitre (Cours / TD / Réviser), révision par chapitre, exercices, auteurs, devoirs
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
  noterMatiereOuverte(id);
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
// l'avancement dans le chapitre : un trait qui suit le bord arrondi du bas de l'en-tête
function majLecture(){
  let b = document.getElementById("lecture-barre");
  if(!b){
    b = document.createElementNS("http://www.w3.org/2000/svg", "svg"); b.id = "lecture-barre"; b.setAttribute("class", "lecture-barre");
    // les deux bouts se fondent dans les coins
    b.innerHTML = '<defs><linearGradient id="lb-fondu" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">'
      + '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".16" stop-color="#fff" stop-opacity=".85"/>'
      + '<stop offset=".84" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
      + '<path class="lb-fond" pathLength="1"/><path class="lb-val" pathLength="1" stroke="url(#lb-fondu)"/>';
    document.body.appendChild(b);
  }
  const on = document.documentElement.getAttribute("data-screen") === "split" && curTab !== 2;
  b.classList.toggle("on", on); if(!on) return;
  const tete = document.querySelector("#screen-split .split-head"); if(!tete) return;
  const r = tete.getBoundingClientRect(), w = Math.round(r.width), hh = Math.round(r.bottom);
  const R = parseFloat(getComputedStyle(tete).borderBottomLeftRadius) || 22, e = 1.25, H = 2 * R + 4;
  if(b._cle !== w + "|" + hh + "|" + R){
    b._cle = w + "|" + hh + "|" + R;
    b.setAttribute("width", w); b.setAttribute("height", H); b.setAttribute("viewBox", `0 0 ${w} ${H}`);
    b.style.left = r.left + "px"; b.style.top = (hh - H) + "px";
    const y = H - e, d = `M ${e} ${H - R - 2} A ${R - e} ${R - e} 0 0 0 ${R} ${y} L ${w - R} ${y} A ${R - e} ${R - e} 0 0 0 ${w - e} ${H - R - 2}`;
    b.querySelectorAll("path").forEach(p=>p.setAttribute("d", d));
    b.querySelector("#lb-fondu").setAttribute("x2", w);
  }
  const h = document.documentElement.scrollHeight - innerHeight;
  const v = h > 40 ? Math.min(1, Math.max(0, scrollY / h)) : 0;
  b.querySelector(".lb-val").style.strokeDashoffset = String(1 - v);
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
  cloche:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
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
  // écouter : la pastille flottante, comme celle du pomodoro (voir majPastilleAudio)
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
    { key:"jour", label:"Jour", type:"choice", value:c ? String(c.jour) : (()=>{
        // ajouté depuis la vue Jour de l'agenda : le jour de la semaine affiché (1 = lundi … 7 = dimanche)
        if(!(opts && opts.depuisEdt) || edtMode !== "day") return "1";
        const d = new Date(); d.setDate(d.getDate() + edtWeekOffset); return String(d.getDay() || 7);
      })(),
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
