/* Service worker do GLYX — alarmes via Web Push + ação "Já tomei" */

// Atualização imediata: sem isto, uma versão nova do SW fica esperando
// todas as abas fecharem (num PWA, pode levar dias) e correções de
// notificação não chegam ao usuário.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

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
    // Vibração longa e entrecortada no crítico: em celular no silencioso, a
    // vibração é o único canal que sobra.
    vibrate: data.critical ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    // Explícito de propósito: `silent: true` em qualquer lugar da cadeia mataria
    // o som do sistema sem deixar rastro.
    silent: false,
    data: { url: data.url, medId: data.medId },
  };

  if (data.medId) {
    // Navegadores costumam exibir só 2 ações — tocar no corpo já abre o
    // app, então priorizamos "Já tomei" e "Adiar" aqui.
    options.actions = [
      { action: "taken", title: "✅ Já tomei" },
      { action: "snooze", title: "⏰ Adiar 15min" },
    ];
  }

  // Com o app aberto, avisa a página para tocar o alarme próprio. O som da
  // notificação é decidido pelo sistema operacional e pode estar mudo, baixo ou
  // em "não perturbe" — e alerta de hipoglicemia despercebido é problema de
  // segurança. Com a tela na frente do usuário, quem faz barulho é o app.
  const notifyOpenClients = data.critical
    ? self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: "glyx-critical",
            payload: { title: data.title, body: data.body, url: data.url, critical: true },
          });
        }
      })
    : Promise.resolve();

  event.waitUntil(
    Promise.all([self.registration.showNotification(data.title, options), notifyOpenClients])
  );
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

  if (event.action === "snooze" && info.medId) {
    // Hora em que o lembrete volta — confirmação concreta ("volta às 14:56")
    // em vez de genérica; o robô confere a cada 5 min, então pode variar ~5min.
    const returnAt = new Date(Date.now() + 15 * 60000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    event.waitUntil(
      fetch("/api/medications/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ medication_id: info.medId, minutes: 15 }),
      })
        .then((res) =>
          self.registration.showNotification(
            res.ok ? "⏰ Adiado — volta às " + returnAt : "❌ Não consegui adiar (erro " + res.status + ")",
            {
              body: res.ok
                ? "Anotado. O lembrete do remédio volta a tocar às " + returnAt + " (±5 min)."
                : "Abra o app, confirme que está logado e tente de novo.",
              icon: "/icon-192",
              tag: "glyx-snooze-confirm",
              renotify: true,
              vibrate: res.ok ? [200, 100, 200] : [400, 100, 400],
            }
          )
        )
        .catch(() =>
          self.registration.showNotification("❌ Não consegui adiar (sem conexão)", {
            body: "Verifique a internet e tente de novo, ou abra o app.",
            icon: "/icon-192",
            tag: "glyx-snooze-confirm",
            vibrate: [400, 100, 400],
          })
        )
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
