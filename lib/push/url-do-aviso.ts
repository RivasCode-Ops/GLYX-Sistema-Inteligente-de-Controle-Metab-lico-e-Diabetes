/**
 * Para onde a notificação leva, a partir da `tag` que o banco monta
 * (`'glyx-' || kind || '-' || ref || '-' || sent_on`).
 *
 * O aviso de reposição ("Hora de repor: X") abria /medicacao sem dizer qual
 * item, e a pessoa tinha de achar o remédio e o formulário. Agora ele abre a
 * tela de reposição DAQUELE item (estoque-repor, 31/10/2026). Sem migration:
 * o id já vem na tag (`<med_id>@refill`).
 */
const REFILL = /^glyx-refill-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@refill-/i;

export function urlDoAviso(tag: string | null | undefined): string {
  const m = tag ? REFILL.exec(tag) : null;
  return m ? `/medicacao/estoque/${m[1].toLowerCase()}` : "/medicacao";
}
