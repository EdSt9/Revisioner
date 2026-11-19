// Parcours automatique de l'app : ouvre chaque écran principal et vérifie
// qu'il s'affiche sans erreur. Aucun appel réseau : le serveur est simulé.
//   node tests/parcours.js            (Playwright doit être installé)
// Sort avec le code 1 si un écran casse ; la liste des problèmes est affichée.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const RACINE = path.join(__dirname, "..");
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".webp":"image/webp", ".json":"application/json", ".webmanifest":"application/manifest+json", ".pdf":"application/pdf" };

// un petit serveur pour les fichiers de l'app
const serveur = http.createServer((req, res)=>{
  const p = path.join(RACINE, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if(!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});

// des données de démonstration : un emploi du temps, des devoirs, une classe
const PREP = `
  if(!SUBJECTS.length && typeof DATA_SUBJECTS !== "undefined") SUBJECTS.push(...DATA_SUBJECTS);
  window.loadEDT = async()=>{ edtState = "ok"; };
  const L = mondayOf(new Date());
  const mk = (j,h,t,loc)=>{ const a = new Date(L); a.setDate(a.getDate()+j); a.setHours(h,30,0,0); const z = new Date(a); z.setHours(h+2,30); return { title:t, start:a, end:z, place:loc, uid:t+j }; };
  EDT.length = 0;
  EDT.push(mk(0,10,"Anglais C","PYR 303"), mk(1,10,"Sociologie de l'éducation CM","Amphi 101"), mk(4,13,"Prévention des conduites à risques TD","PYR 12"));
  edtState = "ok";
  EDTNOTES[evKey(EDT[2])] = { type:"controle", note:"DST", subj:"e232" };
  NOTIFS_SERVEUR = [
    { id:1, famille:"devoirs", title:"L3 ISEJ", body:"Contrôle le 20/11 en Prévention", lu:false, created_at:new Date().toISOString(), data:{} },
    { id:2, famille:"edt", title:"Sociologie de l'éducation", body:"Annulé : jeudi, 13h30 (PYR 1).", lu:false, created_at:new Date().toISOString(), data:{ type:"edt", date:EDT[1].start.toISOString() } }
  ];
  window.api = async(a)=>a === "class_list" ? { classes:[{ id:"1", name:"L3 ISEJ", role:"owner", code:"ABC123" }] }
    : a === "class_items" ? { items:[{ id:"i1", class_id:"1", author:"nana", kind:"cm", subject_title:"Culture numérique", label:"CM 1" }] }
    : a === "class_members" ? { membres:[{ pseudo:"civa", role:"owner" }, { pseudo:"nana", role:"membre" }], monRole:"owner" }
    : a === "notif_list" ? { items:NOTIFS_SERVEUR } : { ok:true, items:[] };
  window.__ev = EDT[2];
  renderSemestres(); showScreen("semestres");`;
const FERMER = "document.querySelectorAll('.sheet-overlay.open,#ev-overlay.open,#memo-overlay.open,#pick-sheet.open,#form-sheet.open').forEach(x=>x.classList.remove('open'));";

// [nom, ce qu'on fait, l'écran attendu (null : une feuille par-dessus)]
const ETAPES = [
  ["accueil", PREP, "semestres"],
  ["devoirs", FERMER + "document.querySelector('.tb[data-tb=mesdevoirs]').click()", "mesdevoirs"],
  ["cours", FERMER + "document.querySelector('.tb[data-tb=semchoice]').click()", "semchoice"],
  ["agenda", FERMER + "document.querySelector('.tb[data-tb=edt]').click(); renderEDT()", "edt"],
  ["fiche d'un cours", "openEvSheet(__ev)", null],
  ["matières du semestre", FERMER + "renderSubjectCards(5); showScreen('subjects')", "subjects"],
  ["chapitre", "openSubject('e192'); setTab(0)", "split"],
  ["s'entraîner", "setTab(2)", "split"],
  ["choix des QCM", "curSubj = SUBJECTS.find(s=>s.id === 'e192'); renderChoix('qcm')", "qcmchoix"],
  ["série de QCM", "choisirScope('grand'); startSession('qcm')", "session"],
  ["répondre", "doQCM(0, queue[idx].item)", "session"],
  ["fiches", "choisirScope('grand'); startSession('fc')", "session"],
  ["lexique", "curSubj = SUBJECTS.find(s=>s.id === 'e192'); ouvrirLexique()", "lexique"],
  ["recherche", "openSearch()", null],
  ["classes", FERMER + "openClasses()", "classes"],
  ["une classe", "openClass(MY_CLASSES[0] || { id:'1', name:'L3 ISEJ', role:'owner' })", "class"],
  ["notifications", FERMER + "openNotifs()", "notifs"],
  ["mon compte", FERMER + "renderSemestres(); showScreen('semestres'); document.getElementById('btn-compte').click()", null],
  ["retour à l'accueil", FERMER + "renderSemestres(); showScreen('semestres')", "semestres"],
];

(async()=>{
  await new Promise(r=>serveur.listen(0, r));
  const port = serveur.address().port;
  const navigateur = await chromium.launch();
  const problemes = [];
  // deux thèmes, clair et sombre
  for(const [theme, mode] of [["purple","dark"], ["girly","light"]]){
    const page = await navigateur.newPage({ viewport:{ width:390, height:844 }, colorScheme:mode });
    const ici = `[${theme}, ${mode}]`;
    page.on("pageerror", e=>problemes.push(`${ici} erreur JS : ${e.message.split("\n")[0]}`));
    // rien ne sort : ni Supabase, ni l'emploi du temps, ni les polices
    await page.route(u=>!u.href.startsWith(`http://localhost:${port}/`), r=>r.abort());
    await page.addInitScript(t=>{
      localStorage.setItem("revision_theme_v1", t);
      localStorage.setItem("revision_pseudo_v1", "civa");
      localStorage.setItem("revision_code_v1", "1234");
      sessionStorage.setItem("revision_demarrage", "1");
    }, theme);
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(2500);
    for(const [nom, code, ecran] of ETAPES){
      try{ await page.evaluate(code); }
      catch(e){ problemes.push(`${ici} « ${nom} » : ${e.message.split("\n")[0].slice(0, 160)}`); continue; }
      await page.waitForTimeout(500);
      const vu = await page.evaluate(()=>document.documentElement.getAttribute("data-screen"));
      if(ecran && vu !== ecran) problemes.push(`${ici} « ${nom} » : l'écran « ${vu} » s'affiche au lieu de « ${ecran} »`);
      // un écran vide est aussi un problème
      const vide = await page.evaluate(()=>{ const s = document.querySelector(".screen.active"); return !s || s.innerText.trim().length < 5; });
      if(ecran && vide) problemes.push(`${ici} « ${nom} » : l'écran est vide`);
    }
    await page.close();
  }
  await navigateur.close();
  serveur.close();
  if(problemes.length){
    console.log(`✗ ${problemes.length} problème(s) :\n` + problemes.map(p=>"  - " + p).join("\n"));
    process.exit(1);
  }
  console.log(`✓ ${ETAPES.length} écrans parcourus dans 2 thèmes, sans erreur.`);
})().catch(e=>{ console.error(e); process.exit(1); });
