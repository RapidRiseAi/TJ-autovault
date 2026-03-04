self.addEventListener('push', (event) => {
  const defaultPayload = {
    title: 'AutoVault update',
    body: 'You have a new notification.',
    href: '/notifications'
  };

  let payload = defaultPayload;
  try {
    const raw = event.data ? event.data.json() : null;
    if (raw && typeof raw === 'object') {
      payload = {
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : defaultPayload.title,
        body: typeof raw.body === 'string' && raw.body.trim() ? raw.body : defaultPayload.body,
        href: typeof raw.href === 'string' && raw.href.startsWith('/') ? raw.href : defaultPayload.href
      };
    }
  } catch (_error) {
    payload = defaultPayload;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { href: payload.href }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.pathname === href || client.url.includes(href)) {
          return client.focus();
        }
      }
      return clients.openWindow(href);
    })
  );
});
