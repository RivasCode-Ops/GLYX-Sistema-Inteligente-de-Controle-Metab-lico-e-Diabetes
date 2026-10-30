import { describe, expect, it } from "vitest";
import { isKnownPushEndpoint } from "./endpoint";

describe("isKnownPushEndpoint (GLYX-31)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/dXk3abc:APA91b",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://web.push.apple.com/QGuQyavXutnMA",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    "https://FCM.googleapis.com/fcm/send/x",
  ])("aceita o serviço real %s", (url) => {
    expect(isKnownPushEndpoint(url)).toBe(true);
  });

  it.each([
    ["metadados de nuvem", "http://169.254.169.254/latest/meta-data/"],
    ["host interno", "https://localhost/push"],
    ["http sem TLS", "http://fcm.googleapis.com/fcm/send/x"],
    ["porta trocada", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["sufixo forjado", "https://fcm.googleapis.com.atacante.com/x"],
    ["prefixo forjado", "https://evilfcm.googleapis.com.example/x"],
    ["credencial embutida", "https://user:pw@fcm.googleapis.com/x"],
    ["sufixo sem ponto", "https://atacantenotify.windows.com/x"],
    ["texto que não é URL", "não é url"],
  ])("recusa %s", (_, url) => {
    expect(isKnownPushEndpoint(url)).toBe(false);
  });
});
