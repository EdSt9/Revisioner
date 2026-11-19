# Revisioner

## Vérifier que rien n'est cassé

`node tests/parcours.js` ouvre l'app dans un navigateur sans écran, parcourt les écrans principaux
(accueil, devoirs, cours, agenda, chapitre, QCM, lexique, classes, notifications, compte) dans deux thèmes,
et signale tout écran qui casse ou reste vide. Il tourne aussi tout seul sur GitHub à chaque PR.
Il faut Playwright (`npm install --no-save playwright` puis `npx playwright install chromium`).


## Organisation du code

Le code de l'app est dans `js/`, en neuf fichiers chargés dans l'ordre par `index.html` :

| Fichier | Contenu |
|---|---|
| `01-config-etat.js` | Réglages, état, révision espacée, annotations, mémo, texte des cours, édition |
| `02-classes-devoirs-lecteur.js` | Classes et partage, devoirs partagés, lecture à voix haute |
| `03-partage-edition.js` | Partager un chapitre, éditer, coller un cours |
| `04-recherche-lexique.js` | Semestres, recherche, index des auteurs, lexique, notes, taille du texte |
| `05-agenda.js` | Emploi du temps, planning manuel, contrôles, notifications |
| `06-accueil-matieres.js` | Tableau de bord, accueil, matières, icônes et couleurs |
| `07-chapitre-exercices.js` | Chapitre (Cours / TD / Réviser), révision par chapitre, exercices, auteurs, devoirs |
| `08-series-examen.js` | Séries de questions, mode examen, comparaison du corrigé |
| `09-projets-demarrage.js` | Projets, compte, connexion et démarrage de l'app |

Ils partagent les mêmes variables, comme un seul fichier : l'ordre compte. Une instruction
exécutée au chargement ne peut appeler qu'une fonction d'un fichier précédent (ou du même).
Le contenu des cours reste dans `data.js`, le style dans `app.css`.
