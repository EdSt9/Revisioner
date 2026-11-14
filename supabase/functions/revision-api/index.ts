// ══════════════════════════════════════════════════
// Edge Function "revision-api"
// Seul point d'entrée vers la base.
// La clé anon du HTML ne touche plus jamais la base directement.
// ══════════════════════════════════════════════════
//
// Déploiement :
//   supabase functions deploy revision-api --no-verify-jwt
//   supabase secrets set REVISION_SALT="une-longue-chaine-au-hasard"
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Les clés des notifications (VAPID) sont créées au premier usage et gardées
// dans la table server_config, que seule cette fonction peut lire.

import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SALT         = Deno.env.get("REVISION_SALT") ?? "sel-par-defaut-a-changer";
const PUSH_SUJET   = "https://revisioner.netlify.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Le code secret n'est jamais stocké en clair.
async function hashCode(pseudo: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${pseudo}:${code}:${SALT}`);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparaison à temps constant : évite de laisser deviner le code lettre par lettre.
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cleanPseudo(v: unknown): string {
  return String(v ?? "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

async function db(path: string, init: RequestInit = {}) {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function getRow(pseudo: string) {
  const r = await db(`users?pseudo=eq.${encodeURIComponent(pseudo)}&select=*`);
  if (!r.ok) throw new Error(`db ${r.status}`);
  const rows = await r.json();
  return rows[0] ?? null;
}

// Ce qu'on renvoie au navigateur : jamais le hash.
function publicRow(row: Record<string, unknown>) {
  return {
    pseudo:   row.pseudo,
    theme:    row.theme    ?? null,
    srs:      row.srs      ?? {},
    psycho:   row.psycho   ?? {},
    content:  row.content  ?? {},
    settings: row.settings ?? {},
  };
}

// ══════════════════════════════════════════════════
// CLASSES ET PARTAGE
// ══════════════════════════════════════════════════

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I, O, 0, 1 : illisibles
function makeCode(): string {
  let out = "";
  const buf = crypto.getRandomValues(new Uint8Array(6));
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}
function makeId(prefix: string): string {
  return prefix + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// Le rôle de quelqu'un dans une classe, ou null s'il n'y est pas du tout.
async function roleIn(classId: string, pseudo: string): Promise<string | null> {
  const r = await db(`class_members?class_id=eq.${encodeURIComponent(classId)}` +
                     `&pseudo=eq.${encodeURIComponent(pseudo)}&select=role`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0]?.role ?? null;
}
const isMember  = (r: string | null) => r === "owner" || r === "adjoint" || r === "membre";
const canPublish = (r: string | null) => r === "owner" || r === "adjoint";

// Texte aplati d'un chapitre, pour que la recherche trouve autre chose que le titre.
function flatten(payload: Record<string, unknown>): string {
  const bits: string[] = [String(payload.label ?? "")];
  for (const champ of ["fc", "qcm", "oq", "tr", "dev"]) {
    const arr = payload[champ];
    if (!Array.isArray(arr)) continue;
    for (const c of arr as Record<string, unknown>[]) {
      bits.push(String(c.q ?? ""), String(c.a ?? ""), String(c.e ?? ""),
                String(c.texte ?? ""), String(c.label ?? ""), String(c.correction ?? ""));
    }
  }
  const secs = Array.isArray(payload.sections) ? payload.sections : [];
  for (const sec of secs as Record<string, unknown>[]) {
    bits.push(String(sec.title ?? ""), String(sec.body ?? ""));
    if (Array.isArray(sec.list)) bits.push((sec.list as string[]).join(" "));
  }
  if (Array.isArray(payload.recap)) bits.push((payload.recap as string[]).join(" "));
  return bits.join(" ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

// ══════════════════════════════════════════════════
// NOTIFICATIONS PUSH
// ══════════════════════════════════════════════════
// Trois familles, que chacun peut couper dans ses réglages :
//   cours   : un chapitre ou des révisions publiés dans une classe
//   devoirs : un devoir ou un contrôle posé, ou sa date changée
//   classe  : une demande pour entrer, une demande acceptée

let VAPID: { publicKey: string; privateKey: string } | null = null;

const b64url = (buf: Uint8Array) =>
  btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// Les clés sont créées une seule fois, puis relues dans server_config.
async function vapid() {
  if (VAPID) return VAPID;
  const r = await db("server_config?key=eq.vapid&select=value");
  const rows = r.ok ? await r.json() : [];
  if (rows[0]?.value?.publicKey) {
    VAPID = rows[0].value;
  } else {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const pub = new Uint8Array(65);
    pub[0] = 4; pub.set(fromB64url(jwk.x!), 1); pub.set(fromB64url(jwk.y!), 33);
    const neuf = { publicKey: b64url(pub), privateKey: jwk.d! };
    // ignore-duplicates : si deux appels créent les clés en même temps, la première gagne
    await db("server_config", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ key: "vapid", value: neuf }),
    });
    const r2 = await db("server_config?key=eq.vapid&select=value");
    VAPID = (r2.ok ? (await r2.json())[0]?.value : null) ?? neuf;
  }
  webpush.setVapidDetails(PUSH_SUJET, VAPID!.publicKey, VAPID!.privateKey);
  return VAPID!;
}

type Notif = { title: string; body: string; tag?: string; data?: Record<string, unknown> };

// Envoie à tous les appareils de ces personnes, sauf ceux qui ont coupé cette famille.
// surDemande : une famille éteinte par défaut (Ma semaine), envoyée seulement à qui l'a allumée.
// La nuit (22 h – 8 h, heure de Paris), les nouvelles des classes attendent dans push_attente :
// le réveil de 8 h les envoie. Les rappels et l'essai partent toujours tout de suite.
const FAMILLES_DE_JOUR = ["cours", "devoirs", "classe"];
const laNuit = () => { const h = aParis().heure; return h >= 22 || h < 8; };

async function notifier(pseudos: string[], famille: string, n: Notif, surDemande = false, maintenant = false) {
  const cibles = [...new Set(pseudos.filter(Boolean))];
  if (!cibles.length) return;
  if (!maintenant && FAMILLES_DE_JOUR.includes(famille) && laNuit()) {
    const r = await db("push_attente", { method: "POST", body: JSON.stringify({ pseudos: cibles, famille, notif: n }) });
    if (r.ok) return;
    console.error("push_attente", await r.text());
  }
  await vapid();
  const liste = cibles.map((p) => `"${p.replace(/"/g, "")}"`).join(",");
  const r = await db(`push_subs?pseudo=in.(${liste})&select=endpoint,p256dh,auth,prefs`);
  const subs = r.ok ? await r.json() : [];
  const corps = JSON.stringify(n);
  await Promise.all(subs.map(async (s: Record<string, any>) => {
    if (s.prefs && s.prefs[famille] === false) return;
    if (surDemande && !(s.prefs && s.prefs[famille] === true)) return;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        corps,
        { TTL: 60 * 60 * 24 * 3, urgency: "normal" },
      );
    } catch (e) {
      // appareil désabonné ou application supprimée : on oublie cet abonnement
      const code = (e as { statusCode?: number }).statusCode;
      console.error("push refusé", code ?? "", String((e as Error).message ?? e).slice(0, 200), new URL(s.endpoint).host);
      if (code === 404 || code === 410) {
        await db(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
      }
    }
  }));
}

// Les membres validés d'une classe, et son nom.
async function membresClasse(classId: string): Promise<{ nom: string; membres: { pseudo: string; role: string }[] }> {
  const [r1, r2] = await Promise.all([
    db(`classes?id=eq.${encodeURIComponent(classId)}&select=name`),
    db(`class_members?class_id=eq.${encodeURIComponent(classId)}&select=pseudo,role`),
  ]);
  const nom = r1.ok ? ((await r1.json())[0]?.name ?? "ta classe") : "ta classe";
  const membres = (r2.ok ? await r2.json() : []).filter((m: { role: string }) => isMember(m.role));
  return { nom, membres };
}

const TYPE_DEVOIR: Record<string, string> = { controle: "Contrôle", devoir: "À rendre" };
function jourCourt(iso: unknown): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : "";
}
function phraseDevoir(p: Record<string, unknown>, matiere: string): string {
  const quoi = TYPE_DEVOIR[String(p.type ?? "")] ?? "Note";
  const quand = jourCourt(p.date) ? ` le ${jourCourt(p.date)}` : "";
  const heure = p.heure ? ` à ${String(p.heure).replace(":", "h")}` : "";
  return `${quoi}${quand}${heure}${matiere ? " en " + matiere : ""}`;
}

// Un chapitre ou un devoir publié : tous les membres de la classe, sauf l'auteur.
async function notifierPublication(item: Record<string, any>) {
  const { nom, membres } = await membresClasse(item.class_id);
  const autres = membres.map((m) => m.pseudo).filter((p) => p !== item.author);
  if (!autres.length) return;
  const matiere = String(item.subject_title ?? "");
  const data = { type: item.kind === "agenda" ? "devoir" : "cours", class_id: item.class_id, item_id: item.id, subject: matiere };

  if (item.kind === "agenda") {
    const p = item.payload ?? {};
    await notifier(autres, "devoirs", {
      title: nom,
      body: `${phraseDevoir(p, matiere)} · ajouté par ${item.author}`,
      tag: `devoir:${item.id}`,
      data,
    });
    return;
  }

  // Plusieurs chapitres d'affilée dans la même matière : une seule notification, mise à jour.
  const depuis = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const r = await db(`shared_items?class_id=eq.${encodeURIComponent(item.class_id)}` +
                     `&author=eq.${encodeURIComponent(item.author)}` +
                     `&subject_title=eq.${encodeURIComponent(matiere)}` +
                     `&kind=neq.agenda&updated_at=gte.${encodeURIComponent(depuis)}&select=id`);
  const n = r.ok ? (await r.json()).length : 1;
  const body = n > 1
    ? `${item.author} a ajouté ${n} chapitres en ${matiere}`
    : item.kind === "revision"
      ? `${item.author} a ajouté des révisions en ${matiere}`
      : `${item.author} a ajouté ${item.label} en ${matiere}`;
  // n : plusieurs chapitres d'affilée → l'app ouvre la classe ; un seul → le chapitre
  await notifier(autres, "cours", { title: nom, body, tag: `cours:${item.class_id}:${item.author}:${matiere}`, data: { ...data, n } });
}

// ══════════════════════════════════════════════════
// RAPPELS, chaque jour à 18 h (heure de Paris)
// ══════════════════════════════════════════════════
// Un réveil pg_cron appelle « cron_rappels » toutes les heures avec un secret ;
// on n'agit qu'à 18 h, une seule fois par jour. Les rappels partent de l'agenda
// de chacun (users.srs.__edtnotes) : ses devoirs à lui, et ceux reçus d'une classe.
//   veille   : tout ce qui tombe demain
//   J-3      : les contrôles dans trois jours
//   semaine  : le dimanche, les sept jours qui viennent (sur demande)

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

// La date et l'heure à Paris, changement d'heure compris.
function aParis(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}
function plusJours(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function jourDe(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

type Echeance = { date: string; type: "controle" | "devoir"; nom: string; note: string; subj: string; cle: string; chs: string[] };
// Ce qu'il reste à réviser par matière, calculé par l'app (users.srs.__bilan) : q = QCM pas encore validés, e = erreurs à revoir.
type Bilan = Record<string, { q?: number; e?: number }>;
// Une étape de projet : p = projet, t = titre, d = début (AAAA-MM-JJ ou vide), f = fin, ok = cochée.
type Etape = { id?: string; p: string; t: string; d: string; f: string; ok: boolean };

// « 42 QCM à valider et 5 erreurs à revoir en Socialisations. » ; rien si tout est fait ou inconnu
function resteAReviser(es: Echeance[], bilan: Bilan | null): string {
  const morceaux: string[] = [];
  for (const e of es.filter((x) => x.type === "controle")) {
    const b = bilan?.[e.subj];
    if (!b) continue;
    const q = Number(b.q) || 0, er = Number(b.e) || 0;
    const t = [q ? `${q} QCM à valider` : "", er ? `${er} erreur${er > 1 ? "s" : ""} à revoir` : ""].filter(Boolean).join(" et ");
    if (t) morceaux.push(es.length > 1 ? `${t} en ${e.nom}` : t);
  }
  return morceaux.length ? "Il te reste " + morceaux.join(", ") + "." : "";
}

// « ECUE 23.1 ter Droits de l'enfant et de l » → « Droits de l'enfant et de l »
const sansCode = (t: string) => t.replace(/^ECUE\s+[\d.]+\s*(bis|ter|quater)?\s*/i, "").replace(/\s+(CM|TD)(\s*\d+)?$/i, "").trim();

// L'agenda d'une personne → ses contrôles et devoirs à rendre pas encore faits.
// Clé « jour|AAAA-MM-JJ|id » pour un devoir posé sur un jour, « Titre du cours@AAAA-MM-JJTHH:MM » (UTC) sinon.
function echeances(notes: Record<string, any> | null, matieres: Record<string, string> | null): Echeance[] {
  const out: Echeance[] = [];
  for (const [k, N] of Object.entries(notes ?? {})) {
    if (!N || N.done || (N.type !== "controle" && N.type !== "devoir")) continue;
    let date = "", brut = "";
    if (k.startsWith("jour|")) {
      date = k.split("|")[1] ?? "";
    } else {
      const [titre, quand] = k.split("@");
      const t = quand ? new Date(quand + ":00Z") : null;
      if (!t || isNaN(t.getTime())) continue;
      date = aParis(t).iso;
      brut = sansCode(String(titre ?? ""));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // le nom de la matière (envoyé par l'app), sinon le titre du devoir, sinon celui du cours
    const matiere = (N.subj && matieres?.[N.subj]) || "";
    const titreDevoir = String(N.titre ?? "").trim();
    const nom = matiere || titreDevoir || brut;
    let note = String(N.note ?? "").replace(/\s+/g, " ").trim();
    if (matiere && titreDevoir && titreDevoir !== matiere) note = titreDevoir + (note ? " : " + note : "");
    // les chapitres qui tombent (« TD 1 · 11/09 » → « TD 1 »), choisis dans l'app
    const chs = Array.isArray(N.chs) ? N.chs.map((c: unknown) => String(c ?? "").split(" · ")[0].trim()).filter(Boolean).slice(0, 8) : [];
    out.push({ date, type: N.type, nom: nom || "Devoir", note: note.length > 60 ? note.slice(0, 57) + "…" : note, subj: String(N.subj ?? ""), cle: k, chs });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const quoi = (e: Echeance) => (e.type === "controle" ? "Contrôle" : "À rendre");
// « TD 1, TD 2 et TD 3 »
const enListe = (xs: string[]) => xs.length > 1 ? xs.slice(0, -1).join(", ") + " et " + xs[xs.length - 1] : xs.join("");
// un seul devoir : la notification ouvre directement sa page dans l'app
const dataDe = (es: Echeance[]) => es.length === 1 ? { type: "rappel", cle: es[0].cle } : { type: "rappel" };

async function envoyerRappels(force: boolean, aBlanc: boolean) {
  const ici = aParis();
  // à blanc : on calcule tout, on n'envoie rien, on renvoie ce qui serait parti
  const apercu: unknown[] = [];
  const envoyer = (pseudo: string, famille: string, n: Notif, surDemande = false) =>
    aBlanc ? (apercu.push({ pseudo, famille, ...n }), Promise.resolve()) : notifier([pseudo], famille, n, surDemande);
  if (!force && !aBlanc && ici.heure !== 18) return { ok: true, rien: "pas 18 h" };
  // une seule fois par jour, même si le réveil passe deux fois
  if (!force && !aBlanc) {
    const r = await db("server_config?key=eq.rappels_dernier&select=value");
    const dernier = r.ok ? (await r.json())[0]?.value : null;
    if (dernier === ici.iso) return { ok: true, rien: "déjà fait" };
    await db("server_config", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: "rappels_dernier", value: ici.iso }),
    });
  }
  const r1 = await db("push_subs?select=pseudo");
  const pseudos = [...new Set((r1.ok ? await r1.json() : []).map((s: { pseudo: string }) => s.pseudo))];
  if (!pseudos.length) return { ok: true, envoyes: 0 };
  const liste = pseudos.map((p) => `"${String(p).replace(/"/g, "")}"`).join(",");
  const r2 = await db(`users?pseudo=in.(${liste})&select=pseudo,notes:srs->__edtnotes,matieres:srs->__matieres,bilan:srs->__bilan,projets:srs->__projets`);
  const users = r2.ok ? await r2.json() : [];

  const demain = plusJours(ici.iso, 1), dansTrois = plusJours(ici.iso, 3), finSemaine = plusJours(ici.iso, 7);
  const dansSept = finSemaine;
  const dimanche = jourDe(ici.iso) === 0 || aBlanc;
  let envoyes = 0;
  for (const u of users) {
    const tout = echeances(u.notes, u.matieres);
    const data = { type: "rappel" };

    const veille = tout.filter((e) => e.date === demain);
    if (veille.length) {
      const titre = veille.length > 1 ? `Demain : ${veille.length} devoirs`
        : veille[0].type === "controle" ? "Demain : contrôle" : "Demain : devoir à rendre";
      await envoyer(u.pseudo, "rappels", {
        title: titre,
        body: [veille.map((e) => `${quoi(e)} · ${e.nom}${e.note ? " — " + e.note : ""}${e.chs.length ? "\nÀ réviser : " + enListe(e.chs) : ""}`).join("\n"), resteAReviser(veille, u.bilan)].filter(Boolean).join("\n"),
        tag: `rappel:veille:${demain}`, data: dataDe(veille),
      });
      envoyes++;
    }

    const controles = tout.filter((e) => e.date === dansTrois && e.type === "controle");
    if (controles.length) {
      const jour = JOURS[jourDe(dansTrois)];
      await envoyer(u.pseudo, "rappels", {
        title: controles.length > 1 ? `${controles.length} contrôles ${jour}` : `Contrôle ${jour}`,
        body: `${controles.map((e) => e.nom + (e.chs.length ? " (" + enListe(e.chs) + ")" : "")).join(", ")}, ${jour} ${jourCourt(dansTrois)}. ` + (resteAReviser(controles, u.bilan) || "Pense à réviser."),
        tag: `rappel:j3:${dansTrois}`, data: dataDe(controles),
      });
      envoyes++;
    }

    // Les étapes datées des projets (Concours CPE, projet psycho), envoyées par l'app :
    // 7 jours avant la fin, la veille, et le jour où l'étape commence.
    const projets: Etape[] = Array.isArray(u.projets) ? u.projets : [];
    for (const st of projets) {
      if (!st || st.ok || !st.f) continue;
      let n: Notif | null = null;
      if (st.f === dansSept) n = { title: `${st.p} · plus que 7 jours`, body: `${st.t} : avant le ${jourCourt(st.f)}.`, tag: `projet:j7:${st.p}:${st.f}` };
      else if (st.f === demain) n = { title: `${st.p} · demain, dernier jour`, body: `${st.t} : avant demain, ${jourCourt(st.f)}.`, tag: `projet:veille:${st.p}:${st.f}` };
      else if (st.d && st.d === ici.iso) n = { title: `${st.p} · c'est le moment`, body: `${st.t}, d'ici le ${jourCourt(st.f)}.`, tag: `projet:debut:${st.p}:${st.t}` };
      if (!n) continue;
      await envoyer(u.pseudo, "projets", { ...n, data: { type: "projet", pid: st.id ?? "" } });
      envoyes++;
    }

    if (dimanche) {
      const semaine = tout.filter((e) => e.date >= demain && e.date <= finSemaine);
      if (semaine.length) {
        const nc = semaine.filter((e) => e.type === "controle").length, nd = semaine.length - nc;
        const compte = [nc ? `${nc} contrôle${nc > 1 ? "s" : ""}` : "", nd ? `${nd} à rendre` : ""].filter(Boolean).join(", ");
        await envoyer(u.pseudo, "semaine", {
          title: "Ta semaine",
          body: compte + "\n" + semaine.map((e) => `${JOURS_COURTS[jourDe(e.date)]} ${e.nom}`).join(" · "),
          tag: `rappel:semaine:${ici.iso}`, data,
        }, true);
        envoyes++;
      }
    }
  }
  return { ok: true, jour: ici.iso, personnes: users.length, envoyes, ...(aBlanc ? { apercu } : {}) };
}

// Au premier réveil de jour, on envoie ce qui a attendu la nuit, dans l'ordre d'arrivée.
// On supprime chaque ligne avant d'envoyer : un réveil en double n'envoie rien deux fois.
async function envoyerLaNuit(): Promise<number> {
  if (laNuit()) return 0;
  const r = await db("push_attente?select=id,pseudos,famille,notif&order=id.asc&limit=500");
  const rows = r.ok ? await r.json() : [];
  let n = 0;
  for (const row of rows) {
    const d = await db(`push_attente?id=eq.${row.id}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    if (!d.ok || !(await d.json()).length) continue;
    await notifier(row.pseudos, row.famille, row.notif, false, true);
    n++;
  }
  return n;
}

// Laisse l'envoi se finir après la réponse, pour ne pas faire attendre l'app.
function enFond(p: Promise<unknown>) {
  const tache = p.catch((e) => console.error("push", e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(tache);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "method" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "json" }, 400); }

  const action = String(body.action ?? "");

  // Le réveil de 18 h : pas de compte, mais un secret que seule la base connaît.
  if (action === "cron_rappels") {
    try {
      const r = await db("server_config?key=eq.cron_secret&select=value");
      const secret = r.ok ? (await r.json())[0]?.value : null;
      if (!secret || String(body.secret ?? "") !== String(secret)) return json({ error: "interdit" }, 403);
      const nuit = body.a_blanc === true ? 0 : await envoyerLaNuit();
      return json({ ...(await envoyerRappels(body.force === true, body.a_blanc === true)), nuit });
    } catch (e) {
      return json({ error: "serveur", detail: String(e) }, 500);
    }
  }

  const pseudo = cleanPseudo(body.pseudo);
  const code   = String(body.code ?? "");

  if (pseudo.length < 2)  return json({ error: "pseudo_court" }, 400);
  if (code.length   < 4)  return json({ error: "code_court" }, 400);

  const hash = await hashCode(pseudo, code);

  try {
    const row = await getRow(pseudo);

    // ── Première visite : le pseudo est libre, on le réserve avec ce code
    if (!row) {
      if (action !== "login") return json({ error: "inconnu" }, 401);
      const r = await db("users", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          pseudo, code_hash: hash, theme: null,
          srs: {}, psycho: {}, content: {}, settings: {},
          updated_at: new Date().toISOString(),
        }),
      });
      if (!r.ok) return json({ error: "creation", detail: await r.text() }, 500);
      const created = (await r.json())[0];
      return json({ ok: true, nouveau: true, row: publicRow(created) });
    }

    // ── Compte existant sans code (créé avant cette mise à jour) :
    //    le premier code saisi devient le sien.
    if (!row.code_hash) {
      await db(`users?pseudo=eq.${encodeURIComponent(pseudo)}`, {
        method: "PATCH",
        body: JSON.stringify({ code_hash: hash }),
      });
      row.code_hash = hash;
    }

    // ── Vérification
    if (!sameHash(String(row.code_hash), hash)) {
      return json({ error: "code_faux" }, 401);
    }

    if (action === "login") {
      return json({ ok: true, nouveau: false, row: publicRow(row) });
    }

    if (action === "save") {
      const p = (body.patch ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      // liste blanche : le client ne peut pas écrire code_hash ni pseudo
      for (const k of ["theme", "srs", "psycho", "content", "settings"]) {
        if (k in p) patch[k] = p[k];
      }
      const r = await db(`users?pseudo=eq.${encodeURIComponent(pseudo)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!r.ok) return json({ error: "save", detail: await r.text() }, 500);
      return json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    // Notifications : la clé publique, s'abonner, se désabonner, régler, tester
    // ══════════════════════════════════════════════════

    if (action === "push_key") {
      return json({ ok: true, key: (await vapid()).publicKey });
    }

    if (action === "push_subscribe") {
      const sub = (body.sub ?? {}) as Record<string, any>;
      const endpoint = String(sub.endpoint ?? "");
      const p256dh = String(sub.keys?.p256dh ?? "");
      const auth = String(sub.keys?.auth ?? "");
      if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return json({ error: "abonnement" }, 400);
      const prefs = (body.prefs && typeof body.prefs === "object") ? body.prefs : {};
      // le même appareil peut changer de compte : l'abonnement suit le dernier pseudo
      const r = await db("push_subs", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ endpoint, pseudo, p256dh, auth, prefs, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) return json({ error: "abonnement", detail: await r.text() }, 500);
      return json({ ok: true });
    }

    if (action === "push_unsubscribe") {
      const endpoint = String(body.endpoint ?? "");
      await db(`push_subs?endpoint=eq.${encodeURIComponent(endpoint)}&pseudo=eq.${encodeURIComponent(pseudo)}`, { method: "DELETE" });
      return json({ ok: true });
    }

    if (action === "push_prefs") {
      const endpoint = String(body.endpoint ?? "");
      const prefs = (body.prefs && typeof body.prefs === "object") ? body.prefs : {};
      await db(`push_subs?endpoint=eq.${encodeURIComponent(endpoint)}&pseudo=eq.${encodeURIComponent(pseudo)}`, {
        method: "PATCH",
        body: JSON.stringify({ prefs, updated_at: new Date().toISOString() }),
      });
      return json({ ok: true });
    }

    // Une notification d'essai sur ses propres appareils.
    if (action === "push_test") {
      await notifier([pseudo], "test", {
        title: "Révision",
        body: "Les notifications marchent sur cet appareil.",
        tag: "test",
        data: { type: "test" },
      });
      return json({ ok: true });
    }

    // ══════════════════════════════════════════════════
    // Classes. Toutes ces actions arrivent après la vérification du code,
    // donc « pseudo » est authentifié à partir d'ici.
    // ══════════════════════════════════════════════════

    // Mes classes, avec mon rôle dans chacune.
    if (action === "class_list") {
      const r = await db(`class_members?pseudo=eq.${encodeURIComponent(pseudo)}&select=role,class_id`);
      const mine = r.ok ? await r.json() : [];
      if (!mine.length) return json({ ok: true, classes: [] });
      const ids = mine.map((m: Record<string, string>) => `"${m.class_id}"`).join(",");
      const r2 = await db(`classes?id=in.(${ids})&select=*`);
      const cls = r2.ok ? await r2.json() : [];
      const roles: Record<string, string> = {};
      for (const m of mine) roles[m.class_id] = m.role;
      return json({ ok: true, classes: cls.map((c: Record<string, unknown>) => ({
        id: c.id, name: c.name, owner: c.owner,
        code: roles[c.id as string] === "owner" ? c.code : undefined,
        role: roles[c.id as string],
      })) });
    }

    // Créer une classe : on en devient propriétaire.
    if (action === "class_create") {
      const name = String(body.name ?? "").trim().slice(0, 60);
      if (name.length < 2) return json({ error: "nom_court" }, 400);
      const id = makeId("cls");
      let created = null;
      // le code est court : on retente si le tirage tombe sur un code déjà pris
      for (let i = 0; i < 5 && !created; i++) {
        const r = await db("classes", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ id, code: makeCode(), name, owner: pseudo }),
        });
        if (r.ok) created = (await r.json())[0];
      }
      if (!created) return json({ error: "creation_classe" }, 500);
      await db("class_members", {
        method: "POST",
        body: JSON.stringify({ class_id: id, pseudo, role: "owner" }),
      });
      return json({ ok: true, classe: created });
    }

    // Demander l'accès avec le code. Reste en attente jusqu'à validation.
    if (action === "class_request") {
      // class_code, et surtout pas « code » : ce nom porte déjà le code secret du compte
      const cc = String(body.class_code ?? "").trim().toUpperCase();
      const r = await db(`classes?code=eq.${encodeURIComponent(cc)}&select=*`);
      const cls = r.ok ? (await r.json())[0] : null;
      if (!cls) return json({ error: "classe_introuvable" }, 404);
      const existing = await roleIn(cls.id, pseudo);
      if (existing) return json({ ok: true, statut: existing, classe: { id: cls.id, name: cls.name } });
      await db("class_members", {
        method: "POST",
        body: JSON.stringify({ class_id: cls.id, pseudo, role: "pending" }),
      });
      // le créateur et ses adjoints sont prévenus : ce sont eux qui valident
      enFond((async () => {
        const { membres } = await membresClasse(cls.id);
        await notifier(membres.filter((m) => canPublish(m.role)).map((m) => m.pseudo), "classe", {
          title: cls.name,
          body: `${pseudo} demande à rejoindre la classe`,
          tag: `demande:${cls.id}`,
          data: { type: "demande", class_id: cls.id },
        });
      })());
      return json({ ok: true, statut: "pending", classe: { id: cls.id, name: cls.name } });
    }

    // Les membres d'une classe. Seuls le créateur et ses adjoints voient qui en fait partie.
    if (action === "class_members") {
      const classId = String(body.class_id ?? "");
      const mine = await roleIn(classId, pseudo);
      if (!isMember(mine)) return json({ error: "pas_membre" }, 403);
      if (!canPublish(mine)) return json({ ok: true, membres: [], monRole: mine });
      const r = await db(`class_members?class_id=eq.${encodeURIComponent(classId)}&select=pseudo,role`);
      return json({ ok: true, membres: r.ok ? await r.json() : [], monRole: mine });
    }

    // Valider une demande, ou nommer un adjoint, ou exclure.
    // Le créateur seul distribue les rôles ; un adjoint peut valider les entrées.
    if (action === "class_role") {
      const classId = String(body.class_id ?? "");
      const cible   = cleanPseudo(body.cible);
      const role    = String(body.role ?? "");
      if (!["membre", "adjoint", "retire"].includes(role)) return json({ error: "role" }, 400);
      const mine = await roleIn(classId, pseudo);
      if (cible === pseudo) return json({ error: "soi_meme" }, 400);
      const cibleRole = await roleIn(classId, cible);
      if (cibleRole === "owner") return json({ error: "proprietaire" }, 403);
      // nommer un adjoint touche à la hiérarchie : réservé au créateur
      if (role === "adjoint" && mine !== "owner") return json({ error: "pas_proprietaire" }, 403);
      if (!canPublish(mine)) return json({ error: "pas_autorise" }, 403);

      const where = `class_members?class_id=eq.${encodeURIComponent(classId)}` +
                    `&pseudo=eq.${encodeURIComponent(cible)}`;
      if (role === "retire") {
        await db(where, { method: "DELETE" });
      } else {
        await db(where, { method: "PATCH", body: JSON.stringify({ role }) });
        // une demande acceptée, ou un adjoint nommé : la personne est prévenue
        if ((role === "membre" && cibleRole === "pending") || (role === "adjoint" && cibleRole !== "adjoint")) {
          enFond((async () => {
            const { nom } = await membresClasse(classId);
            await notifier([cible], "classe", {
              title: nom,
              body: role === "adjoint" ? "Tu es maintenant adjoint de la classe" : "Ta demande est acceptée : tu fais partie de la classe",
              tag: `role:${classId}`,
              data: { type: "classe", class_id: classId },
            });
          })());
        }
      }
      return json({ ok: true });
    }

    // Le contenu d'une classe, trié par matière et par type.
    if (action === "class_items") {
      const classId = String(body.class_id ?? "");
      if (!isMember(await roleIn(classId, pseudo))) return json({ error: "pas_membre" }, 403);
      const r = await db(`shared_items?class_id=eq.${encodeURIComponent(classId)}&kind=neq.agenda` +
                         `&select=id,class_id,author,kind,subject_title,label,updated_at&order=subject_title,kind,label`);
      return json({ ok: true, items: r.ok ? await r.json() : [] });
    }

    // Publier un chapitre. Réservé au créateur et aux adjoints.
    if (action === "item_publish") {
      const classId = String(body.class_id ?? "");
      if (!canPublish(await roleIn(classId, pseudo))) return json({ error: "pas_autorise" }, 403);
      const kind = String(body.kind ?? "cm");
      // « revision » porte les fiches, QCM et questions ouvertes d'une matière
      // « agenda » : un devoir ou un contrôle posé sur un jour de l'emploi du temps
      if (!["cm", "td", "devoir", "revision", "agenda"].includes(kind)) return json({ error: "type" }, 400);
      const payload = (body.payload ?? {}) as Record<string, unknown>;
      const id = makeId("itm");
      const r = await db("shared_items", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id, class_id: classId, author: pseudo, kind,
          subject_title: String(body.subject_title ?? "").slice(0, 80),
          label: String(payload.label ?? body.label ?? "Chapitre").slice(0, 60),
          payload, search_text: flatten(payload),
        }),
      });
      if (!r.ok) return json({ error: "publication", detail: await r.text() }, 500);
      const item = (await r.json())[0];
      enFond(notifierPublication(item));
      return json({ ok: true, item });
    }

    // Mettre à jour ou retirer un chapitre publié : son auteur, ou le créateur de la classe.
    if (action === "item_update" || action === "item_delete") {
      const itemId = String(body.item_id ?? "");
      const r0 = await db(`shared_items?id=eq.${encodeURIComponent(itemId)}&select=*`);
      const item = r0.ok ? (await r0.json())[0] : null;
      if (!item) return json({ error: "introuvable" }, 404);
      const mine = await roleIn(item.class_id, pseudo);
      if (item.author !== pseudo && mine !== "owner") return json({ error: "pas_autorise" }, 403);

      const where = `shared_items?id=eq.${encodeURIComponent(itemId)}`;
      if (action === "item_delete") {
        await db(where, { method: "DELETE" });
        return json({ ok: true });
      }
      const payload = (body.payload ?? {}) as Record<string, unknown>;
      await db(where, {
        method: "PATCH",
        body: JSON.stringify({
          payload,
          label: String(payload.label ?? item.label).slice(0, 60),
          search_text: flatten(payload),
          updated_at: new Date().toISOString(),
        }),
      });
      // un devoir dont la date ou le type change : la classe est prévenue
      const avant = (item.payload ?? {}) as Record<string, unknown>;
      if (item.kind === "agenda" && (avant.date !== payload.date || avant.type !== payload.type)) {
        enFond((async () => {
          const { nom, membres } = await membresClasse(item.class_id);
          const matiere = String(item.subject_title ?? "");
          await notifier(membres.map((m) => m.pseudo).filter((p) => p !== pseudo), "devoirs", {
            title: nom,
            body: `Changement : ${phraseDevoir(payload, matiere).replace(/^./, (c) => c.toLowerCase())}`,
            tag: `devoir:${item.id}`,
            data: { type: "devoir", class_id: item.class_id, item_id: item.id, subject: matiere },
          });
        })());
      }
      return json({ ok: true });
    }

    // Le contenu complet des chapitres suivis. Appelé à chaque ouverture :
    // c'est ce qui fait que le lien suit les mises à jour de l'auteur.
    if (action === "items_fetch") {
      const ids  = Array.isArray(body.ids)  ? (body.ids as string[]).slice(0, 200) : [];
      // matières suivies en entier : [{ class_id, subject_title }]
      const subs = Array.isArray(body.subs) ? (body.subs as Record<string,string>[]).slice(0, 40) : [];
      if (!ids.length && !subs.length) return json({ ok: true, items: [] });

      const r = await db(`class_members?pseudo=eq.${encodeURIComponent(pseudo)}&select=class_id,role`);
      const mine = r.ok ? await r.json() : [];
      const okClasses = mine.filter((m: Record<string, string>) => isMember(m.role))
                            .map((m: Record<string, string>) => m.class_id);
      if (!okClasses.length) return json({ ok: true, items: [] });
      const cls = okClasses.map((c: string) => `"${c}"`).join(",");

      const out: Record<string, unknown>[] = [];
      const vus = new Set<string>();

      if (ids.length) {
        const list = ids.map((i) => `"${String(i).replace(/"/g, "")}"`).join(",");
        // le filtre par classe garantit qu'on ne sert rien hors des classes de la personne
        const r2 = await db(`shared_items?id=in.(${list})&class_id=in.(${cls})&select=*`);
        if (r2.ok) for (const it of await r2.json()) { if (!vus.has(it.id)) { vus.add(it.id); out.push(it); } }
      }

      for (const sb of subs) {
        if (!okClasses.includes(sb.class_id)) continue;   // classe quittée entre-temps
        const r3 = await db(`shared_items?class_id=eq.${encodeURIComponent(sb.class_id)}` +
                            `&subject_title=eq.${encodeURIComponent(sb.subject_title)}&kind=neq.agenda&select=*`);
        if (r3.ok) for (const it of await r3.json()) { if (!vus.has(it.id)) { vus.add(it.id); out.push(it); } }
      }
      return json({ ok: true, items: out });
    }

    // Les devoirs de l'agenda de plusieurs classes, avec leur contenu.
    // Seulement les classes dont on est membre validé.
    if (action === "agenda_fetch") {
      const ids = Array.isArray(body.class_ids) ? (body.class_ids as string[]).slice(0, 20).map(String) : [];
      if (!ids.length) return json({ ok: true, items: [] });
      const r = await db(`class_members?pseudo=eq.${encodeURIComponent(pseudo)}&select=class_id,role`);
      const mine = r.ok ? await r.json() : [];
      const ok = mine.filter((m: Record<string, string>) => isMember(m.role) && ids.includes(m.class_id))
                     .map((m: Record<string, string>) => `"${m.class_id}"`);
      if (!ok.length) return json({ ok: true, items: [] });
      const r2 = await db(`shared_items?class_id=in.(${ok.join(",")})&kind=eq.agenda` +
                          `&select=id,class_id,author,kind,subject_title,label,payload,updated_at&order=label`);
      return json({ ok: true, items: r2.ok ? await r2.json() : [] });
    }

    // Recherche, limitée aux classes dont on est membre.
    if (action === "search_shared") {
      const q = String(body.q ?? "").trim();
      if (q.length < 2) return json({ ok: true, items: [] });
      const r = await db(`class_members?pseudo=eq.${encodeURIComponent(pseudo)}&select=class_id,role`);
      const mine = r.ok ? await r.json() : [];
      const okClasses = mine.filter((m: Record<string, string>) => isMember(m.role))
                            .map((m: Record<string, string>) => `"${m.class_id}"`);
      if (!okClasses.length) return json({ ok: true, items: [] });
      const like = encodeURIComponent("*" + q.replace(/[*,()]/g, " ") + "*");
      const r2 = await db(`shared_items?class_id=in.(${okClasses.join(",")})&kind=neq.agenda` +
                          `&or=(search_text.ilike.${like},subject_title.ilike.${like},label.ilike.${like})` +
                          `&select=id,class_id,author,kind,subject_title,label,updated_at&limit=40`);
      return json({ ok: true, items: r2.ok ? await r2.json() : [] });
    }

    return json({ error: "action" }, 400);
  } catch (e) {
    return json({ error: "serveur", detail: String(e) }, 500);
  }
});
