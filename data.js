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
  { id:"e191", ue:"UE19", ects:4, ecue:"19.1", title:"Formation tout au long de la vie", cm:[],
    td:[
      { label:"TD 1", sections:[
        { title:"Présentation du TD", body:"TD 1 : Introduction. ECUE 19.1, Licence 3 Sciences de l'éducation, semestre 1 (2026/2027). Enseignante : <b>Elyne Rouche</b> (elyne.rouche@u-pec.fr)." },
        { title:"L'ECUE en quelques mots", body:"Cinq points structurent l'ECUE.", list:["<b>7 séances de TD de 2 h.</b>","<b>À partir de textes scientifiques</b> : lecture et discussion d'un corpus de six textes.","<b>Articulation entre CM et TD</b> : le TD travaille et prolonge le cours magistral.","<b>Échanges, activités collectives et débats</b> : une participation active est attendue à chaque séance.","<b>Évaluation</b> : 50 % contrôle terminal (QCM), 40 % contrôle continu écrit, 10 % oral."] },
        { title:"La FTLV : de quoi parle-t-on ?", body:"Une perspective qui <b>dépasse la formation initiale</b>. La FTLV désigne l'ensemble des <span class='chunk-highlight'>activités d'apprentissage qui se poursuivent tout au long de la vie</span> et qui permettent de développer des connaissances, des compétences et des façons d'agir. Ses finalités sont <b>personnelles, sociales, citoyennes ou professionnelles</b>.", list:["<b>Trois dimensions</b> : temporelle, spatiale et sociale.","<b>Où ?</b> À l'école et à l'université, en formation continue, au travail, dans des activités sociales ou associatives, en autonomie.","<b>Trois formes d'apprentissage</b> : formel, non formel, informel."] },
        { title:"Mini-quiz de réactivation de la L2", body:"Six questions posées en séance pour réactiver les acquis de L2. <i>(Correction à compléter depuis tes notes.)</i>", list:["La FTLV est synonyme de formation continue. Vrai / Faux ?","La FTLV relève davantage : d'une trajectoire, d'une certification, d'un programme, d'un cheminement ?","L'apprenance désigne : une méthode, la motivation, des dispositions à apprendre, apprendre seul ?","Une forte apprenance garantit l'engagement en formation. Vrai / Faux ?","La VAE consiste principalement à : entrer en formation, faire reconnaître des acquis de l'expérience, financer une formation, supprimer une certification ?","Une reconversion relève toujours d'un choix individuel. Vrai / Faux ?"] },
        { title:"Activité : comment se former une fois en poste ?", body:"En groupe : choisir un métier, imaginer une personne en poste, puis construire son parcours de formation et d'apprentissage professionnel au cours de sa carrière.", list:["<b>Comment peut-elle apprendre ?</b> Situations et ressources d'apprentissage.","<b>Dans quels dispositifs ?</b>","<b>Avec qui ?</b>","<b>Qui organise ? À qui s'adresser ?</b> Les institutions et acteurs.","<b>Qu'est-ce qui la rend possible ?</b> Organisation, temps, financement, droit."] },
        { title:"Comment apprendre une fois en poste ?", body:"Quatre modalités.", list:["<b>A.</b> Formation organisée.","<b>B.</b> Apprentissage en situation de travail.","<b>C.</b> Apprentissage avec les autres.","<b>D.</b> Apprendre de manière autonome."] },
        { title:"Une grille pour analyser la FTLV", body:"Cinq entrées à mobiliser pour analyser une situation de FTLV.", list:["<b>L'individu</b> : parcours, dispositions, engagement, représentations, identité professionnelle.","<b>Les situations de travail</b> : ce que le professionnel fait réellement (problèmes, expérience, ajustements, réflexivité).","<b>Le collectif</b> : pairs, collègues, équipe, tuteurs, échanges, normes, reconnaissance.","<b>L'organisation et l'institution</b> : temps disponible, prescriptions, hiérarchie, ressources, financement, politiques de formation et réformes.","<b>Le dispositif de formation</b> : objectifs, publics, contenus, accompagnement, modalités (présentiel, distance, hybride), effets et limites."] },
        { title:"Les trois axes du corpus", body:"Le corpus de six textes se répartit en trois axes.", list:["<b>Axe 1 : Histoire, réformes et politiques de la FTLV des enseignants</b>. Textes : Ferrière ; Lessard et Bourdoncle ; Étienne.","<b>Axe 2 : Développement professionnel, posture réflexive et travail collectif</b>. Textes : Fortuna-Carillat ; Marcel.","<b>Axe 3 : Nouveaux dispositifs et hybridation de la formation</b>. Texte : Ravez."] }
      ], recap:["7 séances de 2 h, corpus de six textes, le TD prolonge le CM.","Évaluation : 50 % contrôle terminal (QCM) + 40 % contrôle continu écrit + 10 % oral.","La FTLV dépasse la formation initiale : finalités personnelles, sociales, citoyennes ou professionnelles.","Trois dimensions (temporelle, spatiale, sociale) et trois formes d'apprentissage (formel, non formel, informel).","Grille d'analyse en 5 entrées : individu, situations de travail, collectif, organisation et institution, dispositif de formation.","Trois axes de corpus : histoire et politiques ; développement professionnel ; nouveaux dispositifs."] }
    ], fc:[
      { q:"Que désigne la formation tout au long de la vie (FTLV) ?", a:"L'ensemble des activités d'apprentissage qui se poursuivent tout au long de la vie et qui permettent de développer des connaissances, des compétences et des façons d'agir." },
      { q:"Quelles sont les finalités de la FTLV ?", a:"Des finalités personnelles, sociales, citoyennes ou professionnelles." },
      { q:"Quelles sont les trois dimensions de la FTLV ?", a:"Une dimension temporelle, une dimension spatiale et une dimension sociale." },
      { q:"Dans quels espaces la FTLV se déploie-t-elle ?", a:"À l'école et à l'université, en formation continue, au travail, dans des activités sociales ou associatives, et en autonomie." },
      { q:"Quelles sont les trois formes d'apprentissage ?", a:"Formel, non formel et informel." },
      { q:"Quelles sont les quatre manières d'apprendre une fois en poste ?", a:"La formation organisée, l'apprentissage en situation de travail, l'apprentissage avec les autres, et l'apprentissage autonome." },
      { q:"Quelles sont les cinq entrées de la grille d'analyse de la FTLV ?", a:"L'individu, les situations de travail, le collectif, l'organisation et l'institution, le dispositif de formation." },
      { q:"Que recouvre l'entrée « l'individu » dans la grille d'analyse ?", a:"Le parcours, les dispositions, l'engagement, les représentations et l'identité professionnelle." },
      { q:"Que recouvre l'entrée « les situations de travail » ?", a:"Ce que le professionnel fait réellement : les problèmes, l'expérience, les ajustements et la réflexivité." },
      { q:"Que recouvre l'entrée « le collectif » ?", a:"Les pairs, les collègues, l'équipe, les tuteurs, les échanges, les normes et la reconnaissance." },
      { q:"Que recouvre l'entrée « l'organisation et l'institution » ?", a:"Le temps disponible, les prescriptions, la hiérarchie, les ressources, le financement, les politiques de formation et les réformes." },
      { q:"Que recouvre l'entrée « le dispositif de formation » ?", a:"Les objectifs, les publics, les contenus, l'accompagnement, les modalités (présentiel, distance, hybride), les effets et les limites." },
      { q:"Quels sont les trois axes du corpus de textes ?", a:"Axe 1 : histoire, réformes et politiques de la FTLV des enseignants. Axe 2 : développement professionnel, posture réflexive et travail collectif. Axe 3 : nouveaux dispositifs et hybridation de la formation." },
      { q:"Comment l'ECUE 19.1 est-elle évaluée ?", a:"50 % de contrôle terminal (QCM), 40 % de contrôle continu écrit et 10 % d'oral." },
      { q:"Comment le TD s'articule-t-il avec le CM ?", a:"Le TD travaille et prolonge le cours magistral, à partir de la lecture et de la discussion d'un corpus de six textes scientifiques." }
    ], qcm:[
      { q:"Combien de séances de TD comporte l'ECUE, et de quelle durée ?", opts:["5 séances de 3 h","7 séances de 2 h","8 séances de 1 h 30","6 séances de 2 h"], c:1, e:"L'ECUE comporte 7 séances de TD de 2 h." },
      { q:"Le corpus de textes travaillé en TD comporte :", opts:["six textes","quatre textes","dix textes","trois textes"], c:0, e:"Le TD repose sur la lecture et la discussion d'un corpus de six textes scientifiques." },
      { q:"Quelle est la répartition de l'évaluation ?", opts:["100 % contrôle terminal","50 % contrôle continu écrit, 50 % oral","40 % QCM, 40 % écrit, 20 % oral","50 % contrôle terminal (QCM), 40 % contrôle continu écrit, 10 % oral"], c:3, e:"50 % contrôle terminal sous forme de QCM, 40 % contrôle continu écrit, 10 % oral." },
      { q:"Les trois formes d'apprentissage évoquées sont :", opts:["initial, continu, permanent","scolaire, universitaire, professionnel","formel, non formel, informel","théorique, pratique, appliqué"], c:2, e:"La FTLV recouvre une pluralité de formes d'apprentissage : formel, non formel et informel." },
      { q:"Les finalités de la FTLV sont :", opts:["exclusivement professionnelles","personnelles, sociales, citoyennes ou professionnelles","scolaires et universitaires uniquement","strictement individuelles"], c:1, e:"La FTLV vise des finalités personnelles, sociales, citoyennes ou professionnelles." },
      { q:"Combien d'entrées comporte la grille d'analyse de la FTLV ?", opts:["trois","quatre","cinq","six"], c:2, e:"Cinq entrées : l'individu, les situations de travail, le collectif, l'organisation et l'institution, le dispositif de formation." },
      { q:"Les textes de Fortuna-Carillat et Marcel relèvent de quel axe ?", opts:["Axe 3 : nouveaux dispositifs et hybridation","Axe 1 : histoire, réformes et politiques","Axe 2 : développement professionnel, posture réflexive et travail collectif","Aucun des trois axes"], c:2, e:"Ces deux textes constituent l'axe 2, consacré au développement professionnel, à la posture réflexive et au travail collectif." },
      { q:"Le texte de Ravez relève de quel axe ?", opts:["Axe 3 : nouveaux dispositifs et hybridation de la formation","Axe 2 : développement professionnel","Axe 1 : histoire, réformes et politiques","Il n'est rattaché à aucun axe"], c:0, e:"Ravez est le texte de l'axe 3, sur les nouveaux dispositifs et l'hybridation de la formation." },
      { q:"Quelle proposition ne fait PAS partie des quatre manières d'apprendre une fois en poste ?", opts:["Apprentissage en situation de travail","Formation organisée","Apprentissage avec les autres","Formation initiale obligatoire"], c:3, e:"Les quatre modalités sont : formation organisée, apprentissage en situation de travail, apprentissage avec les autres, apprentissage autonome." },
      { q:"Les trois dimensions de la FTLV sont :", opts:["individuelle, collective, institutionnelle","temporelle, spatiale et sociale","formelle, non formelle, informelle","initiale, continue, certifiante"], c:1, e:"La FTLV se déploie selon une dimension temporelle, spatiale et sociale." }
    ], oq:[
      { q:"Explique en quoi la FTLV dépasse la formation initiale.", a:"La FTLV ne se limite pas au temps de la scolarité : elle désigne l'ensemble des activités d'apprentissage qui se poursuivent tout au long de la vie et permettent de développer des connaissances, des compétences et des façons d'agir. Elle se déploie selon trois dimensions (temporelle, spatiale, sociale) et dans des espaces variés : école et université, formation continue, travail, activités sociales ou associatives, apprentissage en autonomie. Ses finalités sont personnelles, sociales, citoyennes ou professionnelles." },
      { q:"Présente la grille d'analyse de la FTLV et ses cinq entrées.", a:"1) L'individu : parcours, dispositions, engagement, représentations, identité professionnelle. 2) Les situations de travail : ce que le professionnel fait réellement, les problèmes rencontrés, l'expérience, les ajustements et la réflexivité. 3) Le collectif : pairs, collègues, équipe, tuteurs, échanges, normes, reconnaissance. 4) L'organisation et l'institution : temps disponible, prescriptions, hiérarchie, ressources, financement, politiques de formation et réformes. 5) Le dispositif de formation : objectifs, publics, contenus, accompagnement, modalités (présentiel, distance, hybride), effets et limites." },
      { q:"Comment une personne déjà en poste peut-elle continuer à se former ?", a:"Quatre modalités sont distinguées : la formation organisée, l'apprentissage en situation de travail, l'apprentissage avec les autres, et l'apprentissage de manière autonome. L'activité du TD invite à les articuler en construisant le parcours d'un professionnel : comment il apprend (situations et ressources), dans quels dispositifs, avec qui, qui organise et à qui s'adresser (institutions et acteurs), et ce qui rend cette formation possible (organisation, temps, financement, droit)." },
      { q:"Comment le corpus de textes du TD est-il organisé ?", a:"En trois axes. L'axe 1 porte sur l'histoire, les réformes et les politiques de la FTLV des enseignants (Ferrière ; Lessard et Bourdoncle ; Étienne). L'axe 2 porte sur le développement professionnel, la posture réflexive et le travail collectif (Fortuna-Carillat ; Marcel). L'axe 3 porte sur les nouveaux dispositifs et l'hybridation de la formation (Ravez)." }
    ], auteurs:[
      { nom:"Ferrière", courant:"Axe 1 du corpus", periode:"à vérifier",
        these:"Texte de l'axe 1, sur l'histoire, les réformes et les politiques de la FTLV des enseignants. L'auteur n'est désigné que par son nom dans le diaporama : reporte-toi à la bibliographie du cours pour la référence exacte.",
        concepts:["histoire","réformes","politiques éducatives"],
        retenir:"Référence à compléter depuis la bibliographie du TD." },

      { nom:"Lessard et Bourdoncle", courant:"Sociologie de l'éducation, professionnalisation", periode:"Travaux des années 1990 et 2000",
        these:"Raymond Bourdoncle a introduit en France les analyses anglo-saxonnes de la professionnalisation enseignante, d'abord dans une note de synthèse de 1991, puis dans une seconde de 1993 où il en discute les limites, parlant d'un mythe qu'il juge malgré tout utile. Claude Lessard travaille l'évolution du métier d'enseignant et les nouvelles formes de régulation de l'éducation. Ensemble, ils signent dans la Revue française de pédagogie une réflexion sur ce qu'est une formation professionnelle universitaire.",
        concepts:["professionnalisation","professionnalité","universitarisation","semi-profession","régulation"],
        retenir:"Bourdoncle distingue plusieurs sens du mot professionnalisation : l'amélioration des compétences, la stratégie d'un groupe pour faire reconnaître son métier, et l'universitarisation de sa formation." },

      { nom:"Richard Étienne", courant:"Analyse des pratiques, approche clinique", periode:"Professeur émérite, université Paul-Valéry Montpellier 3",
        these:"Membre du LIRDEF, il travaille le changement en éducation, l'organisation du travail enseignant et l'éducation prioritaire. Il a créé un master de formation de formateurs et défend l'analyse des situations éducatives comme levier de formation, notamment à travers le GEASE, groupe d'entraînement à l'analyse de situations éducatives.",
        concepts:["analyse de pratiques","GEASE","posture réflexive","changement en éducation"],
        retenir:"Pour lui, on se forme en analysant collectivement des situations vécues, pas en appliquant des recettes." },

      { nom:"Véronique Fortun-Carillat", courant:"Numérique et formation professionnelle", periode:"Inspé de Créteil, UPEC",
        these:"Rattachée au LIRTES, elle étudie les effets des environnements numériques sur les façons de se former et d'aborder une nouvelle situation professionnelle : communautés virtuelles, échanges entre pairs, ressources en ligne.",
        concepts:["environnements numériques","communautés virtuelles","formation continue"],
        retenir:"Le diaporama écrit « Fortuna-Carillat » ; l'orthographe retenue par l'UPEC est Fortun-Carillat." },

      { nom:"Jean-François Marcel", courant:"Approche sociocognitive du développement professionnel", periode:"Université Toulouse Jean Jaurès, UMR EFTS",
        these:"Il défend l'idée qu'on apprend en travaillant : le développement professionnel naît de l'évolution des pratiques elles-mêmes, et non d'une formation extérieure. Il a beaucoup travaillé le collectif d'enseignants comme acteur à part entière, en distinguant des degrés dans le travail partagé, de la simple coordination jusqu'à la coélaboration.",
        concepts:["développement professionnel","travail collectif","coordination, collaboration, coopération","apprentissage social"],
        retenir:"Le travail collectif n'est pas un bloc : coordination, collaboration et coopération n'engagent pas les enseignants de la même façon." },

      { nom:"Claire Ravez", courant:"Veille scientifique en éducation", periode:"Institut français de l'éducation, ENS de Lyon",
        these:"Chargée d'études dans l'équipe Veille et Analyses de l'IFÉ, elle rédige les Dossiers de veille, synthèses de recherches destinées aux professionnels de l'éducation. Son dossier n° 143 de mai 2023, « Former à enseigner : activité(s), mutations, tensions », porte sur le travail des formateurs d'enseignants, pris entre attentes du terrain, cadre institutionnel et apports de la recherche.",
        concepts:["veille scientifique","formateurs d'enseignants","identité professionnelle","tensions"],
        retenir:"Un Dossier de veille n'est pas une recherche originale mais une synthèse problématisée de travaux existants." }
    ] },
  { id:"e192", ue:"UE19", ects:4, ecue:"19.2", title:"Sociologie de l'éducation",
    cm:[
      { label:"CM1", sections:[
        { title:"Présentation du cours", body:"La sociologie de l'éducation est un des <span class='chunk-highlight'>sous-champs de la sociologie</span> contemporaine. Le cours se compose de 8 CM et 7 TD.", list:["<b>Contrôle continu</b> : 50% (40% écrit + 10% oral).","<b>Partiel</b> : 50%, probablement en janvier, 2h sans document.","Le partiel comporte des questions de cours (définitions, 4-5 questions) et une question de réflexion (mini dissertation ou problématisation)."] },
        { title:"Problématiser un sujet", body:"<span class='chunk-highlight'>Problématiser</span> : comprendre la question posée par un sujet pour la transformer en question de réflexion. Exemple : « filles et garçons » devient « pourquoi y a-t-il des inégalités entre les filles et les garçons ? »" },
        { title:"Pourquoi étudier la sociologie de l'éducation en L3 ?", body:"4 objectifs principaux pour ce cours.", list:["Mobiliser les grands cadres théoriques de la sociologie de l'éducation pour analyser un fait éducatif.","Analyser les mécanismes de production des inégalités scolaires (origine sociale, genre, origine ethnique).","Contextualiser les pratiques éducatives dans leur diversité (scolaire, périscolaire, extrascolaire).","Adopter une posture réflexive et critique face aux discours communs sur l'école (méritocratie, égalité)."] },
        { title:"Qu'est-ce que la sociologie de l'éducation ?", body:"Elle étudie l'éducation comme <span class='chunk-highlight'>fait social</span> (Durkheim) : un ensemble de pratiques, institutions et rapports sociaux qui contribuent à la formation des individus et à la reproduction ou transformation de la société. Elle ne se limite pas à l'école : elle englobe tous les processus de socialisation (pairs, famille, médias, réseaux sociaux), même si l'école en occupe une place centrale.", list:["Variables classiques en sociologie : classe sociale, âge, genre, sexe, ethnicité, racialisation, orientation sexuelle."] },
        { title:"Sociologie de l'éducation vs sciences de l'éducation", body:"Une distinction importante à connaître.", list:["<b>Sociologie de l'éducation</b> : applique les outils de la sociologie à l'objet « éducation », vise à comprendre et expliquer.","<b>Sciences de l'éducation</b> : champ pluridisciplinaire (pédagogie, sociologie...), plus orienté vers l'action éducative et l'amélioration des pratiques.","La sociologie de l'éducation interroge les évidences (« l'école est un ascenseur social », « le mérite explique la réussite ») plutôt que de prescrire des solutions.","L'éducation n'est pas réductible à l'instruction ni à la scolarisation : elle inclut la socialisation primaire."] },
        { title:"Durkheim et les débuts de la discipline", body:"La discipline naît en France avec <span class='chunk-highlight'>Durkheim</span>, père fondateur de la sociologie, au début du XXe siècle (cours publiés en 1922). Pour lui, l'éducation est l'action exercée par les générations adultes sur celles qui ne sont pas encore mûres pour la vie sociale, pour susciter chez l'enfant les états physiques, intellectuels et moraux que réclament la société et son milieu.", list:["L'éducation est un fait social extérieur et contraignant, non un simple processus psychologique individuel.","L'éducation varie selon les sociétés et les époques : pas de système éducatif universel, mais des formes historiquement et socialement situées.","L'individu intériorise des normes sans s'en rendre compte : les normes informelles sont plus contraignantes que les normes formelles."] },
        { title:"Une tension fondatrice", body:"Deux perspectives s'opposent dès l'origine de la discipline.", list:["<b>Perspective fonctionnaliste</b> : l'éducation comme facteur d'intégration et de cohésion sociale.","<b>Perspective critique</b> (développée surtout dans les années 1960-70) : l'éducation comme lieu de reproduction des rapports de domination.","Fin XIXe : l'éducation sert à créer la nation et des citoyens, mais l'école reproduit (voire crée) des inégalités, car les élèves ne partent pas avec les mêmes bagages."] },
        { title:"Le fonctionnalisme", body:"Dans la lignée de Durkheim, puis de <span class='chunk-highlight'>Parsons</span>, l'école remplit des fonctions nécessaires à la société : transmission de la culture commune, sélection et répartition des individus selon leur mérite, préparation aux rôles sociaux adultes.", list:["L'accent est mis sur l'intégration plus que sur les conflits.","Chaque individu trouve sa place selon son mérite (ressources familiales, travail).","Un individu qui change de classe sociale est appelé un <b>transclasse</b>."] },
        { title:"Les approches critiques et reproductionnistes", body:"À partir des années 1960 (massification scolaire, collège unique en 1970), <span class='chunk-highlight'>Bourdieu et Passeron</span> (« Les Héritiers », « La Reproduction ») déplacent le regard : loin d'égaliser les chances, l'école tend à <span class='chunk-highlight'>reproduire les inégalités sociales</span> en les convertissant en inégalités scolaires, puis en les légitimant au nom du mérite individuel.", list:["<b>Capital culturel</b> : les ressources culturelles que l'on possède.","<b>Habitus</b> : comment notre milieu social influence nos façons d'agir.","<b>Violence symbolique</b> : quand les inégalités paraissent naturelles.","L'école valorise la culture légitime des classes moyennes et supérieures (sorties culturelles, lecture, musique)."] },
        { title:"L'individualisme méthodologique", body:"<span class='chunk-highlight'>Boudon</span> (« L'Inégalité des chances », 1973) critique l'approche bourdieusienne pour son déterminisme. Il propose une explication en termes de <span class='chunk-highlight'>stratégies rationnelles</span> des familles face au système scolaire : les inégalités de réussite s'expliquent aussi par des calculs coûts/bénéfices différenciés selon la position sociale, notamment lors des choix d'orientation." },
        { title:"Ouvrages et ressources citées", body:"Quelques références mentionnées en cours.", list:["« L'école primaire vue des coulisses » (2022) : culture professionnelle informelle des professeurs des écoles, relations avec les familles, racialisation et ethnicité (disponible sur Cairn).","« L'école du like » : réseaux sociaux scolaires inspirés d'Instagram et Facebook, pour échanger avec les familles.","« Ethnographier le métier pour l'apprendre » : écrit par d'anciennes étudiantes.","<b>Ethnographie</b> : discipline scientifique proche de la sociologie, aussi utilisée comme méthode d'enquête."] }
      ], recap:["Sociologie de l'éducation = étudier l'éducation comme fait social (Durkheim).","2 grandes tensions : fonctionnalisme (intégration) vs approches critiques (reproduction des inégalités).","Bourdieu et Passeron : capital culturel, habitus, violence symbolique.","Boudon : les familles font des choix stratégiques rationnels.","Évaluation : 50% CC (40% écrit + 10% oral) + 50% partiel en janvier."] }
    ],
    td:[
      { label:"TD 1", sections:[
        { title:"Présentation du TD", body:"7 séances de TD au total, à ne pas confondre avec les CM (contenus différents). Chaque séance porte sur un texte à lire <span class='chunk-highlight'>avant</span> le TD.", list:["TD1 : 09/09","TD2 : 23/09","TD3 : 30/09","TD4 : 24/10 (oral)","TD5 : 04/11","TD6 : 18/11","TD7 : 25/11 → DST"] },
        { title:"Évaluation du TD", body:"L'évaluation du TD repose sur deux éléments distincts du CM.", list:["1 DST (devoir surveillé) en fin de semestre (25/11).","1 oral, qui compte pour 10% : à chaque séance, présentation de la synthèse d'un texte + participation orale."] },
        { title:"Le fil du TD", body:"Le TD se concentre sur l'éducation à l'articulation entre le <span class='chunk-highlight'>système scolaire</span> et le <span class='chunk-highlight'>social</span>, avec en toile de fond la question des inégalités. Première notion posée : <span class='chunk-highlight'>l'école comme institution de socialisation</span>." }
      ], recap:["7 séances, un texte à lire avant chacune.","Évaluation : 1 DST (25/11) + 1 oral (10%, synthèse de texte à chaque séance).","Fil conducteur : éducation, système scolaire, inégalités sociales."] }
    ], fc:[
      { q:"Comment Durkheim définit-il l'éducation ?", a:"L'action exercée par les générations adultes sur celles qui ne sont pas encore mûres pour la vie sociale, pour susciter chez l'enfant les états physiques, intellectuels et moraux que réclament la société et son milieu." },
      { q:"Quelle est la différence entre sociologie de l'éducation et sciences de l'éducation ?", a:"La sociologie de l'éducation applique les outils de la sociologie pour comprendre et expliquer. Les sciences de l'éducation sont pluridisciplinaires et orientées vers l'action éducative." },
      { q:"Qu'est-ce que le capital culturel selon Bourdieu ?", a:"Les ressources culturelles que possède un individu (liées à son milieu social), qui influencent sa réussite scolaire." },
      { q:"Qu'est-ce que l'habitus ?", a:"La manière dont notre milieu social influence nos façons d'agir, de percevoir et de penser." },
      { q:"Qu'est-ce que la violence symbolique ?", a:"Le fait que les inégalités sociales et scolaires paraissent naturelles, alors qu'elles sont construites socialement." },
      { q:"Que reproche Boudon à l'approche de Bourdieu ?", a:"Il lui reproche son déterminisme, et propose à la place une explication par les stratégies rationnelles des familles (calculs coûts/bénéfices)." },
      { q:"Qu'est-ce qu'un transclasse ?", a:"Un individu qui change de classe sociale (par exemple grâce à la réussite scolaire)." },
      { q:"Qu'est-ce que problématiser un sujet ?", a:"Comprendre la question posée par un sujet pour la transformer en véritable question de réflexion (ex : « filles et garçons » → « pourquoi ces inégalités entre eux ? »)." }
    ], qcm:[
      { q:"Qui est considéré comme le père fondateur de la sociologie de l'éducation en France ?", opts:["Bourdieu","Boudon","Durkheim","Parsons"], c:2, e:"La discipline naît en France avec Durkheim, au début du XXe siècle (cours publiés en 1922)." },
      { q:"Le concept de capital culturel est associé à :", opts:["Boudon","Durkheim","Parsons","Bourdieu et Passeron"], c:3, e:"Bourdieu et Passeron développent les concepts de capital culturel, habitus et violence symbolique." },
      { q:"Que propose Boudon face à l'approche de Bourdieu ?", opts:["Le déterminisme social total","Des stratégies rationnelles des familles","Le fonctionnalisme pur","La reproduction automatique des inégalités"], c:1, e:"Boudon critique le déterminisme bourdieusien et propose une explication par les stratégies rationnelles (calculs coûts/bénéfices)." },
      { q:"Le collège unique est créé en :", opts:["1922","1960","1970","1973"], c:2, e:"Le collège unique est créé en 1970, dans le contexte de massification scolaire." },
      { q:"Quelle est la part du contrôle continu dans l'évaluation de ce cours ?", opts:["30%","40%","50%","100%"], c:2, e:"L'évaluation est 50% contrôle continu (40% écrit + 10% oral) et 50% partiel." }
    ], oq:[
      { q:"Explique la différence entre normes formelles et normes informelles, et pourquoi les normes informelles sont plus contraignantes.", a:"Les normes formelles sont les règles explicites. Les normes informelles sont intériorisées sans qu'on s'en rende compte, ce qui les rend plus contraignantes : on ne les questionne pas car elles paraissent naturelles." },
      { q:"Oppose la perspective fonctionnaliste et la perspective critique de l'éducation.", a:"La perspective fonctionnaliste voit l'éducation comme un facteur d'intégration et de cohésion sociale (Durkheim, Parsons). La perspective critique la voit comme un lieu de reproduction des rapports de domination (Bourdieu, Passeron), développée surtout à partir des années 1960-70." }
    ], auteurs:[
      { nom:"Durkheim", contrib:"Père fondateur de la sociologie de l'éducation. Définit l'éducation comme fait social extérieur et contraignant." },
      { nom:"Bourdieu et Passeron", contrib:"« Les Héritiers », « La Reproduction ». Montrent que l'école reproduit les inégalités sociales via le capital culturel, l'habitus et la violence symbolique." },
      { nom:"Boudon", contrib:"« L'Inégalité des chances » (1973). Explique les inégalités par les stratégies rationnelles des familles plutôt que par le déterminisme social." },
      { nom:"Parsons", contrib:"Prolonge le fonctionnalisme durkheimien : l'école prépare aux rôles sociaux adultes." }
    ] },
  { id:"e193", ue:"UE19", ects:2, ecue:"19.3", title:"Introduction à la démarche de recherche 2", cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
  { id:"e201", ue:"UE20", ects:3, ecue:"20.1", title:"Culture numérique",
    cm:[
      { label:"CM1 · 03/09", sections:[
        { title:"Le numérique dans la société", body:"Le numérique est un <span class='chunk-highlight'>mot valise</span> : hardware (le matériel : souris, écran, clavier) et software (les logiciels). Ce n'est pas l'écran le problème, mais <span class='chunk-highlight'>l'usage</span> qu'on en fait. On distingue l'écran passif (télé) et l'écran actif (jeux vidéo), avec des effets différents : le support papier reste meilleur pour la compréhension d'un texte (mémoire géographique).", list:["Hardware = matériel, software = logiciel.","Le problème n'est pas l'écran, c'est l'usage.","Papier > écran pour la compréhension d'un texte."] },
        { title:"5 grandes phases du numérique", body:"On parle d'une <span class='chunk-highlight'>révolution</span> numérique, avec 5 phases contemporaines identifiées.", list:["1980 : ordinateurs personnels","1989 : boom d'internet","2007 : essor de la technologie mobile","2010 : ère des médias sociaux et du big data","2022 : IA et automatisation"] },
        { title:"Les générations face au numérique", body:"Chaque génération a un rapport différent au numérique, selon l'âge auquel elle l'a rencontré.", list:["<b>Baby-boomers</b> (60-80 ans) : arrivée tardive, non choisie, besoin d'accompagnement.","<b>Génération X</b> (45-60 ans) : ont commencé sans, s'adaptent selon la profession.","<b>Génération Y</b> (30-45 ans) : ont toujours connu, usage surtout professionnel.","<b>Génération Z</b> (13-30 ans) : le numérique a toujours été là (« complexe d'Obélix »).","<b>Génération Alpha</b> (- de 13 ans) : tout numérique, trop tôt exposée."] },
        { title:"Usages et compétences numériques", body:"Deux organismes régulent le numérique en France : <span class='chunk-highlight'>ARCEP</span> (infrastructures et réseaux) et <span class='chunk-highlight'>ARCOM</span> (contenus et médias). Les compétences numériques doivent être <span class='chunk-highlight'>adaptatives</span> pour suivre les évolutions.", list:["ARCEP : régule l'accès au réseau.","ARCOM : régule ce qui circule sur le réseau.","5 domaines de compétences : information et données, protection et sécurité, communication et collaboration, création de contenus, environnement numérique."] },
        { title:"La fracture numérique", body:"La fracture numérique a évolué dans le temps : d'abord un problème d'accès, puis de compétence, aujourd'hui multifactoriel.", list:["Années 90 : inégalité d'accès au réseau.","Années 2000-2010 : incapacité à utiliser efficacement.","Années 2020 : facteurs multiples (âge, éducation, revenu, COVID, IA).","4 dimensions : culturelle, économique, sociale, professionnelle."] },
        { title:"Les grands débats actuels", body:"Plusieurs enjeux traversent le débat sur le numérique aujourd'hui.", list:["<b>Usage problématique des écrans</b> : impact sur sommeil, anxiété, estime de soi, cyberviolence.","<b>Obésité informationnelle</b> : trop d'informations, difficulté à distinguer le vrai du faux.","<b>Manipulation</b> : biais de confirmation → bulles de filtres → chambre d'écho.","<b>Écrans et santé</b> : lumière bleue, sédentarité, troubles cognitifs (lien encore débattu)."] }
      ], recap:["Le problème, c'est l'usage, pas l'écran en lui-même.","5 phases : 1980, 1989, 2007, 2010, 2022.","Chaque génération a un rapport différent au numérique.","ARCEP régule le réseau, ARCOM régule les contenus.","La fracture numérique est aujourd'hui multifactorielle."] },
      { label:"CM2 · 04/09", sections:[
        { title:"Réglementation européenne : le DSA", body:"Le <span class='chunk-highlight'>Digital Service Act</span> (DSA) est entré en vigueur en 2023, application au 17 février 2024. Il vise à obliger les grandes plateformes (les <span class='chunk-highlight'>GAFAM</span>) à agir contre les contenus illicites.", list:["Signalement des contenus illicites.","Coopération avec les autorités judiciaires.","Suspension des comptes déviants.","Interdiction du ciblage publicitaire sur les mineurs et données sensibles.","Interdiction des <b>dark patterns</b> (stratégies pour influencer le comportement).","Sanctions : amendes jusqu'à 6% du CA, voire blocage en Europe en cas de récidive."] },
        { title:"DSA vs RGPD", body:"Deux réglementations différentes mais complémentaires.", list:["<b>DSA</b> : fonctionnement des plateformes et services en ligne.","<b>RGPD</b> : traitement des données personnelles, pour toute organisation publique ou privée.","RGPD s'applique dès qu'on cible des résidents européens, même hors UE."] },
        { title:"Lexique du RGPD", body:"Quelques notions clés à connaître pour le RGPD.", list:["<b>Données personnelles</b> : ce qui permet d'identifier une personne, directement ou indirectement.","<b>Identification</b> : possible via une seule donnée ou le croisement de plusieurs.","<b>Traitement</b> : toute opération sur des données, qui doit avoir un but légal et légitime.","3 principes clés : responsabilité, transparence, confiance."] },
        { title:"Réglementation en éducation", body:"Chaque établissement doit avoir une <span class='chunk-highlight'>charte d'usage du numérique</span>, annexée au règlement intérieur et signée par les parents et élèves.", list:["Règles d'utilisation d'internet et des services numériques.","Protection des données et de la vie privée.","Usage pédagogique ou administratif uniquement.","Respect du droit à l'image et à la voix."] },
        { title:"Promouvoir un numérique raisonné", body:"4 grands piliers à connaître pour l'école.", list:["1. Former à un usage raisonné des outils numériques.","2. Suspendre les mises à jour (ENT, vie scolaire) le soir et le week-end.","3. Déployer le dispositif « Portable en pause ».","4. Accompagnement des familles."] },
        { title:"Les rapports de référence", body:"Deux rapports importants pour comprendre les effets des écrans sur les jeunes.", list:["<b>« À la recherche du temps perdu »</b> (Élysée, avril 2024) : effets négatifs identifiés mais non tranchés, impact possible sur le neurodéveloppement.","<b>ANSES</b> (décembre 2025) : usages des réseaux sociaux et santé des adolescents.","90% des 12-17 ans utilisent le téléphone comme accès principal à internet ; 42% y passent 2 à 5h/jour.","Une définition légale des réseaux sociaux existe depuis la <b>loi n°2023-566</b> du 7 juillet 2023, qui vise à instaurer une majorité numérique et à lutter contre la haine en ligne."] },
        { title:"Le modèle économique des réseaux sociaux", body:"Le fonctionnement des RSN pose un problème de fond : leur modèle économique repose sur l'utilisateur lui-même.", list:["<b>Monétisation des données personnelles</b> : l'utilisateur devient le produit.","<b>Stratégies de captation de l'attention</b> : conçues pour maximiser le temps passé sur la plateforme."] },
        { title:"Utilisation, usage, pratique : 3 notions à distinguer", body:"Trois mots proches mais différents pour analyser le rapport au numérique.", list:["<b>Utilisation</b> : usage fonctionnel ou technique d'un outil, sans explorer les intentions sous-jacentes.","<b>Usage</b> : la manière dont l'objet est approprié par les individus ou groupes, selon leurs valeurs et besoins (dimension sociale et culturelle).","<b>Pratique</b> : intègre des routines et habitudes stabilisées dans le quotidien, qui témoignent d'un rapport subjectif ou collectif à l'outil."] },
        { title:"Les 7 effets constatés des RSN sur les ados", body:"Le rapport ANSES identifie 7 effets, avec les filles plus touchées sur le bien-être et la santé mentale.", list:["1. Usage problématique et addiction aux RSN.","2. Manque de sommeil.","3. Image de soi et perception du corps.","4. Troubles anxiodépressifs, en lien avec le contexte familial.","5. Conduites à risque : consommation de substances, défis, sexting non consenti, cyberviolence et cyberharcèlement.","6. Impact sur les résultats scolaires.","7. Lumière bleue et sédentarité."] }
      ], recap:["Le DSA encadre les plateformes, le RGPD protège les données personnelles.","Sanctions DSA : jusqu'à 6% du CA.","Le modèle économique des RSN repose sur les données et l'attention.","Utilisation ≠ usage ≠ pratique : trois niveaux d'analyse différents.","7 effets constatés des RSN sur les ados, les filles étant plus touchées.","À venir : CM3 (16/10, numérique et ingénierie pédagogique) et CM4 (22/10, la révolution IA)."] }
    ],
    td:[],
    fc:[
      { q:"Quelle est la différence entre hardware et software ?", a:"Hardware = le matériel (souris, écran, clavier). Software = les logiciels, la partie non matérielle." },
      { q:"Quelles sont les 5 grandes phases du numérique ?", a:"1980 (ordinateurs personnels), 1989 (boom d'internet), 2007 (mobile), 2010 (réseaux sociaux et big data), 2022 (IA)." },
      { q:"Que régule l'ARCEP ? Et l'ARCOM ?", a:"ARCEP régule les infrastructures et l'accès au réseau. ARCOM régule les contenus et les médias qui y circulent." },
      { q:"Quelles sont les 4 dimensions de la fracture numérique ?", a:"Culturelle, économique, sociale et professionnelle." },
      { q:"Qu'est-ce que le Digital Service Act (DSA) ?", a:"Une réglementation européenne (2023-2024) qui oblige les grandes plateformes à agir contre les contenus illicites, sous peine de sanctions." },
      { q:"Quelle est la différence entre le DSA et le RGPD ?", a:"Le DSA encadre le fonctionnement des plateformes en ligne. Le RGPD protège les données personnelles, pour toute organisation." },
      { q:"Qu'est-ce qu'une donnée personnelle selon le RGPD ?", a:"Toute information qui permet d'identifier une personne, directement ou par croisement de plusieurs données." },
      { q:"Que doit contenir la charte d'usage du numérique d'un établissement ?", a:"Les règles d'utilisation d'internet, les comportements attendus en ligne, la protection des données et de la vie privée." },
      { q:"Quels sont les 4 piliers pour un numérique raisonné à l'école ?", a:"Former à un usage raisonné, suspendre les mises à jour le soir/week-end, déployer le dispositif « Portable en pause », accompagner les familles." },
      { q:"Quel pourcentage des 12-17 ans utilise le téléphone comme accès principal à internet ?", a:"90%, avec 42% qui y passent entre 2 et 5h par jour." },
      { q:"Sur quoi repose le modèle économique des réseaux sociaux ?", a:"La monétisation des données personnelles (l'utilisateur devient le produit) et des stratégies de captation de l'attention." },
      { q:"Quelle est la différence entre utilisation et usage ?", a:"L'utilisation est fonctionnelle et technique, sans explorer les intentions. L'usage intègre les valeurs, normes et besoins des individus ou groupes (dimension sociale et culturelle)." },
      { q:"Qu'est-ce qu'une pratique, au sens de ce cours ?", a:"Des routines et habitudes stabilisées dans le quotidien, qui témoignent d'un rapport subjectif ou collectif à l'outil numérique." },
      { q:"Cite 3 des 7 effets des RSN constatés chez les adolescents.", a:"Par exemple : manque de sommeil, troubles anxiodépressifs, conduites à risque (cyberharcèlement, sexting non consenti)." }
    ],
    qcm:[
      { q:"Que désigne le terme « hardware » ?", opts:["Un réseau social","Une application mobile","Le matériel physique","Un logiciel"], c:2, e:"Hardware = tout ce qui est matériel : souris, écran, clavier." },
      { q:"En quelle année situe-t-on l'essor de la technologie mobile ?", opts:["2022","2007","1989","2010"], c:1, e:"2007 marque l'essor de la technologie mobile (smartphones)." },
      { q:"Qui régule les contenus et les médias en France ?", opts:["RGPD","DSA","ARCEP","ARCOM"], c:3, e:"ARCOM régule les contenus et médias ; ARCEP régule les infrastructures et réseaux." },
      { q:"Le Digital Service Act (DSA) est entré en application le :", opts:["7 juillet 2023","25 août 2003","17 février 2024","1er janvier 2024"], c:2, e:"Le DSA est entré en vigueur en 2023 et en application le 17 février 2024." },
      { q:"Jusqu'à combien peuvent s'élever les sanctions du DSA ?", opts:["Aucune sanction","1% du CA","10 000€ fixes","6% du CA"], c:3, e:"Les sanctions peuvent aller jusqu'à 6% du chiffre d'affaires, voire un blocage en Europe en cas de récidive." },
      { q:"Le RGPD s'applique à :", opts:["Seulement aux réseaux sociaux","Seulement aux mineurs","Toute organisation publique ou privée ciblant des résidents européens","Seulement aux entreprises françaises"], c:2, e:"Le RGPD s'applique dès qu'une organisation traite des données de résidents européens, où qu'elle soit basée." },
      { q:"Quel est l'un des 4 piliers pour un numérique raisonné à l'école ?", opts:["Ignorer les mises à jour","Ne pas informer les familles","Interdire totalement les écrans","Le dispositif « Portable en pause »"], c:3, e:"Les 4 piliers sont : usage raisonné, suspension des mises à jour, portable en pause, accompagnement des familles." }
    ],
    oq:[
      { q:"Explique pourquoi on dit que le problème n'est pas l'écran mais l'usage.", a:"Un écran passif (télé) et un écran actif (jeu vidéo) n'ont pas le même effet. C'est la manière dont on utilise l'outil, pas l'outil en lui-même, qui détermine son impact positif ou négatif." },
      { q:"Compare les objectifs du DSA et du RGPD.", a:"Le DSA encadre le fonctionnement des plateformes en ligne (contenus, modération, transparence). Le RGPD protège les données personnelles des individus, pour toute organisation publique ou privée. Ce sont deux réglementations complémentaires mais distinctes." },
      { q:"Pourquoi la fracture numérique est-elle devenue plus complexe au fil du temps ?", a:"Dans les années 90, c'était un problème d'accès au réseau. Dans les années 2000-2010, un problème de compétence d'usage. Aujourd'hui, elle dépend de multiples facteurs combinés : âge, éducation, revenu, contexte sanitaire (COVID), et désormais l'IA." }
    ],
    auteurs:[]
  },
  { id:"e202", ue:"UE20", ects:2, ecue:"20.2", title:"Langue vivante", bilingue:true, cm:[], td:[], fc:[], qcm:[], oq:[], auteurs:[] },
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
