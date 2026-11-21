// ── Semestres, recherche, index des auteurs, lexique, notes, taille du texte
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
  zone.dataset.lecCle = "pdf|" + (doc.src || doc.nom || "");
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
  zoomerImage(v.querySelector(".img-zoom"));
}
// Zoom à deux doigts, déplacement à un doigt, double appui pour zoomer ou revenir.
// Le zoom du navigateur est coupé pour toute l'app (viewport), donc on le refait ici.
function zoomerImage(boite){
  const img = boite.querySelector("img");
  let s = 1, tx = 0, ty = 0, geste = null, dernierAppui = 0, dernierToucher = 0;
  const pt = t=>{ const r = boite.getBoundingClientRect(); return { x:t.clientX - r.left, y:t.clientY - r.top }; };
  const borne = ()=>{
    const W = img.offsetWidth * s, H = img.offsetHeight * s, CW = boite.clientWidth, CH = boite.clientHeight;
    const bx = img.offsetLeft, by = img.offsetTop;
    tx = W <= CW ? CW/2 - bx - W/2 : Math.min(-bx, Math.max(CW - bx - W, tx));
    ty = H <= CH ? CH/2 - by - H/2 : Math.min(-by, Math.max(CH - by - H, ty));
  };
  const appliquer = anim=>{
    if(s <= 1.01){ s = 1; tx = 0; ty = 0; } else borne();
    img.style.transition = anim ? "transform .25s ease" : "none";
    img.style.transform = s === 1 ? "" : `translate(${tx}px,${ty}px) scale(${s})`;
    boite.classList.toggle("zoome", s > 1);
  };
  // le point de l'image (non zoomée) sous un point de l'écran
  const sous = p=>({ x:(p.x - img.offsetLeft - tx) / s, y:(p.y - img.offsetTop - ty) / s });
  boite.addEventListener("touchstart", e=>{
    dernierToucher = Date.now();
    if(e.touches.length === 2){
      const a = pt(e.touches[0]), b = pt(e.touches[1]);
      const m = { x:(a.x + b.x)/2, y:(a.y + b.y)/2 };
      geste = { type:"pince", d:Math.hypot(a.x - b.x, a.y - b.y), s0:s, u:sous(m) };
    } else if(e.touches.length === 1){
      const p = pt(e.touches[0]);
      geste = { type:"glisse", x:p.x, y:p.y, tx0:tx, ty0:ty };
    }
  }, { passive:true });
  boite.addEventListener("touchmove", e=>{
    if(!geste) return;
    if(geste.type === "pince" && e.touches.length === 2){
      e.preventDefault();
      const a = pt(e.touches[0]), b = pt(e.touches[1]);
      const m = { x:(a.x + b.x)/2, y:(a.y + b.y)/2 };
      s = Math.min(5, Math.max(1, geste.s0 * Math.hypot(a.x - b.x, a.y - b.y) / geste.d));
      tx = m.x - img.offsetLeft - s * geste.u.x; ty = m.y - img.offsetTop - s * geste.u.y;
      appliquer(false);
    } else if(geste.type === "glisse" && e.touches.length === 1 && s > 1){
      e.preventDefault();
      const p = pt(e.touches[0]);
      tx = geste.tx0 + p.x - geste.x; ty = geste.ty0 + p.y - geste.y;
      appliquer(false);
    }
  }, { passive:false });
  boite.addEventListener("touchend", e=>{
    if(e.touches.length === 1){ const p = pt(e.touches[0]); geste = { type:"glisse", x:p.x, y:p.y, tx0:tx, ty0:ty }; return; }
    if(e.touches.length) return;
    const g = geste; geste = null;
    if(g && g.type === "glisse" && e.changedTouches.length){
      const p = pt(e.changedTouches[0]);
      if(Math.hypot(p.x - g.x, p.y - g.y) < 10){
        const t = Date.now();
        if(t - dernierAppui < 300){
          dernierAppui = 0;
          if(s > 1){ s = 1; } else { const u = sous(p); s = 2.5; tx = p.x - img.offsetLeft - s * u.x; ty = p.y - img.offsetTop - s * u.y; }
          appliquer(true);
        } else dernierAppui = t;
      }
    }
  });
  // à la souris : double clic
  img.addEventListener("dblclick", e=>{
    if(Date.now() - dernierToucher < 1000) return;   // déjà traité au doigt
    const p = pt(e);
    if(s > 1) s = 1; else { const u = sous(p); s = 2.5; tx = p.x - img.offsetLeft - s * u.x; ty = p.y - img.offsetTop - s * u.y; }
    appliquer(true);
  });
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
