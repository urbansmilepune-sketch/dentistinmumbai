// DentistIn dentist app service worker: phone alerts (web push) only.
//
// Registered from the dentist dashboard with scope /for-dentists/ (see
// src/lib/pushClient.ts). It has NO fetch handler on purpose, so it never
// caches or changes how pages load; it only shows alerts and opens the right
// page when one is tapped. Alerts are sent by src/lib/push.ts.

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

// Payload: { title, body, url, tag }
self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { body: event.data ? event.data.text() : '' } }
  var title = data.title || 'DentistIn'
  var options = {
    body: data.body || '',
    icon: '/icons/dentist-app-192.png',
    badge: '/icons/dentist-app-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/for-dentists/dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var path = (event.notification.data && event.notification.data.url) || '/for-dentists/dashboard'
  var target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i]
        if (c.url.indexOf(self.location.origin + '/for-dentists/') === 0 && 'focus' in c) {
          return c.focus().then(function (fc) {
            if (!fc || !('navigate' in fc)) return self.clients.openWindow(target)
            return fc.navigate(target).catch(function () { return self.clients.openWindow(target) })
          })
        }
      }
      return self.clients.openWindow(target)
    })
  )
})

// The browser can rotate a subscription. Re-subscribe with the same key and
// tell the server, swapping the old address for the new one.
self.addEventListener('pushsubscriptionchange', function (event) {
  var old = event.oldSubscription
  var key = old && old.options && old.options.applicationServerKey
  if (!key) return
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then(function (sub) {
      return fetch('/api/dentist/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: old.endpoint }),
      })
    }).catch(function () { /* next app open re-syncs */ })
  )
})
