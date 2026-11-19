# Revisioner

## Vérifier que rien n'est cassé

`node tests/parcours.js` ouvre l'app dans un navigateur sans écran, parcourt les écrans principaux
(accueil, devoirs, cours, agenda, chapitre, QCM, lexique, classes, notifications, compte) dans deux thèmes,
et signale tout écran qui casse ou reste vide. Il tourne aussi tout seul sur GitHub à chaque PR.
Il faut Playwright (`npm install --no-save playwright` puis `npx playwright install chromium`).
