import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Detector de algoritmo criptográfico — inventário e trava, escrito aqui dentro.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO UMA FERRAMENTA DE TERCEIRO
 * ---------------------------------------------------------------------------
 * As ferramentas do gênero (crypto-scanner, cryptoscan, Crypto Finder, o
 * crypto-detector da Wind River) fazem varredura de linguagem genérica e
 * entregam um relatório de UMA VEZ. O que este projeto precisa é diferente em
 * duas coisas: precisa rodar em todo `npm run verify`, e precisa conhecer as
 * regras DESTE código — que segredo se compara em tempo constante, que
 * credencial de saúde é cifrada com AEAD, que chave se deriva com KDF.
 *
 * Relatório externo envelhece no dia seguinte ao commit. Teste reprova o
 * próximo commit. É o mesmo motivo pelo qual o `rose` reservado, o fuso
 * obrigatório e a migration reexecutável viraram teste em vez de convenção.
 *
 * O inventário fica em `docs/CBOM.md`, gerado por este teste — fonte no código,
 * artefato gerado, como o resto do projeto.
 */

const RAIZES = ["app", "lib", "components", "supabase"];

function arquivos(dir: string, out: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return out;
  }
  for (const nome of entradas) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, out);
    else if (/\.(ts|tsx|sql)$/.test(nome)) out.push(caminho);
  }
  return out;
}

function fonte(): { arq: string; texto: string }[] {
  const out: { arq: string; texto: string }[] = [];
  for (const raiz of RAIZES) {
    for (const arq of arquivos(join(process.cwd(), raiz))) {
      // O próprio detector cita os nomes que procura.
      // Testes ficam de fora: eles reproduzem formatos antigos e algoritmos
      // depreciados DE PROPÓSITO, para provar que a migração funciona. Um
      // detector que reprova o teste da própria migração impede a correção.
      if (/\.test\.tsx?$/.test(arq)) continue;
      out.push({ arq, texto: readFileSync(arq, "utf8") });
    }
  }
  return out;
}

function rel(arq: string): string {
  return arq.replace(process.cwd(), "").split("\\").join("/").replace(/^\//, "");
}

/**
 * Algoritmos e práticas reprovados.
 *
 * A lista é de coisas QUEBRADAS ou inadequadas ao uso, não de preferências:
 * MD5 e SHA-1 têm colisão prática; DES e RC4 estão quebrados; ECB vaza padrão
 * do texto claro; `createCipher` (sem `iv`) usa derivação de chave obsoleta e
 * foi depreciado no próprio Node; `Math.random` não é gerador criptográfico.
 */
const PROIBIDOS: { nome: string; rx: RegExp; porque: string }[] = [
  { nome: "MD5", rx: /createHash\(\s*["']md5["']/i, porque: "colisão prática desde 2004" },
  { nome: "SHA-1", rx: /createHash\(\s*["']sha1["']/i, porque: "colisão prática desde 2017" },
  {
    nome: "HMAC-MD5 / HMAC-SHA1",
    rx: /createHmac\(\s*["'](md5|sha1)["']/i,
    porque: "hash subjacente quebrado",
  },
  { nome: "DES / 3DES", rx: /["'](des|des-ede3|des3)[-"']/i, porque: "chave curta demais" },
  { nome: "RC4", rx: /["']rc4["']/i, porque: "quebrado" },
  { nome: "Modo ECB", rx: /["'][a-z0-9-]*-ecb["']/i, porque: "vaza padrão do texto claro" },
  {
    nome: "createCipher legado",
    rx: /\bcreateCipher\s*\(|\bcreateDecipher\s*\(/,
    porque: "sem IV e com derivação obsoleta; depreciado no Node",
  },
];

describe("detector de algoritmo criptográfico", () => {
  const arquivosFonte = fonte();

  it("varre um número plausível de arquivos", () => {
    // Se o caminho quebrar, os testes abaixo passariam sobre lista vazia — o
    // falso verde silencioso que o teste de migrations também precisou barrar.
    expect(arquivosFonte.length).toBeGreaterThan(100);
  });

  it.each(PROIBIDOS.map((p) => [p.nome, p] as const))(
    "não usa %s em lugar nenhum",
    (_nome, proibido) => {
      const achados: string[] = [];
      for (const { arq, texto } of arquivosFonte) {
        texto.split("\n").forEach((linha, i) => {
          // Comentário citando o algoritmo não é uso.
          const semComentario = linha.replace(/\/\/.*$/, "").replace(/--.*$/, "");
          if (proibido.rx.test(semComentario)) achados.push(`${rel(arq)}:${i + 1}`);
        });
      }
      expect(achados, `${proibido.nome} — ${proibido.porque}:\n${achados.join("\n")}`).toEqual([]);
    }
  );

  it("toda cifra simétrica usa modo autenticado (AEAD)", () => {
    // Sem autenticação, o texto cifrado pode ser alterado sem que a decifra
    // perceba. Num app que guarda credencial de saúde, isso é adulteração
    // silenciosa — e GCM já é o que o código usa.
    const naoAutenticados: string[] = [];
    for (const { arq, texto } of arquivosFonte) {
      for (const m of texto.matchAll(/create(?:De|de)?[Cc]ipheriv\(\s*["']([^"']+)["']/g)) {
        const alg = m[1].toLowerCase();
        const aead = /-(gcm|ccm|ocb|chacha20-poly1305)$/.test(alg) || alg.includes("chacha20");
        if (!aead) {
          const linha = texto.slice(0, m.index).split("\n").length;
          naoAutenticados.push(`${rel(arq)}:${linha} — ${alg}`);
        }
      }
    }
    expect(naoAutenticados, `Cifra sem autenticação:\n${naoAutenticados.join("\n")}`).toEqual([]);
  });

  it("chave de cifra não é derivada por hash simples", () => {
    // Foi o achado do primeiro inventário: `sha256(secret + sufixo)` alimentava
    // a chave AES das credenciais de CGM e Google Fit. SHA-256 é rápido de
    // propósito, e a velocidade é o problema quando o segredo pode ser uma
    // frase. Hoje a derivação é HKDF; a antiga sobrevive só para LER o que já
    // estava gravado, e o nome dela diz isso.
    const suspeitas: string[] = [];
    for (const { arq, texto } of arquivosFonte) {
      const linhas = texto.split("\n");
      linhas.forEach((linha, i) => {
        if (!/createHash\(\s*["']sha\d+["']\)[\s\S]{0,80}\.digest\(\)/.test(linha)) return;
        const contexto = linhas.slice(Math.max(0, i - 6), i + 3).join("\n");
        // Só interessa quando o resultado vira CHAVE de cifra.
        const viraChave = /\bkey\b|deriveCredKey|deriveKey/i.test(contexto);
        const ehLegado = /legacy|legado|Legacy/.test(contexto);
        if (viraChave && !ehLegado) suspeitas.push(`${rel(arq)}:${i + 1}`);
      });
    }
    expect(
      suspeitas,
      `Chave de cifra derivada por hash simples — use hkdfSync ou scryptSync:\n${suspeitas.join("\n")}`
    ).toEqual([]);
  });

  it("comparação de segredo é em tempo constante", () => {
    // Comparar segredo com === vaza o comprimento do prefixo correto pelo tempo
    // de resposta. O app já tem `secretsMatch`; o que este teste impede é a
    // próxima rota nascer sem ele.
    const inseguras: string[] = [];
    for (const { arq, texto } of arquivosFonte) {
      const linhas = texto.split("\n");
      linhas.forEach((linha, i) => {
        // Comentário de linha E de bloco. `constant-time.ts` documenta "nunca
        // `===`" e seria acusado pela própria frase que ensina a regra.
        if (/^\s*[*]/.test(linha) || /^\s*\/[*]/.test(linha)) return;
        const semComentario = linha.replace(/\/\/.*$/, "");
        if (!/[!=]==/.test(semComentario)) return;

        // O risco existe quando se compara um segredo ARMAZENADO com um valor
        // que veio de fora: aí o tempo de resposta vira oráculo, e o atacante
        // descobre o prefixo correto byte a byte.
        //
        // Dois campos do MESMO formulário — nova senha e confirmação — não são
        // isso: quem digitou já conhece os dois, e não há o que descobrir. Sem
        // esta distinção o detector acusaria cinco lugares corretos no primeiro
        // uso, e um detector que grita falso positivo deixa de ser lido.
        const contexto = linhas.slice(Math.max(0, i - 4), i + 1).join("\n");
        if (!/process\.env\.[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)/.test(contexto)) return;

        // Comparar com vazio, nulo, booleano ou número não é conferir segredo.
        if (/[!=]==\s*(""|''|null|undefined|true|false|\d)/.test(semComentario)) return;
        // Ambiente não é segredo: `NODE_ENV === "production"` decide caminho de
        // código, e o valor é público.
        if (/NODE_ENV/.test(semComentario)) return;
        // Comparar duas variáveis de CONFIGURAÇÃO entre si — "o segredo
        // dedicado é diferente do legado?" — não tem ninguém do outro lado
        // medindo tempo. O oráculo só existe quando um dos lados veio de fora.
        if (/^\s*(if\s*\()?\s*[a-z]\w*\s*&&\s*[a-z]\w*\s*&&/.test(semComentario)) return;

        inseguras.push(`${rel(arq)}:${i + 1} — ${semComentario.trim().slice(0, 90)}`);
      });
    }
    expect(
      inseguras,
      `Comparação de segredo sem tempo constante — use secretsMatch:\n${inseguras.join("\n")}`
    ).toEqual([]);
  });

  it("gera o inventário em docs/CBOM.md", () => {
    const primitivas = new Map<string, string[]>();
    const RX = [
      /create[Cc]ipheriv\(\s*["']([^"']+)["']/g,
      /createDe[Cc]ipheriv\(\s*["']([^"']+)["']/g,
      /createHash\(\s*["']([^"']+)["']/g,
      /createHmac\(\s*["']([^"']+)["']/g,
      /\b(hkdfSync|scryptSync|pbkdf2Sync|randomBytes|randomUUID|timingSafeEqual)\b/g,
    ];

    for (const { arq, texto } of arquivosFonte) {
      for (const rx of RX) {
        for (const m of texto.matchAll(rx)) {
          const chave = m[1];
          const linha = texto.slice(0, m.index).split("\n").length;
          const lista = primitivas.get(chave) ?? [];
          lista.push(`${rel(arq)}:${linha}`);
          primitivas.set(chave, lista);
        }
      }
    }

    const linhas = [
      "# GLYX — inventário criptográfico (CBOM)",
      "",
      "> Gerado por `lib/security/crypto-inventory.test.ts` a cada `npm run verify`.",
      "> Fonte no código, artefato gerado — não editar à mão.",
      "",
      "| primitiva | usos | onde |",
      "|---|---:|---|",
      ...[...primitivas.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([k, v]) => `| \`${k}\` | ${v.length} | ${v.slice(0, 6).join("<br>")} |`),
      "",
      "## O que o detector reprova",
      "",
      ...PROIBIDOS.map((p) => `- **${p.nome}** — ${p.porque}`),
      "- **Cifra sem AEAD** — texto cifrado alterável sem a decifra perceber",
      "- **Chave de cifra derivada por hash simples** — use HKDF ou scrypt",
      "- **Comparação de segredo com `===`** — vaza prefixo correto pelo tempo",
      "",
      "## O que ele não cobre",
      "",
      "Dependências de terceiro (o `package-lock.json` não é varrido aqui),",
      "TLS na borda, e criptografia do lado do Supabase. O escopo é o código",
      "deste repositório.",
      "",
      "---",
      "",
      "**Riva's Alexandre**  © 2026",
      "Todos os direitos reservados.",
      "",
    ];

    writeFileSync(join(process.cwd(), "docs", "CBOM.md"), linhas.join("\n"), "utf8");
    expect(primitivas.size).toBeGreaterThan(0);
  });
});
