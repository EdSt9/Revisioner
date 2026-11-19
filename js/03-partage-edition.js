// ── Partager un chapitre, éditer, coller un cours
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
  if(zone !== w) zone.appendChild(b); else if(premier) premier.before(b); else w.appendChild(b);
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
const PROFONDEUR = { login:0, pick:0, welcome:0, semestres:0, semchoice:1, notifs:1, edt:1, classes:1, search:1, mesdevoirs:1, sites:1, index:2, planning:1, psycho:1,
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
  // en quittant la page Notifications, ce qu'on y a vu passe en « lu »
  if(id !== "notifs" && document.documentElement.getAttribute("data-screen") === "notifs" && NOTIFS_VUES.length){
    const vues = NOTIFS_VUES; NOTIFS_VUES = [];
    try{ marquerNotifs(vues, true); }catch(e){}
  }
  try{ couleurPagesMatiere(id); const sc = document.getElementById("screen-" + id); teinteGlobale(sc && sc._teinte); }catch(e){}
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
// (le thème enregistré est appliqué à la fin de 08-series-examen.js : il a besoin de resolveAllLangs, défini dans 07)

// ── PROGRESS HELPERS ──
function getSubjectProgress(s){
  const modes=["fc","qcm","oq"];
  let totalQ=0, totalDone=0;
  modes.forEach(m=>{ const arr=s[m]||[]; totalQ+=arr.length; const st=stats[s.id+"_"+m]; if(st) totalDone+=st.score; });
  const started=modes.some(m=>stats[s.id+"_"+m]);
  const allDone=modes.every(m=>{ const st=stats[s.id+"_"+m]; const arr=s[m]||[]; if(!arr.length) return true; return st && st.score/st.total>=0.7; });
  return { pct: totalQ>0?Math.round(totalDone/totalQ*100):0, started, allDone };
}
