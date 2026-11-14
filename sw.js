// Service worker de Révision : l'app s'ouvre tout de suite, même sans réseau.
// Changer le numéro de version à chaque changement de ce fichier.
const CACHE = "revision-v58";
const POLICES = "revision-polices-v1";
const LIBS = "revision-libs-v1";   // le lecteur de PDF, gardé pour lire sans réseau
const BADGE = "revision-badge";    // le chiffre de la pastille de l'icône, partagé avec la page
const PRECACHE = ["./", "./index.html", "./data.js"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys()
      .then(noms=>Promise.all(noms.filter(n=>n !== CACHE && n !== POLICES && n !== LIBS && n !== BADGE).map(n=>caches.delete(n))))
      .then(()=>self.clients.claim())
  );
});

// Ce qui permet de savoir si un fichier a changé, sans relire tout son contenu
function empreinte(rep){
  if(!rep) return "";
  const h = rep.headers;
  return [h.get("etag"), h.get("last-modified"), h.get("content-length")].filter(Boolean).join("|");
}
// Prévenir la page qu'une nouvelle version est prête (cours ou app)
function prevenir(){
  return self.clients.matchAll({ type:"window" }).then(cs=>cs.forEach(c=>c.postMessage({ type:"nouvelle-version" })));
}

// La copie gardée tout de suite, la version en ligne en arrière-plan.
// Si elle a changé, on la garde pour la prochaine fois et on prévient la page.
// Sans copie gardée (toute première ouverture), on attend le réseau.
function copieDabord(e, req){
  return caches.open(CACHE).then(cache=>cache.match(req, { ignoreSearch:true }).then(garde=>{
    const reseau = fetch(req, { cache:"no-cache" }).then(rep=>{
      if(rep && rep.ok){
        const change = garde && empreinte(garde) !== empreinte(rep);
        return cache.put(req, rep.clone()).then(()=>{ if(change) return prevenir(); }).then(()=>rep);
      }
      return rep;
    });
    if(garde){
      e.waitUntil(reseau.catch(()=>{}));
      return garde;
    }
    return reseau.catch(()=>cache.match("./index.html"));
  }));
}

function reseauDabord(req){
  return caches.open(CACHE).then(cache=>
    fetch(req, { cache:"no-cache" }).then(rep=>{
      if(rep && rep.ok) cache.put(req, rep.clone());
      return rep;
    }).catch(()=>cache.match(req, { ignoreSearch:true }).then(g=>g || cache.match("./index.html")))
  );
}

// Polices Google : la copie gardée tout de suite, mise à jour en arrière-plan.
function polices(req, nom){
  return caches.open(nom || POLICES).then(cache=>cache.match(req).then(garde=>{
    const reseau = fetch(req).then(rep=>{
      if(rep && (rep.ok || rep.type === "opaque")) cache.put(req, rep.clone());
      return rep;
    }).catch(()=>garde);
    return garde || reseau;
  }));
}

// ── Notifications push : le serveur envoie { title, body, tag, data } ──
// Une nouveauté (cours, devoir, classe) ajoute 1 à la pastille de l'icône ; la page la remet au juste chiffre à l'ouverture.
function badgePlusUn(){
  if(!self.navigator || !self.navigator.setAppBadge) return Promise.resolve();
  return caches.open(BADGE).then(c=>c.match("/__badge").then(r=>r ? r.text() : "0").then(t=>{
    const n = (parseInt(t, 10) || 0) + 1;
    return c.put("/__badge", new Response(String(n))).then(()=>self.navigator.setAppBadge(n));
  })).catch(()=>{});
}
self.addEventListener("push", e=>{
  let n = {};
  try{ n = e.data ? e.data.json() : {}; }catch(err){ n = { body: e.data ? e.data.text() : "" }; }
  const type = n.data && n.data.type;
  const compte = type !== "rappel" && type !== "test" && type !== "projet";   // un rappel n'est pas une nouveauté ; l'app compte déjà les étapes
  if(compte) e.waitUntil(badgePlusUn());
  e.waitUntil(self.registration.showNotification(n.title || "Révision", {
    body: n.body || "",
    tag: n.tag || undefined,          // même tag : la nouvelle remplace l'ancienne (6 chapitres → une seule)
    renotify: !!n.tag,
    data: n.data || {},
    icon: "icon-192.png",
    badge: "icon-192.png"
  }));
});
// Touchée : on ramène l'app au premier plan et on lui dit quoi ouvrir
self.addEventListener("notificationclick", e=>{
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type:"window", includeUncontrolled:true }).then(cs=>{
    const c = cs[0];
    if(c){ c.postMessage({ type:"notif", data }); return c.focus(); }
    return self.clients.openWindow("./?notif=" + encodeURIComponent(JSON.stringify(data)));
  }));
});

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(polices(req));
    return;
  }
  if(url.hostname === "cdnjs.cloudflare.com" && url.pathname.includes("/pdf.js/")){
    e.respondWith(polices(req, LIBS));
    return;
  }
  // le reste des autres sites (Supabase, emploi du temps) passe sans toucher au cache
  if(url.origin !== self.location.origin) return;
  // la page elle-même : toujours la même entrée de cache, quelle que soit l'adresse
  // la page et les cours : toujours la dernière version en ligne, la copie gardée seulement hors réseau
  const nom = url.pathname.split("/").pop();
  if(req.mode === "navigate" && nom && nom !== "index.html" && /\.[a-z0-9]+$/i.test(nom)){ return; }   // /data.js tapé dans Safari : le fichier lui-même
  const cle = req.mode === "navigate" ? new Request("./index.html") : req;
  if(req.mode === "navigate" || nom === "data.js" || nom === "index.html" || nom === ""){ e.respondWith(reseauDabord(cle)); return; }
  e.respondWith(copieDabord(e, cle));
});
