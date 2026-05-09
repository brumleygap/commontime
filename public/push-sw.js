// Take over immediately so this SW handles push events instead of any old SW.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}
  const acts = (data.actions ?? []).map(a => ({ action: a.action, title: a.title }));
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CommonTime', {
      body: data.body ?? '',
      icon: '/apple-touch-icon.png',
      ...(data.image ? { image: data.image } : {}),
      ...(acts.length ? { actions: acts } : {}),
      data: { url: data.url ?? '/', actions: data.actions ?? [] },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const notifActions = event.notification.data?.actions ?? [];
  const clicked = notifActions.find(a => a.action === event.action);
  const url = clicked?.url ?? event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// Re-subscribe and update the server if the browser rotates the push subscription.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.getSubscription()
      .then(sub => sub ? sub.unsubscribe() : null)
      .then(() => self.registration.pushManager.subscribe(event.oldSubscription.options))
      .then(sub => {
        const toB64 = buf => buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : null;
        return fetch('/api/link-push', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: sub.endpoint,
            web_p256: toB64(sub.getKey('p256dh')),
            web_auth: toB64(sub.getKey('auth')),
            old_token: event.oldSubscription?.endpoint ?? null,
          }),
        });
      })
  );
});
