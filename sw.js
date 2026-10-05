// ══════════ KeyFit — Service Worker ══════════
// Strategie :
//  - Navigation (index.html) : reseau d'abord avec delai court, sinon cache.
//    -> les mises a jour arrivent quand on est en ligne, l'app s'ouvre hors ligne.
//  - Scripts CDN (supabase, chart.js...) : cache d'abord, rafraichi en arriere-plan.
// Le numero de version force le renouvellement du cache a chaque deploiement modifie.
const VERSION = 'kf-v51';
const APP_CACHE = VERSION + '-app';
const LIB_CACHE = VERSION + '-lib';
// Cache permanent pour les fichiers immuables (photos, vocaux).
// Plafonne a 300 entrees : au-dela, on jette les plus anciennes.
// VOLONTAIREMENT sans numero de version : ce cache contient des photos et des
// vocaux, pas du code. En y mettant VERSION, chaque deploiement creait un
// cache VIDE et re-telechargeait tout depuis Supabase — avec une trentaine de
// deploiements, c'est probablement la vraie cause du depassement d'egress.
// Les anciens caches "<version>-media" restants sont purges a l'activation.
const MEDIA_CACHE = 'kf-media';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then(async (c) => {
      // Chaque fichier s'ajoute independamment : un seul en echec (404,
      // reseau lent) ne doit plus bloquer l'installation de tous les autres,
      // ce qui laissait tourner une ancienne version indefiniment.
      const files = ['./','./seance.js?v=11','./sommeil.js?v=1','./nutrition.js?v=1','./poids.js?v=1','./calendrier.js?v=4','./conversations.js?v=22','./messagerie.js?v=6','./defis.js?v=1','./groupes.js?v=1','./notifications.js?v=1'];
      await Promise.all(files.map(f => c.add(f).catch(()=>{})));
    }).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        // On garde le cache media partage (kf-media) et on supprime tout le
        // reste, y compris les anciens "<version>-media" devenus orphelins :
        // ils occupaient de la place sans jamais etre relus.
        .filter(k => !k.startsWith(VERSION) && k !== MEDIA_CACHE)
        .map(k => caches.delete(k)))
    ).then(()=>self.clients.claim())
  );
});

// Reseau avec delai : au-dela, on sert le cache (evite l'ecran blanc en zone grise).
function networkFirst(req, cacheName, timeoutMs){
  return caches.open(cacheName).then(cache =>
    new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        cache.match(req, {ignoreSearch:true}).then(hit => {
          if (hit && !settled){ settled = true; resolve(hit); }
        });
      }, timeoutMs);
      fetch(req).then(res => {
        clearTimeout(timer);
        if (res && res.ok) cache.put(req, res.clone());
        if (!settled){ settled = true; resolve(res); }
      }).catch(() => {
        clearTimeout(timer);
        cache.match(req, {ignoreSearch:true}).then(hit => {
          if (!settled){ settled = true; resolve(hit || Response.error()); }
        });
      });
    })
  );
}

// Repond a une demande de plage (lecteur audio) a partir du fichier complet
// garde en cache : on telecharge le vocal UNE fois, puis toutes les lectures
// suivantes, y compris les avances/reculs, sont servies localement.
async function rangeFromCache(req){
  try{
    const plein = new Request(req.url, {mode:'cors', credentials:'omit'});
    const cache = await caches.open(MEDIA_CACHE);
    let hit = await cache.match(plein);
    if (!hit){
      // Pas encore en cache : on le recupere en entier une bonne fois.
      const res = await fetch(plein);
      if (res && res.ok){
        cache.put(plein, res.clone());
        hit = res;
      } else {
        return fetch(req); // echec : on laisse le reseau gerer normalement
      }
    }
    const buf = await hit.arrayBuffer();
    const total = buf.byteLength;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
    let debut = m && m[1] ? parseInt(m[1],10) : 0;
    let fin   = m && m[2] ? parseInt(m[2],10) : total - 1;
    if (isNaN(debut) || debut < 0) debut = 0;
    if (isNaN(fin) || fin >= total) fin = total - 1;
    if (debut > fin) return new Response(null,{status:416});
    return new Response(buf.slice(debut, fin + 1), {
      status: 206,
      headers: {
        'Content-Type': hit.headers.get('Content-Type') || 'audio/mp4',
        'Content-Length': String(fin - debut + 1),
        'Content-Range': `bytes ${debut}-${fin}/${total}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }catch(e){
    return fetch(req);
  }
}
async function cacheForever(req){
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try{
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')){
      cache.put(req, res.clone());
      const keys = await cache.keys();
      if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) cache.delete(k);
    }
    return res;
  }catch(e){
    return hit || Response.error();
  }
}

// Cache d'abord, revalidation en arriere-plan (pour les bibliotheques CDN).
function staleWhileRevalidate(req, cacheName){
  return caches.open(cacheName).then(cache =>
    cache.match(req).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // jamais les ecritures (Supabase POST etc.)
  const url = new URL(req.url);

  if (req.mode === 'navigate'){
    e.respondWith(networkFirst(req, APP_CACHE, 3500));
    return;
  }
  // Modules locaux de l'app : reseau d'abord, cache en secours.
  if (url.origin === self.location.origin && /\.js$/.test(url.pathname) && !/sw\.js$/.test(url.pathname)){
    e.respondWith(networkFirst(req, APP_CACHE, 3000));
    return;
  }
  // ── Photos et vocaux : cache d'abord, DEFINITIVEMENT ──────────────
  // Un fichier envoye dans une conversation ne change jamais. Le retelecharger
  // a chaque ouverture faisait exploser la bande passante Supabase. On le garde
  // donc localement : une seule descente par appareil, pour toujours.
  if (/\/storage\/v1\/object\/public\//.test(req.url)){
    // Les vocaux etaient exclus du cache : ils sont lus par morceaux (entete
    // Range) et un cache qui renvoie betement le fichier entier fait echouer
    // le lecteur audio. Conséquence : chaque reecoute repartait du serveur.
    // Avec 424 vocaux reecoutes plusieurs fois chacun, c'est la principale
    // source d'egress — bien plus que leur poids (60 Mo au total).
    // On les met donc en cache comme les photos, en repondant nous-memes
    // aux demandes de plage a partir du fichier complet garde localement.
    if (req.headers.get('range')){
      e.respondWith(rangeFromCache(req));
      return;
    }
    e.respondWith(cacheForever(req));
    return;
  }
  // Bibliotheques CDN : indispensables au demarrage hors ligne.
  if (/jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/.test(url.hostname)){
    e.respondWith(staleWhileRevalidate(req, LIB_CACHE));
    return;
  }
  // Requetes Supabase GET : reseau direct (donnees fraiches), pas de cache.
});

// ══════════ NOTIFICATIONS PUSH ══════════
// Le serveur (Edge Function Supabase) envoie un JSON : {title, body, tag, url}
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {
    try { d = { body: e.data.text() }; } catch (e2) {}
  }
  const title = d.title || 'KeyFit';
  const options = {
    body: d.body || '',
    tag: d.tag || 'keyfit-msg',      // regroupe les notifs d'une meme conversation
    renotify: true,
    data: { url: d.url || './' }
  };
  e.waitUntil((async () => {
    // RÈGLE SAFARI, NON NÉGOCIABLE : un évènement "push" qui ne se traduit
    // JAMAIS par une notification visible ("push silencieux") peut faire
    // révoquer par Safari l'abonnement push du site entier — pas seulement
    // ignorer cette notification-là. On l'affiche donc TOUJOURS, sans
    // condition.
    //
    // Deviner ici, dans le service worker, si l'app est sous les yeux de
    // l'utilisateur (clients.matchAll + visibilityState, ou un heartbeat
    // dans un cache) s'est révélé peu fiable sur iOS : intermittent, pas
    // systématique. La page, elle, connaît son propre document.visibilityState
    // avec une certitude totale. On la laisse donc décider elle-même : on
    // affiche, on la prévient, et c'est SA responsabilité de refermer si
    // elle est bien visible (voir le listener 'message' dans index.html).
    await self.registration.showNotification(title, options);
    const list = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    list.forEach((c) => c.postMessage({ type:'push-shown', tag: options.tag }));
    if (self.registration.getNotifications) {
      const n = await self.registration.getNotifications();
      if (self.navigator && self.navigator.setAppBadge) {
        self.navigator.setAppBadge(n.length).catch(()=>{});
      }
    }
  })());
});

// Tap sur la notification : on remet l'app au premier plan (ou on l'ouvre).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // Le tag porte deja l'identifiant de conversation ("dm:<id>" ou "g:<id>").
  const tag = (e.notification.tag || '');
  const conv = /^(dm:|g:)/.test(tag) ? tag : null;
  // Le chrono de repos doit ramener sur l'onglet Seances, pas sur les messages.
  const gotoWorkout = (tag === 'rest-timer');
  const target = conv ? ('./#conv=' + encodeURIComponent(conv))
                : gotoWorkout ? './#goto=workout' : './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          if (conv) c.postMessage({ type: 'push-open', conv: conv });
          else if (gotoWorkout) c.postMessage({ type: 'goto-page', page: 'workout' });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
