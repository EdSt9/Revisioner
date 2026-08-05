// Service worker — permet d'utiliser le site hors ligne.
// Stratégie : "network first, fallback cache" pour la page,
// afin que tu aies toujours la dernière version quand tu as du réseau,
// mais que le site reste utilisable sans connexion.

const CACHE = "revision-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./data.js",
];

// À l'installation : on met la page en cache.
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// À l'activation : on nettoie les anciens caches.
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// À chaque requête : on tente le réseau, sinon on sert le cache.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  // on ne gère QUE les requêtes vers notre propre site :
  // les appels externes (Supabase, emploi du temps…) passent sans interception,
  // sinon leur échec renverrait index.html à la place de la vraie réponse.
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        // on met à jour le cache avec la version fraîche
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        // hors ligne : on sert depuis le cache
        caches.match(req).then(hit => hit || caches.match("./index.html"))
      )
  );
});
