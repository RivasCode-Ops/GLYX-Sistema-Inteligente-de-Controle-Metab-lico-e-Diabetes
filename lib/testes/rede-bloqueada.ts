/**
 * Setup do Vitest (GLYX-46): nenhum teste unitário abre conexão para fora da
 * máquina. Toda conexão TCP/TLS passa por `net.Socket.prototype.connect` (fetch/undici,
 * http, https, clientes de banco); aqui ela é recusada ANTES da resolução de DNS se o
 * host não estiver na lista permitida — o teste falha com motivo claro em vez de
 * alcançar um serviço real.
 *
 * Exceção só pela variável explícita descrita em `lib/testes/guarda-destino.ts`.
 */
import net from "node:net";
import { hostPermitido, hostsPermitidos } from "./guarda-destino";

const permitidos = hostsPermitidos(process.env);
const conectarOriginal = net.Socket.prototype.connect;

type Opcoes = { host?: string; path?: string };

function hostDaChamada(args: unknown[]): string | null {
  // net.connect() normaliza para connect([opções, callback]).
  const primeiro = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof primeiro === "object" && primeiro !== null) {
    const o = primeiro as Opcoes;
    if (o.path) return null; // socket local (pipe/unix): não sai da máquina
    return o.host ?? "localhost";
  }
  if (typeof primeiro === "number" || (typeof primeiro === "string" && /^\d+$/.test(primeiro))) {
    return typeof args[1] === "string" ? args[1] : "localhost";
  }
  return null; // connect(path): socket local
}

net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const host = hostDaChamada(args);
  if (host !== null && !hostPermitido(host, permitidos)) {
    const erro = new Error(
      `GUARDA DE DESTINO: teste tentou conectar em "${host}". Testes só alcançam a própria máquina.`
    );
    process.nextTick(() => this.destroy(erro));
    return this;
  }
  return (conectarOriginal as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;
