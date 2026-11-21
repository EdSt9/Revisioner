// ── Projets (Psycho, CPE…), compte, connexion et démarrage de l'app
// Révisioner est découpé en plusieurs fichiers, chargés dans l'ordre par index.html (01 → 09).
// Ils partagent les mêmes variables : l'ordre compte.
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
  couleurProjet("psy", TUILE_COUL.r);
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
  couleurProjet("projet:" + pid, TUILE_COUL[pid === "cpe" ? "y" : "v"]);
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
  ], v=>setTimeout(()=>{ if(v === "devoir") nouvelleEcheance({ depuisEdt:true }); else editCoursPlanning(null, { depuisEdt:true }); }, 320));
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
  const pp = document.getElementById("pomo-pill");
  pp.addEventListener("click",()=>{ if(pp._glisse) return; haptic(); pomoOuvrir(); });
  rendreDeplacable(pp, "pomodoro", "gauche");
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
document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ refreshPartage(); chargerNotifs().then(()=>{ majPastilleNotifs(); if(document.documentElement.getAttribute("data-screen") === "notifs") renderNotifs(); }); } });
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
document.getElementById("btn-qcmchoix-back").addEventListener("click",()=>{ haptic(); retourEntrainement(); });
document.getElementById("btn-auteurs-back").addEventListener("click",()=>{ retourEntrainement(); });
document.getElementById("btn-dev-back").addEventListener("click",()=>{ retourEntrainement(); });
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
document.getElementById("btn-notifs").addEventListener("click",()=>{ haptic(); openNotifs(); });
document.getElementById("btn-notifs-back").addEventListener("click",()=>{ haptic(); renderSemestres(); showScreen("semestres"); });
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
  if(!r.ok) throw Object.assign(new Error(out.error||("http "+r.status)), { code: out.error, attente: out.attente, restants: out.restants });
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
      srs: Object.assign({}, SRS, { __matieres: nomsMatieres(), __bilan: bilanMatieres(), __projets: projetsPourServeur(), __edtnotes: EDTNOTES, __memo: MEMO, __devrep: DEVREP, __edturls: edtCalendars().map(c=>c.url).filter(Boolean), __revises: REVISES, __vus: vusCharger(), __clsvus: clsVus(), __profs: PROFS, __notes: CHNOTES, __errexam: ERREXAM, __jours: joursCharger() }),
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
    delete incoming.__matieres; delete incoming.__bilan; delete incoming.__projets; delete incoming.__edtnotes; delete incoming.__memo; delete incoming.__devrep; delete incoming.__edturls; delete incoming.__revises; delete incoming.__vus; delete incoming.__profs; delete incoming.__notes; delete incoming.__errexam;
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
      msg.textContent = "Ce pseudo est déjà pris, et le code ne correspond pas." + (e.restants ? " Encore " + e.restants + " essai" + (e.restants > 1 ? "s" : "") + " avant un blocage de 15 minutes." : "");
    }else if(e.code === "bloque"){
      msg.textContent = "Trop de codes faux : ce compte est bloqué " + (e.attente || 15) + " minute" + ((e.attente || 15) > 1 ? "s" : "") + ", par sécurité.";
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
    if(e.target && e.target.closest && e.target.closest("#somm-flot, .sheet-overlay.open, .img-voile, input, textarea")) return;
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
const PAGES_GARDEES = ["notifs","semestres","semchoice","subjects","split","edt","planning","classes","class","shared",
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
      case "notifs": renderSemestres(); showScreen("semestres"); openNotifs(); break;
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

// ── iPhone : après la fermeture du clavier, Safari laisse parfois la barre du bas
// à mi-hauteur (là où était le clavier), jusqu'au prochain défilement. On la remet en place.
(function(){
  const recaler = ()=>{
    const tb = document.getElementById("tabbar"); if(!tb) return;
    window.scrollTo(window.scrollX, window.scrollY);          // Safari recalcule la zone visible
    tb.style.transform = "translateZ(0)"; void tb.offsetHeight; tb.style.transform = "";
  };
  document.addEventListener("focusout", e=>{
    if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) [60, 300, 700].forEach(ms=>setTimeout(recaler, ms));
  });
  if(window.visualViewport){
    let h = visualViewport.height;
    visualViewport.addEventListener("resize", ()=>{ if(visualViewport.height > h + 80) setTimeout(recaler, 50); h = visualViewport.height; });
  }
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) setTimeout(recaler, 120); });
})();
