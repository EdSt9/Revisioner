// ── Tableau de bord, accueil, matières, icônes et couleurs
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
// Les rendus pas cochés dont la date est passée (60 jours au plus) : ils restent, en tête, « En retard »
function devoirsEnRetard(){
  const auj = new Date(); auj.setHours(0,0,0,0);
  const depuis = auj.getTime() - 60 * 86400000;
  const jours = Object.keys(EDTNOTES).filter(k=>k.startsWith("jour|")).map(echeanceEv);
  return EDT.concat(jours).filter(e=>{
    if(!e || !e.start) return false;
    const n = evNote(e); if(!n || n.done) return false;
    const t = n.type || ((!n.note && autresDe(n)[0]) ? autresDe(n)[0].type : "");
    const jourE = new Date(e.start); jourE.setHours(0,0,0,0);
    return t === "devoir" && jourE.getTime() < auj.getTime() && jourE.getTime() >= depuis;
  }).sort((a,b)=>a.start - b.start);
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
  const retards = devoirsEnRetard();
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
  // en retard : en tête, jusqu'à ce qu'on les coche
  if(retards.length){
    const t = el("div","av-semaine"); t.textContent = "En retard"; box.appendChild(t);
    const c = el("div","av-carte"); box.appendChild(c);
    retards.forEach(e=>{
      const nn = evNote(e) || {};
      const j = Math.round((new Date().setHours(0,0,0,0) - new Date(e.start).setHours(0,0,0,0)) / 86400000);
      const lignes = String(nn.note || (autresDe(nn)[0] || {}).note || "").trim().split("\n").map(x=>x.trim()).filter(Boolean);
      if(e.titreNote) lignes.shift();
      const apercu = (lignes[0] || "").replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, u=>libelleUrl(u).split("/")[0]);
      const row = el("div","av-row dv-carte retard"); row.setAttribute("role","button"); row.tabIndex = 0;
      row.innerHTML = `<span class="dv-j">J+${j}<small>${HM_JOURS[new Date(e.start).getDay()]}</small></span>` +
        `<span class="av-txt"><b>${esc(nomCourt(e.title))}</b><small><i>En retard</i>${apercu ? " · " + esc(apercu) : ""}</small></span>` +
        `<button type="button" class="av-fait" aria-pressed="false" aria-label="Marquer comme fait">${COCHE_SVG}</button><span class="av-fl">›</span>`;
      row.querySelector(".av-fait").addEventListener("click", ev=>{ ev.stopPropagation(); haptic(); marquerFait(evKey(e), true); renderKnowBlock(); });
      row.addEventListener("click",()=>{ haptic(); const sjD = matiereDeNote(e, nn); if(sjD) openControle(e); else openEDTAt(e.start); });
      c.appendChild(row);
    });
  }
  if(!alerts.length && retards.length) return;
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
function cleMatiereAuto(s){
  let k = themeMatiere(s);
  if(!k){
    const pris = new Set(SUBJECTS.filter(x=>x !== s && SEMESTRES[x.id] === SEMESTRES[s.id]).map(themeMatiere).filter(Boolean));
    const cles = Object.keys(MAT_IC), libres = cles.filter(c=>!pris.has(c)), lot = libres.length ? libres : cles;
    k = lot[hmHash(titreNu(s.title)) % lot.length];
  }
  return k;
}
// l'icône choisie à la main (réglages de chacun), sinon celle du thème
function cleMatiere(s){
  const m = USER_SETTINGS.matIcones, c = m && m[s.id];
  return (c && (MAT_IC[c] || (typeof UI_IC === "object" && UI_IC[c]))) ? c : cleMatiereAuto(s);
}
function iconeMatiere(s){
  const k = cleMatiere(s);
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MAT_IC[k] || UI_IC[k]}</svg>`;
}
function changerIconeMatiere(m, apres){
  const c = USER_SETTINGS.matIcones && USER_SETTINGS.matIcones[m.id];
  openForm(m.title, [
    { key:"couleur", label:"Couleur", type:"couleur", value:(USER_SETTINGS.matCouleurs || {})[m.id] || "", defaut:hmCouleurAuto(m) },
    { key:"icone", label:"Icône", type:"icone", value:c && (MAT_IC[c] || UI_IC[c]) ? c : "", defaut:cleMatiereAuto(m),
      hint:"Seulement pour toi. « Auto » garde celles de l'app." }
  ], "Enregistrer", v=>{
    const m2 = Object.assign({}, USER_SETTINGS.matIcones);
    if(v.icone) m2[m.id] = v.icone; else delete m2[m.id];
    const c2 = Object.assign({}, USER_SETTINGS.matCouleurs);
    if(v.couleur) c2[m.id] = v.couleur; else delete c2[m.id];
    USER_SETTINGS.matIcones = m2; USER_SETTINGS.matCouleurs = c2; saveContent();
    if(apres) apres();
  });
}
// ══════════ ICÔNES DE L'INTERFACE ══════════
// Semestres, projets, archives et rubriques : des icônes dessinées, dans le même style que celles des matières.
// Les emojis encore écrits dans les données passent par EMO_IC ; un emoji choisi à la main reste affiché tel quel.
const UI_IC = {"graine": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3.5 19.5h17v2h-17z\"/><ellipse fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"16\" rx=\"3.2\" ry=\"2.3\"/><path d=\"M3.5 19.5h17\"/><ellipse cx=\"12\" cy=\"16\" rx=\"3.2\" ry=\"2.3\"/><path d=\"M12 13.7v-2.2c0-1.4 1-2.4 2.5-2.4\"/>", "pousse": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 14c-3.2 0-5.5-2.2-5.5-5.5 3.2 0 5.5 2.2 5.5 5.5zM12 11.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5z\"/><path d=\"M3.5 20.5h17M12 20.5v-9M12 14c-3.2 0-5.5-2.2-5.5-5.5 3.2 0 5.5 2.2 5.5 5.5zM12 11.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5z\"/>", "plante": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 16c-3.2 0-5.3-2-5.3-5 3.2 0 5.3 2 5.3 5zM12 12.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5zM12 8.5c-2 0-3.3-1.3-3.3-3.3 2 0 3.3 1.3 3.3 3.3z\"/><path d=\"M3.5 20.5h17M12 20.5V5.5M12 16c-3.2 0-5.3-2-5.3-5 3.2 0 5.3 2 5.3 5zM12 12.5c0-3 2-5 5.2-5 0 3-2 5-5.2 5zM12 8.5c-2 0-3.3-1.3-3.3-3.3 2 0 3.3 1.3 3.3 3.3z\"/>", "arbuste": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5.5 17.5a3 3 0 0 1 .8-5.9 4 4 0 0 1 7.5-1.6 3.3 3.3 0 0 1 5 2.9 2.4 2.4 0 0 1-.6 4.6z\"/><path d=\"M5.5 17.5a3 3 0 0 1 .8-5.9 4 4 0 0 1 7.5-1.6 3.3 3.3 0 0 1 5 2.9 2.4 2.4 0 0 1-.6 4.6zM3.5 21h17M9.5 17.5V21M14.5 17.5V21\"/>", "arbre": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3z\"/><path d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3zM12 21v-7.2M12 17.5l-2.5-2.2M12 16l2.3-2.2M8 21h8\"/>", "fleuri": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3z\"/><path d=\"M12 3a4.5 4.5 0 0 1 4.4 3.5 3.7 3.7 0 0 1 .6 7.3H7a3.7 3.7 0 0 1 .6-7.3A4.5 4.5 0 0 1 12 3zM12 21v-7.2M8 21h8\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"9.6\" cy=\"9.2\" r=\"1.25\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"14.3\" cy=\"8.2\" r=\"1.25\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12.6\" cy=\"11.6\" r=\"1.25\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"8.6\" cy=\"12\" r=\".9\"/>", "tetecoeur": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 11a7 7 0 1 1 11 5.7V21H9v-2.5H7a2 2 0 0 1-2-2v-2l-1.5-.6L5 11z\"/><path d=\"M5 11a7 7 0 1 1 11 5.7V21M9 21v-2.5H7a2 2 0 0 1-2-2v-2l-1.5-.6L5 11\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M12.3 12.6s-3-1.9-3-3.8a1.6 1.6 0 0 1 3-.9 1.6 1.6 0 0 1 3 .9c0 1.9-3 3.8-3 3.8z\"/>", "ecole": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4 10.5h16v10H4z\"/><path d=\"M2.5 11 12 4.5l9.5 6.5M4 10v10.5M20 10v10.5M3 20.5h18M10 20.5v-4.5h4v4.5\"/><circle cx=\"12\" cy=\"10.8\" r=\"1.8\"/><path d=\"M12 10v1l.7.5\"/>", "archives": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M4.5 8h15v11.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5z\"/><rect x=\"3\" y=\"3.5\" width=\"18\" height=\"4.5\" rx=\"1.2\"/><path d=\"M4.5 8v11.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V8M9.5 12h5\"/>", "projet": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 4h12l-2.5 4L17 12H5z\"/><path d=\"M5 21V4h12l-2.5 4L17 12H5\"/>", "etapes": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"4\" y=\"3.5\" width=\"16\" height=\"17.5\" rx=\"2.5\"/><rect x=\"4\" y=\"3.5\" width=\"16\" height=\"17.5\" rx=\"2.5\"/><path d=\"M7.5 8.5l1.3 1.3 2.2-2.4M13 9h3.5M7.5 14l1.3 1.3 2.2-2.4M13 14.5h3.5\"/>", "ampoule": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3z\"/><path d=\"M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3zM9 19h6M10 21.5h4M12 6.5a2.5 2.5 0 0 0-2.5 2.5\"/>", "dossier": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 11h18\"/>", "micro": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"9\" y=\"2.5\" width=\"6\" height=\"11.5\" rx=\"3\"/><rect x=\"9\" y=\"2.5\" width=\"6\" height=\"11.5\" rx=\"3\"/><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7\"/>", "regle": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M3 15.5 15.5 3 21 8.5 8.5 21z\"/><path d=\"M3 15.5 15.5 3 21 8.5 8.5 21zM7 11.5l2 2M10 8.5l1.5 1.5M13 5.5l2 2M5.5 13l1.5 1.5M11.5 10l1.5 1.5\"/>", "calendrier": "<rect fill=\"currentColor\" stroke=\"none\" opacity=\".22\" x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/><rect fill=\"currentColor\" stroke=\"none\" x=\"7\" y=\"13\" width=\"3\" height=\"3\" rx=\".7\"/>", "chiffres": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5 13h3.5v7H5zM10.3 8h3.5v12h-3.5zM15.5 4H19v16h-3.5z\"/><path d=\"M5 13h3.5v7H5zM10.3 8h3.5v12h-3.5zM15.5 4H19v16h-3.5zM3 20.5h18\"/>", "lien": "<path d=\"M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1.2-1.2\"/>", "canape": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M5.5 12V8.5A2.5 2.5 0 0 1 8 6h8a2.5 2.5 0 0 1 2.5 2.5V12z\"/><path d=\"M5.5 12V8.5A2.5 2.5 0 0 1 8 6h8a2.5 2.5 0 0 1 2.5 2.5V12M3 12.5a2 2 0 0 1 4 0V15h10v-2.5a2 2 0 0 1 4 0V18H3zM5 18v2M19 18v2\"/>", "cible": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"12\" r=\"1.6\"/>", "adn": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9\"/><path d=\"M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9M9 6h6M9.5 9.5h5M9.5 14.5h5M9 18h6\"/>", "fleur": "<circle fill=\"currentColor\" stroke=\"none\" cx=\"12\" cy=\"10\" r=\"2\"/><path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 8a3 3 0 1 1 3-3 3 3 0 1 1 1 5.5 3 3 0 1 1-3 3.5 3 3 0 1 1-4-.5A3 3 0 1 1 8 7.5 3 3 0 0 1 12 8z\"/><path d=\"M12 7a2.7 2.7 0 1 1 2.6-3.3A2.7 2.7 0 1 1 16 9a2.7 2.7 0 1 1-2.2 4.4 2.7 2.7 0 1 1-4.5-.6A2.7 2.7 0 1 1 8.2 7 2.7 2.7 0 0 1 12 7zM12 14v7.5M12 18c-2 0-3.5-1.2-3.5-3\"/>", "reveil": "<circle fill=\"currentColor\" stroke=\"none\" opacity=\".22\" cx=\"12\" cy=\"13\" r=\"7.5\"/><circle cx=\"12\" cy=\"13\" r=\"7.5\"/><path d=\"M12 9.5V13l2.5 1.8M4 5.5 6.5 3M20 5.5 17.5 3\"/>", "page": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M6 3h8l4.5 4.5V21H6z\"/><path d=\"M6 3h8l4.5 4.5V21H6zM14 3v4.5h4.5M9 12h6M9 15.5h6\"/>", "semence": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M12 3.5c2.3 1.9 3.3 4 3.3 6a3.3 3.3 0 0 1-6.6 0c0-2 1-4.1 3.3-6z\"/><path d=\"M12 3.5c2.3 1.9 3.3 4 3.3 6a3.3 3.3 0 0 1-6.6 0c0-2 1-4.1 3.3-6zM12 7.2v4.6M3.5 20h17M12 15.8v.6M12 17.8v.4\"/>", "terreau": "<path fill=\"currentColor\" stroke=\"none\" opacity=\".22\" d=\"M6.8 8.5C6 12 5.5 15.5 5.5 18.2A2.8 2.8 0 0 0 8.3 21h7.4a2.8 2.8 0 0 0 2.8-2.8c0-2.7-.5-6.2-1.3-9.7z\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M7.5 8.5c.8-1.8 2.6-2.8 4.5-2.8s3.7 1 4.5 2.8z\" opacity=\".55\"/><path d=\"M6.8 8.5C6 12 5.5 15.5 5.5 18.2A2.8 2.8 0 0 0 8.3 21h7.4a2.8 2.8 0 0 0 2.8-2.8c0-2.7-.5-6.2-1.3-9.7zM5.8 8.5h12.4M12 18.6v-3M12 16.6c-1.8 0-2.9-1-2.9-2.8 1.8 0 2.9 1 2.9 2.8zM12 15.6c0-1.6 1-2.6 2.6-2.6 0 1.6-1 2.6-2.6 2.6z\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"9.5\" cy=\"4.6\" r=\".8\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"13\" cy=\"3.6\" r=\".8\"/><circle fill=\"currentColor\" stroke=\"none\" cx=\"15.2\" cy=\"5.2\" r=\".7\"/>"};
const EMO_IC = {"📋": "etapes", "💡": "ampoule", "🔍": "rech", "🧭": "boussole", "✍": "plume", "📂": "dossier", "📁": "dossier", "🗂": "archives", "🗣": "micro", "🤝": "com", "💬": "com", "📏": "regle", "🎓": "edu", "📅": "calendrier", "📊": "chiffres", "🏫": "ecole", "📚": "livre", "📖": "livre", "🔗": "lien", "🛋": "canape", "👶": "enf", "👥": "grp", "🧩": "puzzle", "🌀": "psy", "🧠": "psy", "💜": "tetecoeur", "🎯": "cible", "💼": "pro", "🔀": "debat", "🔄": "cycle", "🗺": "globe", "🌍": "globe", "🧬": "adn", "🌸": "fleur", "🌱": "pousse", "⏰": "reveil", "⏳": "reveil", "📄": "page", "✏": "plume", "🔬": "rech", "📐": "regle", "📬": "page", "📝": "plume"};
// la cloche et les membres (page Notifications)
UI_IC.cloche = '<path fill="currentColor" stroke="none" opacity=".22" d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>';
UI_IC.membres = '<circle fill="currentColor" stroke="none" opacity=".22" cx="9" cy="8" r="3.2"/><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5a3.2 3.2 0 0 1 0 6M17.5 14.5a5 5 0 0 1 3 5.5"/>';
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
// l'ordre de la grille de choix : la plante qui pousse, les projets, les matières, puis le reste
const ICONES_CHOIX = [...new Set(["semence","graine","pousse","plante","arbuste","arbre","fleuri","terreau","tetecoeur","ecole","projet",
  ...Object.keys(MAT_IC), ...Object.keys(UI_IC)])].filter(k=>!["page","lien","reveil","calendrier","regle","chiffres","archives"].includes(k));
function iconeSemestre(sem){ return sem < 1.5 ? "semence" : SEM_IC[Math.max(0, Math.min(6, Math.floor(sem)))]; }
// « 🌱 Dès maintenant » → « Dès maintenant » : la frise a déjà ses repères
const sansEmoji = t=>String(t || "").replace(/^(\p{Extended_Pictographic}\ufe0f?\s*)+/u, "");
function hmHash(t){ let h = 0; String(t).split("").forEach(c=>{ h = (h * 31 + c.charCodeAt(0)) | 0; }); return Math.abs(h); }
// sans choix à la main : chaque matière du semestre prend une des 8 couleurs à tour de rôle, sans doublon tant qu'il y en a assez
// l'ordre alterne les teintes (deux voisines ne se ressemblent pas) ; chaque semestre commence ailleurs dans la palette
const HM_COUL_AUTO = ["b","o","g","f","y","i","c","r","l","s","t","v"];
// des couleurs posées à la main là où le tirage donnait deux teintes trop proches dans un même semestre
const MAT_COUL_DEF = { e231:"p", e221:"n", e222:"e", e232orient:"t" };
function hmCouleurAuto(subj){
  if(MAT_COUL_DEF[subj.id]) return MAT_COUL_DEF[subj.id];
  const sem = SEMESTRES[subj.id];
  const freres = SUBJECTS.filter(x=>SEMESTRES[x.id] === sem).map(x=>x.id).sort();
  const i = freres.indexOf(subj.id);
  if(i < 0) return HM_COUL[hmHash(subj.id) % HM_COUL.length];
  const decalage = Math.round((Number(sem) || 0) * 2) * 5;
  return HM_COUL_AUTO[(i + decalage) % HM_COUL_AUTO.length];
}
function hmCouleur(subj){
  const k = USER_SETTINGS.matCouleurs && USER_SETTINGS.matCouleurs[subj.id];   // la couleur choisie à la main
  return k && HM_HEX[k] ? k : hmCouleurAuto(subj);
}
const HM_HEX = { v:"var(--accent)", b:"var(--c-b)", c:"#12a9a0", g:"var(--c-g)", y:"var(--c-y)", o:"#f26b3a", r:"var(--c-r)", t:"#a8703f",
  i:"#5b5bd6", l:"#65a30d", f:"#c03fd0", s:"#0ea5e9",
  // trois de plus, pour qu'aucune matière d'un même semestre ne se ressemble : rose clair, rouge, cyan clair
  p:"#f472b6", e:"#e5484d", n:"#22d3ee" };
const COULEURS_CHOIX = ["v","i","b","s","n","c","g","l","y","o","e","r","p","f","t"];
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
        <div class="hm-rc"><b data-n="${fait}">${fait}</b><span>sur ${HM_OBJECTIF} <i class="hm-rc-reg">›</i></span></div></div>
      <div class="hm-side">
        ${chT ? `<div class="hm-sv"><div class="l">Chapitres lus<em>${chL}/${chT}</em></div><div class="hm-tr hm-doux-b"><i data-w="${pc(chL,chT)}" style="background:var(--c-b)"></i></div></div>` : ""}
        <div class="hm-sv"><div class="l">QCM validés<em>${pc(qO,qT)} %</em></div><div class="hm-tr hm-doux-v"><i data-w="${pc(qO,qT)}" style="background:var(--accent)"></i></div></div>
        <div class="hm-sv"><div class="l">Mes erreurs<em>${err}</em></div><div class="hm-tr hm-doux-r"><i data-w="${Math.min(100, err * 4)}" style="background:var(--c-r)"></i></div></div>
      </div></div>
    ${auj >= HM_OBJECTIF ? `<div class="hm-bravo">✓ Objectif atteint. Tout le reste, c'est du bonus.</div>` : ""}
    <button type="button" class="hm-cta hm-press" id="hm-go">${ctaTxt}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>
    ${(()=>{ const a = apercuRevision(); return `<div class="hm-apercu${a.vide ? " vide" : ""}">${serie.n ? `🔥 <b>${serie.n} jour${serie.n > 1 ? "s" : ""}</b><span class="pt"></span>` : ""}${a.txt}</div>`; })()}`;
  const boxJ = document.getElementById("hm-jour");
  const neuf = jour !== HM_DERNIER;
  if(neuf){
    HM_DERNIER = jour; boxJ.innerHTML = jour;
    document.getElementById("hm-go").addEventListener("click",()=>{ haptic(); lancerRevisionJour(); });

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

  // ── mes matières : les dernières ouvertes, puis celles du semestre (contrôles d'abord) pour compléter ──
  const boxM = document.getElementById("hm-mats"); boxM.innerHTML = "";
  const recentes = matieresRecentes().map(id=>SUBJECTS.find(x=>x.id === id)).filter(Boolean);
  if(mats.length || recentes.length){
    const ctl = hmControles();
    const parSem = mats.slice().sort((a,b)=>{ const x = ctl[a.id], y = ctl[b.id]; if(x && y) return x.start - y.start; if(x) return -1; if(y) return 1; return 0; });
    const tri = [...new Set([...recentes, ...parSem])];
    const sem = hmSemCourant();
    const secM = el("div","hm-sec"); secM.innerHTML = `<h3>${recentes.length ? "Ouvertes récemment" : "Mes matières"}</h3><button type="button">${esc(titreSemestre(sem))}</button>`;
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
  teinterEcran(document.getElementById("screen-controle"), sj ? HM_HEX[hmCouleur(sj)] : null);
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
  y:"linear-gradient(160deg,#b85f00,#dc8a12 50%,#f0ad3c)", r:"linear-gradient(160deg,#d12a6b,#ff4d8d 50%,#ff8ab4)",
  c:"linear-gradient(160deg,#08857e,#12a9a0 50%,#5fd3cb)", o:"linear-gradient(160deg,#d24a1c,#f26b3a 50%,#ff9e74)", t:"linear-gradient(160deg,#7d4f27,#a8703f 50%,#cf9d6c)",
  i:"linear-gradient(160deg,#3a38a8,#5b5bd6 50%,#8f8ff0)", l:"linear-gradient(160deg,#3f6a05,#5a920c 50%,#86bf2a)", f:"linear-gradient(160deg,#8e2299,#c03fd0 50%,#de7fe9)", s:"linear-gradient(160deg,#0677a8,#0ea5e9 50%,#5cc8f5)",
  p:"linear-gradient(160deg,#c2347f,#f472b6 50%,#f9a8d4)", e:"linear-gradient(160deg,#a8232a,#e5484d 50%,#f08a8d)", n:"linear-gradient(160deg,#0890a8,#22d3ee 50%,#7ae6f6)" };
// les matières ouvertes en dernier (sur ce téléphone), pour l'accueil
const RECENTES_KEY = "revision_recentes_v1";
// gardées dans le compte (tous les appareils), avec une copie sur le téléphone
function matieresRecentes(){
  if(Array.isArray(USER_SETTINGS.recentes)) return USER_SETTINGS.recentes;
  try{ const a = JSON.parse(localStorage.getItem(RECENTES_KEY) || "[]"); return Array.isArray(a) ? a : []; }catch(e){ return []; }
}
function noterMatiereOuverte(id){
  if(!id) return;
  const l = [id, ...matieresRecentes().filter(x=>x !== id)].slice(0, 12);
  if(String(l) === String(matieresRecentes())) return;
  USER_SETTINGS.recentes = l; saveContent();
  try{ localStorage.setItem(RECENTES_KEY, JSON.stringify(l)); }catch(e){}
}
function ouvrirMatiere(id, onglet, depuis){
  const m = SUBJECTS.find(x=>x.id === id); if(!m) return;
  noterMatiereOuverte(id);
  teinterEcran(document.getElementById("screen-matiere"), HM_HEX[hmCouleur(m)]);   // boutons et repères à la couleur de la matière
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
      <div class="mt-top"><button type="button" class="mt-big" id="mt-big" aria-label="Changer l'icône">${iconeMatiere(m)}</button><div><h1>${esc(m.title)}</h1><p>${esc(sous)}</p></div></div>
    </div>
    <div class="mt-body">
      <div class="hm-card mt-kpi"><div><b>${ch.lus}/${ch.tot}</b><span>chapitres lus</span></div><div><b>${q.tot ? Math.round(q.ok / q.tot * 100) + " %" : "–"}</b><span>QCM validés</span></div><div><b>${ctl ? (jc <= 0 ? "Auj." : "J-" + jc) : (q.err || 0)}</b><span>${ctl ? "contrôle" : "erreurs"}</span></div></div>
      <div id="mt-ctl"></div>
      <div id="mt-reprise"></div>
      <div class="mt-seg" id="mt-seg"><button type="button" data-o="cm">CM${(m.cm||[]).length ? " · " + m.cm.length : ""}</button><button type="button" data-o="td">TD${(m.td||[]).length ? " · " + m.td.length : ""}</button><button type="button" data-o="ent">S'entraîner</button></div>
      <div id="mt-liste"></div>
    </div>
    <div class="mt-sticky"><button type="button" class="hm-cta hm-press" id="mt-go">${ctl ? "Réviser pour " + quandCtl : "Réviser cette matière"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div>`;
  document.getElementById("mt-big").addEventListener("click",()=>{ haptic(); changerIconeMatiere(m, ()=>{ SANS_ENTREE = true; ouvrirMatiere(m.id, MT_ONGLET); }); });
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
      MT_ONGLET = b.dataset.o; renderMatiere();
    });
  });
  const liste = document.getElementById("mt-liste");
  // S'entraîner : les exercices dans la page, comme les CM et les TD
  if(MT_ONGLET === "ent"){ liste.innerHTML = ""; curSubj = m; renderTrainPane(liste); return; }
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
  // une couleur choisie dans « Personnaliser » passe devant celle de l'app
  tuiles.forEach(t=>{ t.tcDefaut = t.el.style.getPropertyValue("--tc"); const d = tuileDe(t.cle); if(d.couleur && HM_HEX[d.couleur]) t.el.style.setProperty("--tc", HM_HEX[d.couleur]); });
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
  // l'ordre de la page : les semestres, puis les archives, puis les projets tout en bas
  const placerGroupe = g=>{
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
  };
  groupes.filter(g=>g.cle !== "\u0000psy").forEach(placerGroupe);
  if(archives.length) ajouterArchives(wrap, archives, t=>placerTuile(t, si++));
  groupes.filter(g=>g.cle === "\u0000psy").forEach(placerGroupe);
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
  ["edt",     "Emploi du temps",      "Un cours annulé, déplacé, une salle changée",    true],
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
  chargerNotifs().then(()=>{ majPastilleNotifs(); const ici = document.documentElement.getAttribute("data-screen"); if(ici === "notifs") renderNotifs(); if(ici === "edt") renderEDT(); });
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
  if(plie){ wrap.appendChild(h); return; }
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
  // la tuile s'ouvre vers le haut : les années archivées d'abord, puis le titre et la tuile, tout en bas
  if(ouvert) annees();
  wrap.appendChild(h);
  wrap.appendChild(tu);
  function annees(){
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
}
// ── Personnaliser les tuiles de l'accueil : titre, sous-titre, icône, ordre ──
// Enregistré dans les réglages du compte : suit sur tous les appareils.
function tuileDe(cle){
  const t = USER_SETTINGS.tuiles && USER_SETTINGS.tuiles[cle];
  const d = (typeof TUILES_DEFAUT === "object" && TUILES_DEFAUT[cle]) || {};
  const r = Object.assign({}, d, (t && typeof t === "object") ? t : {});
  // les anciens emojis par défaut des semestres laissent la place à la plante qui grandit
  // (un emoji qui a son dessin : 📚, 🌍, 🧩… ; un emoji sans équivalent, choisi exprès, reste affiché)
  if(cle.startsWith("sem:") && r.icone && typeof cleIcone === "function" && cleIcone(r.icone) && !(UI_IC[r.icone] || MAT_IC[r.icone])) delete r.icone;
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
    { key:"couleur", label:"Couleur", type:"couleur", value:cur.couleur && HM_HEX[cur.couleur] ? cur.couleur : "", defaut:t.tcDefaut || (t.el && t.el.style.getPropertyValue("--tc")) || "var(--accent)" },
    { key:"icone", label:"Icône", type:"icone", value:(cur.icone && (UI_IC[cur.icone] || MAT_IC[cur.icone])) ? cur.icone : "", defaut:cleIcone(t.icone) || "projet" },
  ], "Enregistrer", v=>{
    USER_SETTINGS.tuiles = Object.assign({}, USER_SETTINGS.tuiles);
    // l'icône choisie dans la grille ; « Auto » (vide) garde celle de l'app
    const n = { titre:v.titre, sous:v.sous, icone:v.icone || "", couleur:v.couleur || "" };
    if(!n.titre && !n.sous && !n.icone && !n.couleur) delete USER_SETTINGS.tuiles[t.cle];
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

// la page d'un semestre prend la couleur de sa tuile (la plante qui pousse, ou celle choisie) :
// l'en-tête et les petits éléments de la page suivent
// teinter un écran à une couleur : son en-tête et ses petits éléments (anneaux, badges) la prennent ; null = la couleur de l'app
function teinterEcran(scr, c){
  if(!scr) return;
  // une couleur claire sous un texte blanc : on l'assombrit un peu pour que le titre reste lisible
  const claire = c && ["#d8a010","#8db31c","#c8742e","#e09a00","var(--c-y)","#65a30d","#22d3ee","#f472b6","#0ea5e9","#14b87e","#12a9a0"].includes(c);
  if(claire) c = `color-mix(in srgb,${c} 80%,#000)`;
  // la 2e teinte (bas des dégradés, encadré « En 1 minute ») : pour une couleur claire, on ne l'éclaircit presque pas, sinon le texte blanc ne se lit plus
  const props = { "--accent":c, "--accent-2":c && (claire ? `color-mix(in srgb,${c} 88%,#fff)` : `color-mix(in srgb,${c} 62%,#fff)`), "--accent-soft":c && `color-mix(in srgb,${c} 14%,transparent)`,
    "--accent-glow":c && `color-mix(in srgb,${c} 32%,transparent)` };
  Object.entries(props).forEach(([k,v])=>v ? scr.style.setProperty(k, v) : scr.style.removeProperty(k));
  scr._teinte = props;
  if(scr.classList.contains("active") || document.documentElement.getAttribute("data-screen") === scr.id.replace(/^screen-/, "")) teinteGlobale(props);
}
// ce qui flotte au-dessus des pages (barre de lecture, languette du sommaire, feuilles, explications) suit la page ouverte
function teinteGlobale(props){
  const b = document.body;
  ["--accent","--accent-2","--accent-soft","--accent-glow"].forEach(k=>{ const v = props && props[k]; v ? b.style.setProperty(k, v) : b.style.removeProperty(k); });
}
function couleurPageSemestre(sem){
  const d = sem ? tuileDe("sem:" + sem) : {};
  teinterEcran(document.getElementById("screen-subjects"), sem ? ((d.couleur && HM_HEX[d.couleur]) || couleurSemestre(sem)) : null);
}
// les pages d'une matière (chapitre, QCM, auteurs, lexique, examen, série) restent à sa couleur
const ECRANS_MATIERE = ["split","qcmchoix","auteurs","lexique","devoirs","synthese","session"];
function couleurPagesMatiere(id){
  if(!ECRANS_MATIERE.includes(id)) return;
  const m = (id === "session" && typeof globalSession !== "undefined" && globalSession) ? null : curSubj;
  teinterEcran(document.getElementById("screen-" + id), m ? HM_HEX[hmCouleur(m)] : null);
}
// les pages d'un projet : la couleur de sa tuile dans Cours (ou celle choisie)
function couleurProjet(cle, defaut){
  const d = tuileDe(cle);
  teinterEcran(document.getElementById("screen-psycho"), (d.couleur && HM_HEX[d.couleur]) || defaut);
}
function renderSubjectCards(sem){
  resolveAllLangs();
  couleurPageSemestre(sem);
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
