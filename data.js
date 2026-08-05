// ══════════════════════════════════════════════════
// data.js — DONNÉES DES MATIÈRES & DU PROJET PSYCHO
// ══════════════════════════════════════════════════
// Ce fichier contient tout le contenu éditable : UE, matières
// (cours, TD, flashcards, QCM, questions ouvertes, auteurs) et
// le Projet Psycho. Il est chargé par index.html AVANT le script
// principal, donc toutes ces constantes y sont accessibles.
//
// Pour ajouter/modifier un cours : édite ce fichier uniquement.
// ══════════════════════════════════════════════════

const UES = {
  UE19:{num:"19", sem:5, title:"Saisir la diversité et la complexité de pratiques éducatives et de formation"},
  UE20:{num:"20", sem:5, title:"Analyser, construire et contextualiser son intervention"},
  UE21:{num:"21", sem:5, title:"Se repérer et évoluer dans des environnements institutionnels et professionnels"},
  UE22:{num:"22", sem:5, title:"Concevoir, mettre en place et évaluer un projet éducatif et/ou des actions sociales"},
  UE23:{num:"23", sem:5, title:"Connaître des publics spécifiques et de leurs environnements"},
  UE24:{num:"24", sem:6, title:"Saisir la diversité et la complexité de pratiques éducatives et de formation"},
  UE25:{num:"25", sem:6, title:"Analyser, construire et contextualiser son intervention"},
  UE26:{num:"26", sem:6, title:"Se repérer et évoluer dans des environnements institutionnels et professionnels"},
  UE27:{num:"27", sem:6, title:"Concevoir, mettre en place et évaluer un projet éducatif et/ou des actions sociales"},
  UE28:{num:"28", sem:6, title:"Connaître des publics spécifiques et de leurs environnements"},
};

const SUBJECTS = [
  { id:"e191", ue:"UE19", ects:4, ecue:"19.1", title:"Formation tout au long de la vie", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e192", ue:"UE19", ects:4, ecue:"19.2", title:"Sociologie de l'éducation", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e193", ue:"UE19", ects:2, ecue:"19.3", title:"Introduction à la démarche de recherche 2", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e201", ue:"UE20", ects:3, ecue:"20.1", title:"Culture numérique", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e202", ue:"UE20", ects:2, ecue:"20.2", title:"Langue vivante", bilingue:true,
    byLang:{
      en:{
        cm:[
          { label:"Chapter 1", sections:[
            { title:"Present tenses", body:"The <span class='chunk-highlight'>present simple</span> describes habits and general truths. The <span class='chunk-highlight'>present continuous</span> (be + -ing) describes actions happening now.", list:["Simple: I <b>work</b> every day.","Continuous: I <b>am working</b> right now.","Signal words: usually, always, at the moment."] },
            { title:"Question forms", body:"Questions in the present simple use the auxiliary <span class='chunk-highlight'>do / does</span>. The main verb goes back to its base form.", list:["Do you like tea?","Does she live here?","Never: <i>Does she lives?</i>"] }
          ], recap:["Present simple = habits.","Present continuous = now.","Questions use do/does + base verb."] },
          { label:"Chapter 2", sections:[
            { title:"The past simple", body:"The <span class='chunk-highlight'>past simple</span> describes finished actions at a specific past time. Regular verbs take <b>-ed</b>; irregular verbs change form.", list:["Regular: work → worked","Irregular: go → went, see → saw","Markers: yesterday, last week, in 2020."] }
          ], recap:["Past simple = finished past action.","Regular verbs: -ed.","Learn irregular verbs by heart."] }
        ],
        td:[
          { label:"TD 1", sections:[ { title:"Present simple vs continuous", body:"Choose the right tense. Look at the <span class='chunk-highlight'>signal words</span>.", list:["She ___ (watch) TV every evening.","Listen! The baby ___ (cry).","Water ___ (boil) at 100°C."] } ], recap:["Habits → simple.","Actions now → continuous."] },
          { label:"TD 2", sections:[ { title:"Irregular verbs", body:"Give the <span class='chunk-highlight'>past simple</span> of these irregular verbs.", list:["go → ___","buy → ___","think → ___"] } ], recap:["No -ed for irregular verbs.","Memorise the three columns."] },
          { label:"TD 3", sections:[ { title:"Speaking: your week", body:"Use a mix of tenses to talk about your routine and last weekend. Focus on <span class='chunk-highlight'>fluency</span>.", list:["Every day I…","Right now I…","Last weekend I…"] } ], recap:["Mix tenses naturally.","Fluency first."] }
        ],
        fc:[
          { q:"How do you form the present continuous?", a:"be (am/is/are) + verb-ing. Example: She is reading." },
          { q:"When do we use the present simple?", a:"For habits, routines and general truths. Example: I work every day." },
          { q:"Past simple of 'to go'?", a:"went (irregular verb)." },
          { q:"Which auxiliary for present simple questions?", a:"do / does, followed by the base form of the verb." },
          { q:"Past simple of 'to buy'?", a:"bought (irregular)." }
        ],
        qcm:[
          { q:"Choose the correct sentence.", opts:["She work here.","She works here.","She working here.","She is work here."], c:1, e:"Third person singular takes -s: she works." },
          { q:"'Listen! Someone ___ at the door.'", opts:["knocks","is knocking","knock","knocked"], c:1, e:"Action happening now → present continuous." },
          { q:"Past simple of 'see'?", opts:["seed","saw","seen","sawed"], c:1, e:"Irregular: see → saw → seen." }
        ],
        oq:[
          { q:"Explain the difference between present simple and present continuous, with an example each.", a:"Present simple = habits and general truths (I drink coffee every morning). Present continuous = actions happening now (I am drinking coffee right now)." },
          { q:"Why are irregular verbs difficult, and how can you memorise them?", a:"They don't follow the -ed rule, so each must be learned. Learn them in three columns (base/past/participle) and practise in context." }
        ],
        auteurs:[
          { nom:"Michael Swan", courant:"English grammar reference", periode:"XXe–XXIe", these:"Author of 'Practical English Usage', a key reference for learners and teachers.", concepts:["Usage","Common mistakes","Learner English"], retenir:"The go-to reference when a grammar rule is unclear." }
        ]
      },
      es:{
        cm:[
          { label:"Capítulo 1", sections:[
            { title:"El presente", body:"El <span class='chunk-highlight'>presente de indicativo</span> expresa hábitos y verdades generales. Los verbos regulares se agrupan en <span class='chunk-highlight'>-ar, -er, -ir</span>.", list:["hablar: yo hablo, tú hablas…","comer: yo como, tú comes…","vivir: yo vivo, tú vives…"] },
            { title:"Ser y estar", body:"Dos verbos para « être » : <span class='chunk-highlight'>ser</span> (identidad, características) y <span class='chunk-highlight'>estar</span> (estado, lugar).", list:["Soy estudiante. (ser)","Estoy cansada. (estar)","Madrid está en España. (estar)"] }
          ], recap:["Presente = hábitos.","Ser = identidad.","Estar = estado y lugar."] },
          { label:"Capítulo 2", sections:[
            { title:"El pretérito indefinido", body:"El <span class='chunk-highlight'>pretérito indefinido</span> expresa acciones terminadas en el pasado. Cuidado con los verbos <b>irregulares</b>.", list:["hablar → hablé, hablaste…","ir → fui, fuiste… (irregular)","tener → tuve, tuviste… (irregular)"] }
          ], recap:["Indefinido = acción terminada.","Muchos irregulares frecuentes.","Aprender de memoria."] }
        ],
        td:[
          { label:"TD 1", sections:[ { title:"Ser o estar", body:"Elige entre <span class='chunk-highlight'>ser</span> y <span class='chunk-highlight'>estar</span> según el contexto.", list:["Ella ___ profesora.","Nosotros ___ en clase.","La sopa ___ caliente."] } ], recap:["Ser = qué/quién.","Estar = cómo/dónde."] },
          { label:"TD 2", sections:[ { title:"Verbos irregulares", body:"Da el <span class='chunk-highlight'>pretérito indefinido</span> de estos verbos.", list:["ir (yo) → ___","tener (tú) → ___","hacer (él) → ___"] } ], recap:["Los irregulares no siguen la regla.","Practicar a menudo."] },
          { label:"TD 3", sections:[ { title:"Expresión: tu semana", body:"Habla de tu rutina y de tu fin de semana usando presente e indefinido. Prioriza la <span class='chunk-highlight'>fluidez</span>.", list:["Todos los días…","Ahora mismo…","El fin de semana pasado…"] } ], recap:["Mezcla los tiempos.","Fluidez antes que perfección."] }
        ],
        fc:[
          { q:"¿Diferencia entre ser y estar?", a:"Ser = identidad y características permanentes. Estar = estado, lugar y situación temporal." },
          { q:"Presente de « yo » del verbo tener", a:"tengo (irregular en la primera persona)." },
          { q:"Pretérito indefinido de « ir » (yo)", a:"fui (irregular, igual que el verbo ser)." },
          { q:"¿Cómo se conjuga « vivir » en presente (yo)?", a:"vivo. Verbo regular en -ir." },
          { q:"Pretérito indefinido de « hacer » (él)", a:"hizo (irregular)." }
        ],
        qcm:[
          { q:"Elige la frase correcta.", opts:["Yo soy en casa.","Yo estoy en casa.","Yo estar en casa.","Yo es en casa."], c:1, e:"El lugar se expresa con estar: estoy en casa." },
          { q:"« Ella ___ médica. »", opts:["está","es","estar","son"], c:1, e:"La profesión (identidad) se expresa con ser: es médica." },
          { q:"Pretérito indefinido de « tener » (yo)", opts:["tené","tuve","tení","tuvé"], c:1, e:"Irregular: tener → tuve." }
        ],
        oq:[
          { q:"Explica la diferencia entre ser y estar con un ejemplo de cada uno.", a:"Ser expresa identidad y características (Soy francesa). Estar expresa estado o lugar (Estoy en París, estoy cansada)." },
          { q:"¿Por qué son difíciles los verbos irregulares y cómo memorizarlos?", a:"No siguen las terminaciones regulares. Conviene aprenderlos en contexto y repasarlos con frecuencia mediante ejercicios." }
        ],
        auteurs:[
          { nom:"Real Academia Española (RAE)", courant:"Norma del español", periode:"desde 1713", these:"Institución que fija la norma del español a través de su gramática y su diccionario.", concepts:["Gramática","Ortografía","Diccionario"], retenir:"La referencia oficial para las dudas de español." }
        ]
      }
    },
    cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e203", ue:"UE20", ects:2, ecue:"20.3", title:"Enquêtes", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e211", ue:"UE21", ects:1, ecue:"21.1", title:"Stage", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e221", ue:"UE22", ects:3, ecue:"22.1", title:"Éducation populaire et animation", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e222", ue:"UE22", ects:3, ecue:"22.2", title:"Insertion sociale et professionnelle des jeunes", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e231", ue:"UE23", ects:3, ecue:"23.1", title:"Droits de l'enfant et de la famille", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e232", ue:"UE23", ects:3, ecue:"23.2", title:"Prévention des conduites à risques", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e241", ue:"UE24", ects:4, ecue:"24.1", title:"Psychologie de l'éducation", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e242", ue:"UE24", ects:4, ecue:"24.2", title:"Controverse en éducation", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e251", ue:"UE25", ects:2, ecue:"25.1", title:"Communication et gestion de groupe", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e252", ue:"UE25", ects:2, ecue:"25.2", title:"Langue vivante", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e261", ue:"UE26", ects:3, ecue:"26.1", title:"Histoire des valeurs républicaines", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e262", ue:"UE26", ects:3, ecue:"26.2", title:"Éthique professionnelle et déontologique", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e271", ue:"UE27", ects:3, ecue:"27.1", title:"Politiques éducatives : partenariats socio-éducatifs", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e272", ue:"UE27", ects:3, ecue:"27.2", title:"Conduite de projet", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e281", ue:"UE28", ects:3, ecue:"28.1", title:"Accompagnement à la parentalité", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e282", ue:"UE28", ects:3, ecue:"28.2", title:"Numérique et action sociale", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
];

const SEMESTRES = {}; SUBJECTS.forEach(s=>{ SEMESTRES[s.id] = UES[s.ue].sem; });
const TIME_ESTIMATES = {}; SUBJECTS.forEach(s=>{ TIME_ESTIMATES[s.id] = ""; });

const PSYCHO_STEPS_KEY = "psycho_steps_v1";

const PSYCHO_STEPS = [
  {id:"s1", title:"Se renseigner sur les universités", desc:"Identifier les facs qui proposent une L2 Psycho en validation d'études (VES). Ex : Caen, Lille, Paris Cité, Toulouse Jean-Jaurès… Lister les établissements proches ou à distance.", date:"Dès maintenant (L2)", done:false},
  {id:"s2", title:"Contacter les scolarités des UFR Psycho", desc:"Envoyer un mail pour demander : est-ce qu'ils acceptent des candidatures en L2 via VES avec une L3 Sci. Édu ? Quelles pièces ? Quelles dates ? Chaque fac fixe ses propres règles.", date:"Dès maintenant (L2)", done:false},
  {id:"s3", title:"Choisir sa voie : VES ou Parcoursup", desc:"Deux options existent.\n• VES (Validation des Études Supérieures) : entrer directement en L2 grâce à la L3 Sci. Édu — c'est la voie idéale, mais les places sont limitées (ex : 78 places à Toulouse).\n• Parcoursup : entrer en L1 de Psycho — accessible mais on repart de zéro.\nObjectif = VES. Parcoursup = plan B si aucune VES acceptée.", date:"Janvier 2027", done:false},
  {id:"s4", title:"Déposer les vœux Parcoursup (si plan B)", desc:"Si la voie VES ne fonctionne pas dans la fac souhaitée, déposer un vœu en L1 Psycho sur Parcoursup en parallèle. Ouverture généralement en janvier. Ne pas mettre tous ses œufs dans le même panier.", date:"Janvier–Février 2027", done:false},
  {id:"s5", title:"Préparer le CV académique", desc:"Lister toutes les formations, stages, expériences en lien avec l'éducation, le soin, le social. Mettre en valeur les passerelles avec la psychologie : observation, relation d'aide, développement de l'enfant…", date:"Février–Mars 2027", done:false},
  {id:"s6", title:"Rédiger la lettre de motivation", desc:"C'est la pièce centrale du dossier VES. Expliquer : pourquoi la psycho, le lien avec la L3, le projet professionnel. Les commissions cherchent un projet cohérent et une vraie motivation — pas juste un changement d'avis.", date:"Mars–Avril 2027", done:false},
  {id:"s7", title:"Constituer le dossier VES complet", desc:"Rassembler : relevés de notes, diplômes, CV, lettre de motivation, descriptifs des UE suivies. Vérifier chaque pièce fac par fac. Tout doit être prêt avec de l'avance.", date:"⚠️ Bouclé fin Avril 2027", done:false},
  {id:"s7b", title:"💌 Lettre de recommandation (optionnel)", desc:"Demander à un professeur de L3 de rédiger une lettre de recommandation en ta faveur.\nCe n'est pas obligatoire partout, mais ça renforce vraiment le dossier.\n→ Choisir un prof qui te connaît bien et peut parler de ta motivation et de tes qualités.\n→ Lui laisser au moins 3 semaines pour rédiger — prévoir cette demande tôt.", date:"Avril 2027 — avant de boucler le dossier", done:false},
  {id:"s8", title:"Déposer les dossiers VES", desc:"Envoyer les dossiers dans toutes les universités ciblées. Les délais officiels sont juin-juillet — en déposant en mai, on est tranquille et on évite le stress. Candidater dans plusieurs facs.", date:"⚠️ Avant fin Mai 2027", done:false},
  {id:"s9", title:"Valider la L3 Sciences de l'Éducation", desc:"Priorité absolue — c'est le diplôme qui justifie la demande VES. Bonne session d'exams 💪", date:"Juin 2027", done:false},
  {id:"s10", title:"Préparer l'entretien (si convoquée)", desc:"Certaines commissions VES convoquent pour un entretien oral. Préparer à expliquer le projet, les acquis, les motivations. C'est souvent là que tout se joue.", date:"Juin–Juillet 2027", done:false},
  {id:"s11", title:"Réponse & inscription", desc:"Accepter la proposition, s'inscrire administrativement, régler les frais de scolarité (~170€ en licence). C'est parti 🎉", date:"Septembre 2027", done:false},
];

const PSYCHO_MOTIV = [
  "Nana, tu as passé 3 ans à comprendre comment les êtres humains apprennent, évoluent, se construisent. C'est exactement ce que la psychologie demande. Tu n'es pas en train de tout recommencer — tu arrives avec une longueur d'avance.",
  "Les doutes que tu ressens, c'est normal. Mais rappelle-toi : les gens qui réussissent ne sont pas ceux qui n'ont jamais peur. Ce sont ceux qui avancent malgré la peur. Et toi, tu avances.",
  "Ton parcours en Sciences de l'Éducation n'est pas un détour — c'est une richesse. Tu arrives en psycho avec une vision que la plupart des étudiants n'auront jamais : celle de l'éducation, du terrain, de l'humain.",
  "Ce projet, c'est pas juste des études. C'est toi qui choisis de devenir la personne que tu veux être. Chaque étape cochée, c'est un pas de plus vers cette version de toi. Continue.",
  "Les commissions qui liront ton dossier verront quelqu'un qui a fait un choix réfléchi, pas un choix par défaut. C'est rare. C'est précieux. C'est toi. 💜",
  "Quand c'est dur, pense à pourquoi tu veux devenir psychologue. Cette image-là — garde-la. Elle vaut tous les efforts du monde.",
];

const PSYCHO_INFOS = [
    {icon:"✍️", title:"Comment rédiger ta lettre de motivation",
     lines:[
       "La lettre de motivation VES, c'est TA parole. C'est elle qui convainc la commission que tu as le bon profil et le bon projet.",
       "",
       "📌 Structure conseillée (1 à 2 pages max) :",
       "1. Accroche — Pourquoi la psychologie ? Commence par une phrase forte, personnelle, qui dit d'où vient cette envie.",
       "2. Ton parcours — Présente ta L3 Sciences de l'Éducation. Montre les liens avec la psychologie : l'enfant, le développement, la relation d'aide, l'observation...",
       "3. Ton expérience terrain — C'est ton atout unique. Décris ce que tu fais, ce que tu as appris sur les humains, sur toi-même.",
       "4. Pourquoi cette université — Montre que tu as fait une vraie démarche. Cite un labo, un master, un axe de recherche qui t'attire.",
       "5. Ton projet professionnel — Vers quelle spécialité tu veux aller ? Être psychologue, pour faire quoi ? Sois concrète.",
       "6. Conclusion — Réaffirme ta motivation. Sois directe et confiante.",
       "",
       "💜 Conseils importants :",
       "→ Écris à la première personne, avec tes mots — pas du jargon.",
       "→ Chaque lettre doit être personnalisée pour chaque université.",
       "→ Fais relire par quelqu'un de confiance avant d'envoyer.",
       "→ Une lettre sincère et bien construite vaut plus qu'une lettre parfaite mais froide."
     ]},
    {icon:"🎯", title:"Bonne nouvelle — pas forcément L1 !",
     lines:["Avec une L3 Sciences de l'Éducation, tu peux candidater directement en L2 de Psychologie.",
       "C'est possible via la VES — Validation des Études Supérieures.",
       "Certaines universités l'acceptent explicitement. Les places sont limitées, donc il faut postuler dans plusieurs."]},
    {icon:"🔀", title:"Deux voies : VES ou Parcoursup",
     lines:["🥇 Voie idéale — la VES : tu déposes un dossier directement auprès de l'UFR Psychologie. Si acceptée, tu entres en L2.",
       "🥈 Plan B — Parcoursup : tu postules en L1 de Psychologie. C'est accessible, mais tu repars de zéro.",
       "💡 Conseil : vise la VES en priorité, et dépose un vœu Parcoursup en parallèle pour ne pas rater l'année."],
     tags:["VES → L2 direct","Parcoursup → L1 plan B"]},
    {icon:"📂", title:"Ce que demande la VES",
     lines:["Un dossier complet avec :",
       "→ Relevés de notes et diplômes",
       "→ CV académique et professionnel",
       "→ Lettre de motivation (c'est la pièce centrale)",
       "→ Descriptif des matières suivies en L3",
       "Ton expérience terrain + ta L3 Sci. Édu = un vrai atout. Mets-les en avant. 💜"]},
    {icon:"📅", title:"Les dates à retenir",
     lines:["Janvier 2027 — Parcoursup ouvre. Déposer les vœux dès l'ouverture.",
       "Février–Avril 2027 — Préparer CV, lettre de motivation et dossier VES.",
       "⚠️ Fin Avril 2027 — Dossier VES bouclé et prêt à envoyer.",
       "⚠️ Avant fin Mai 2027 — Dépôt des dossiers VES. 1 mois d'avance = zéro stress.",
       "Juin–Juillet 2027 — Entretiens VES si convoquée.",
       "Septembre 2027 — Réponses et inscription 🎉"]},
    {icon:"🔄", title:"L'alternance en psychologie — ce qu'il faut savoir",
     lines:["La licence de psychologie en alternance est quasi inexistante en France.",
       "La psychologie est réglementée — les universités posent d'abord les bases théoriques.",
       "⚠️ Piège à éviter : le CNAM propose une licence 'Travail et psychologie' compatible avec un emploi, mais elle ne donne PAS accès aux masters de psychologie.",
       "✅ Ce qui est conseillé : valoriser l'expérience terrain dans la lettre de motivation VES. C'est exactement ce que les commissions adorent voir.",
       "🎯 L'alternance devient possible au niveau master (M1/M2). C'est là que ça devient vraiment pertinent."],
     tags:["Alternance → plutôt au Master","Expérience terrain → valoriser en LM"]},
    {icon:"🏫", title:"Universités à regarder — Île-de-France",
     lines:["→ Paris Cité (Paris 5) — Institut de Psychologie · 620 places · très demandée",
       "→ Paris Nanterre (Paris 10) — référence en psycho IdF · bien cotée",
       "→ Paris 8 Saint-Denis — accessible · aussi en distanciel via l'IED",
       "→ Sorbonne Paris Nord (Paris 13) — profil SHS cohérent",
       "→ UPEC Créteil — reconnue, bien reliée depuis Paris",
       "→ UVSQ Versailles Saint-Quentin — option grande couronne",
       "→ Université d'Évry Paris-Saclay — option accessible en Essonne",
       "→ Université de Cergy (CY Cergy) — option Val-d'Oise",
       "→ IPC Paris (privé) — 14e arr. · 50 places · très sélectif"]},
    {icon:"🗺️", title:"Universités — au cas où (autres villes)",
     lines:["→ Université de Caen Normandie — passerelle Sci. Édu / Psycho documentée",
       "→ Toulouse Jean-Jaurès — VES L2, 78 places disponibles",
       "→ Université de Lille — accessible, grande capacité (1025 places)",
       "→ Université de Reims — moins demandée, bon ratio d'accès",
       "→ Université d'Amiens — accessible, 500 places disponibles"]},
    {icon:"🎓", title:"Le chemin complet vers psychologue",
     lines:["1️⃣ Licence mention Psychologie (L1 à L3) — 3 ans",
       "2️⃣ Master mention Psychologie — 2 ans, avec mémoire + 500h de stage",
       "Ces deux diplômes sont obligatoires pour exercer en France.",
       "Avec la VES, tu peux potentiellement gagner 1 an en entrant directement en L2. 💜"]},
  ];

const PSYCHO_SPES = [
    {icon:"🛋️", nom:"Psychologie clinique", desc:"Accompagner les personnes en souffrance psychique. Thérapies, troubles mentaux, relation d'aide. C'est la voie vers le cabinet libéral ou les structures de soin.", lien:"Lien avec ton parcours : ton expérience de terrain avec des publics vulnérables est un atout direct.", master:"Master Psychologie Clinique et Psychopathologie"},
    {icon:"📖", nom:"Psychologie des apprentissages", desc:"Comprendre comment on apprend — la mémoire, l'attention, la motivation, les stratégies cognitives. Travailler avec des élèves, des étudiants, des adultes en formation.", lien:"Lien avec ton parcours : c'est probablement la spécialité la plus directement connectée à la L3 Sciences de l'Éducation. Tu arrives avec des bases que peu d'étudiants ont.", master:"Master Psychologie des Apprentissages et de la Formation"},
    {icon:"👶", nom:"Psychologie du développement", desc:"Étudier comment l'enfant et l'adolescent se construisent psychologiquement — cognition, émotions, langage, socialisation.", lien:"Lien avec ton parcours : très cohérent avec les Sciences de l'Éducation.", master:"Master Psychologie du Développement"},
    {icon:"💼", nom:"Psychologie du travail", desc:"Accompagner les organisations, prévenir les risques psychosociaux (RPS), gérer les ressources humaines sous l'angle psychologique.", lien:"Lien avec ton parcours : si tu as une expérience professionnelle dans le secteur social ou éducatif, cette spécialité valorise directement ce vécu.", master:"Master Psychologie du Travail et des Organisations"},
    {icon:"🧬", nom:"Neuropsychologie", desc:"L'interface entre le cerveau et le comportement. Évaluation cognitive, troubles neurologiques, rééducation.", lien:"Spécialité plus scientifique — nécessite un bon niveau en neurosciences et statistiques.", master:"Master Neuropsychologie et Neurosciences Cognitives"},
    {icon:"👥", nom:"Psychologie sociale", desc:"Comment le groupe influence l'individu. Comportements collectifs, préjugés, influence sociale, communication.", lien:"Lien avec ton parcours : les Sciences de l'Éducation touchent souvent aux dynamiques de groupe.", master:"Master Psychologie Sociale et Interculturelle"},
  ];
