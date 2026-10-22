// Service worker de Révision : l'app et les cours restent disponibles sans réseau.
// Changer le numéro de version à chaque mise en ligne d'une nouvelle structure de cache.
const CACHE = "revision-v9";
const POLICES = "revision-polices-v1";
const PRECACHE = ["./", "./index.html", "./data.js"];

// Au-delà de ce délai, on n'attend plus le réseau (amphi, métro) : on sert la copie gardée.
const DELAI_RESEAU = 3000;

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys()
      .then(noms=>Promise.all(noms.filter(n=>n !== CACHE && n !== POLICES).map(n=>caches.delete(n))))
      .then(()=>self.clients.claim())
  );
});

// Réseau d'abord, pour avoir la dernière version des cours.
// Si le réseau ne répond pas à temps ou échoue, on sert la copie gardée.
function reseauDabord(req){
  return caches.open(CACHE).then(cache=>{
    const reseau = fetch(req).then(rep=>{
      if(rep && rep.ok) cache.put(req, rep.clone());
      return rep;
    });
    const copie = new Promise(ok=>setTimeout(ok, DELAI_RESEAU)).then(()=>cache.match(req));
    return Promise.race([reseau.catch(()=>null), copie]).then(rep=>{
      if(rep) return rep;
      // le délai a expiré sans copie : on attend quand même le réseau, puis la page d'accueil en dernier recours
      return reseau.catch(()=>cache.match(req)).then(r=>r || cache.match("./index.html"));
    });
  });
}

// Polices Google : la copie gardée tout de suite, mise à jour en arrière-plan.
function polices(req){
  return caches.open(POLICES).then(cache=>cache.match(req).then(garde=>{
    const reseau = fetch(req).then(rep=>{
      if(rep && (rep.ok || rep.type === "opaque")) cache.put(req, rep.clone());
      return rep;
    }).catch(()=>garde);
    return garde || reseau;
  }));
}

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(polices(req));
    return;
  }
  // le reste des autres sites (Supabase, emploi du temps) passe sans toucher au cache
  if(url.origin !== self.location.origin) return;
  e.respondWith(reseauDabord(req));
});
