/* Service worker do GLYX — alarmes via Web Push + ação "Já tomei" */

self.addEventListener("push", (event) => {
  let data = { title: "GLYX", body: "", url: "/dashboard", critical: false, medId: null };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    /* payload não-JSON: usa padrão */
  }

  const options = {
    body: data.body,
    icon: "/icon-192",
    badge: "/icon",
    tag: data.critical ? "glyx-critical" : undefined,
    renotify: Boolean(data.critical),
    requireInteraction: Boolean(data.critical),
    vibrate: data.critical ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: { url: data.url, medId: data.medId },
  };

  if (data.medId) {
    options.actions = [
      { action: "taken", title: "✅ Já tomei" },
      { action: "open", title: "Abrir app" },
    ];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const url = info.url || "/dashboard";

  if (event.action === "taken" && info.medId) {
    event.waitUntil(
      fetch("/api/medications/taken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ medication_id: info.medId }),
      })
        .then((res) => {
          if (res.ok) {
            return self.registration.showNotification("✅ Dose registrada", {
              body: "Anotado no seu histórico. Até a próxima!",
              icon: "/icon-192",
              vibrate: [100],
            });
          }
          // sessão expirada neste aparelho: abre o app para registrar
          return clients.openWindow("/medicacao");
        })
        .catch(() => clients.openWindow("/medicacao"))
    );
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
