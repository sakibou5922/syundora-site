// Serves the decrypted site (stored in Cache Storage by the lock page) under <scope>/app/.
// On every page load it checks version.json; if a newer version was published, the old copy is dropped
// and the visitor is sent back to the password screen to open the new one.
const PREFIX = "syundora-site-";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const scope = new URL(self.registration.scope);
  if (e.request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname + "app/")) return;
  e.respondWith(serve(url, e.request, scope));
});

async function latestVersion(scope) {
  try {
    const r = await fetch(new URL("version.json", scope), { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()).id || null;
  } catch {
    return null; // offline: keep using what this device has
  }
}

async function serve(url, req, scope) {
  let names = (await caches.keys()).filter((k) => k.startsWith(PREFIX));
  if (req.mode === "navigate") {
    const latest = await latestVersion(scope);
    if (latest) {
      const stale = names.filter((k) => k !== PREFIX + latest);
      await Promise.all(stale.map((k) => caches.delete(k)));
      names = names.filter((k) => k === PREFIX + latest);
    }
  }
  const candidates = [url.pathname];
  if (url.pathname.endsWith("/")) candidates.push(url.pathname + "index.html");
  else if (!/\.[a-z0-9]+$/i.test(url.pathname)) candidates.push(url.pathname + "/index.html");
  for (const name of names) {
    const cache = await caches.open(name);
    for (const p of candidates) {
      const hit = await cache.match(url.origin + p, { ignoreSearch: true });
      if (hit) return hit;
    }
  }
  // not unlocked on this device (or an older version): back to the password screen
  if (req.mode === "navigate") return Response.redirect(scope.href, 302);
  return new Response("", { status: 404 });
}
