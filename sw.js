/* sw.js — permite mostrar notificaciones del sistema (celular y computador) y abrir el chat al tocarlas. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('notificationclick', function (event) {
  var conv = (event.notification.data && event.notification.data.conv) || '';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) { if (conv) c.postMessage({ sdOpenChat: true, conv: conv }); return c.focus(); }
      }
      return self.clients.openWindow('./');
    })
  );
});
