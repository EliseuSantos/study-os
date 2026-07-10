/* StudyOS service worker: payload-less web push + notification click focus. */

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('StudyOS', {
      body: 'lembrete de estudo · abra o app',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => 'focus' in c);
      if (client) return client.focus();
      return self.clients.openWindow('/');
    }),
  );
});
