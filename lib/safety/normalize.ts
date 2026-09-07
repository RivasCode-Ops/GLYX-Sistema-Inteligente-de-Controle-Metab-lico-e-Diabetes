/**
 * Normalização de nome de substância para comparação com `substance_aliases.alias`.
 *
 * A coluna `alias` é gravada JÁ normalizada pela migration, então a comparação em
 * runtime normaliza só um lado. O invariante que sustenta isso — todo alias do
 * seed é ponto fixo desta função — está em `seed-invariants.test.ts`; sem ele,
 * um alias com acento ou dígito entraria na base e nunca casaria com nada, e a
 * falha seria silenciosa: o app diria "não conheço essa substância" para algo
 * que está cadastrado.
 */

/**
 * Marcas de acentuação, na forma decomposta que `normalize("NFD")` produz.
 *
 * Montado com `new RegExp` sobre uma string ASCII em vez de literal `/[…]/`: o
 * literal exigiria os próprios caracteres combinantes no fonte, que não têm
 * glifo próprio e viram lixo invisível em qualquer edição futura do arquivo.
 * A classe é a mesma; o que muda é o arquivo continuar legível.
 */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Unidades de medida, para apagar tanto a dose quanto a unidade órfã. */
const UNIDADES = "mg|mcg|g|kg|ml|l|ui|iu|un|u";

/**
 * Remove acento, dose, unidade e pontuação de texto livre de rótulo/cadastro.
 *
 * Os dígitos saem porque é isso que apaga a dose ("Metformina 850 mg" e
 * "Metformina 500 mg" precisam colapsar no mesmo texto). O efeito colateral é
 * que a força não distingue produtos — "vitamina D3" e "vitamina D" viram a
 * mesma coisa. Para uma base de interação isso é aceitável: a interação é da
 * substância, não da apresentação.
 */
export function normalizeSubstanceText(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(DIACRITICOS, "")
      .toLowerCase()
      .replace(new RegExp(`\\d+([.,]\\d+)?\\s*(${UNIDADES})\\b`, "g"), " ")
      .replace(/\d+/g, " ")
      .replace(/[^a-z\s]/g, " ")
      // Segunda passada nas unidades, agora que a pontuação virou espaço.
      // "Lantus SoloStar 100 UI/mL": a primeira passada come "100 UI", a barra
      // vira espaço e sobra um "ml" solto. Unidade órfã é ruído que pode casar
      // como palavra inteira com alias curto — o alias de ácido alfa-lipoico é
      // "ala", de três letras.
      .replace(new RegExp(`\\b(${UNIDADES})\\b`, "g"), " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * true se `alias` aparece em `haystack` delimitado por início/fim de palavra.
 *
 * Percorre TODAS as ocorrências, não só a primeira. Parar na primeira é o tipo
 * de erro que falha para o lado errado: em "berberinax berberina" o primeiro
 * "berberina" está colado num sufixo e seria rejeitado, e a ocorrência real
 * logo adiante nunca seria olhada — alerta grave existente na base e não
 * disparado. Num app de saúde o falso negativo é o custo alto.
 */
export function containsAlias(haystack: string, alias: string): boolean {
  if (!alias) return false;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(alias, from);
    if (i === -1) return false;
    const after = i + alias.length;
    const beforeOk = i === 0 || haystack[i - 1] === " ";
    const afterOk = after === haystack.length || haystack[after] === " ";
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
}
