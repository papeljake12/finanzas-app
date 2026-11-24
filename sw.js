/*
 * Guarda los archivos de la app para que abra rápido y sin señal.
 * Nunca guarda respuestas del puente: los datos se piden siempre frescos.
 * Al cambiar cualquier archivo de la app, sube el número de VERSION.
 */
var VERSION = 'finanzas-v3';
var ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './api.js',
  './app.js',
  './manifest.webmanifest',
  './fonts/manrope-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        return n === VERSION ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var pedido = ev.request;
  // Solo se atienden los archivos propios de la app. El puente (otro sitio) no pasa por aquí.
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  // Primero la red (para recibir versiones nuevas); si no hay señal, la copia guardada.
  ev.respondWith(
    fetch(pedido).then(function (resp) {
      if (resp && resp.ok) {
        var copia = resp.clone();
        caches.open(VERSION).then(function (c) { c.put(pedido, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(pedido, { ignoreSearch: true }).then(function (r) {
        return r || caches.match('./index.html');
      });
    })
  );
});
