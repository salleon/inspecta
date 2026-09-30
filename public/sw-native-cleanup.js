// Pulled into the offline-cache service worker (vite.config: workbox
// importScripts). Inside the Android app, which is served from
// https://localhost, the offline cache isn't wanted: the app's files are
// already on the phone, and the cached copy kept showing the previous
// version after an update until the app was swiped away. So there, the
// worker deletes its caches, unregisters itself and reloads the app from
// its real files. On the web (any other origin) it does nothing.
if (self.location.origin === "https://localhost") {
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        for (const key of await caches.keys()) await caches.delete(key);
        await self.registration.unregister();
        for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
      })(),
    );
  });
}
