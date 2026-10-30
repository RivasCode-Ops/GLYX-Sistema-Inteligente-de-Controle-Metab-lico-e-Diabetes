/**
 * globalSetup do Vitest (GLYX-46): confere a configuração antes de qualquer teste.
 * O Vitest não carrega o `.env.local`, então não exige cobertura dos nomes; exige que
 * nenhum destino configurado no processo saia da máquina ou aponte para produção.
 */
import { exigirDestinosLocais } from "./guarda-destino";

export default function setup(): void {
  exigirDestinosLocais({ env: process.env, pasta: process.cwd(), exigirCobertura: false });
}
