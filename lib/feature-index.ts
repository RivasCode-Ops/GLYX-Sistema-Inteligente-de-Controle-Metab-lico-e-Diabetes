/**
 * Índice de funções do app — onde cada coisa mora.
 *
 * Nasceu de uma pergunta que não tinha resposta: "me mostra o catálogo de
 * exercícios" e a IA respondendo que não tinha acesso. Ela estava certa. O
 * copiloto recebe um resumo dos DADOS do usuário e nada sobre as TELAS, então
 * qualquer pergunta de localização caía no vazio.
 *
 * Este índice é a fonte única dos dois lados dessa lacuna: alimenta a lupa da
 * barra superior e entra no contexto do chat. Um só lugar para editar, senão a
 * busca e a IA passam a dar respostas diferentes para a mesma pergunta — e a
 * errada é sempre a que ninguém lembrou de atualizar.
 *
 * O índice cobre mais que rotas de propósito. Boa parte do que o usuário chama
 * de "função" não tem endereço próprio: o catálogo de exercícios é um campo
 * dentro de um formulário, o alarme é um bloco dentro da tela de medicamentos.
 * Indexar só `mainNav` e `moduleSubNav` responderia exatamente às perguntas que
 * o usuário não precisa fazer.
 */

export type Feature = {
  /** Nome como o usuário chamaria. */
  title: string;
  /** Para onde levar. Quando a função não é uma tela, é a tela que a contém. */
  href: string;
  /** Caminho legível até ela, do módulo à seção. */
  where: string[];
  /** Uma linha do que ela faz — lida pelo usuário na lupa e pela IA no contexto. */
  what: string;
  /**
   * Como o usuário pode chamar a função quando não sabe o nome que o app usa.
   * É o que separa uma busca útil de uma que só acha quem já sabia o termo:
   * "lista de exercícios", "supino" e "que exercício eu faço" têm que levar ao
   * catálogo, e nenhum desses é o título dele.
   */
  terms: string[];
};

export const FEATURES: Feature[] = [
  // ── Glicemia ───────────────────────────────────────────────────────────────
  {
    title: "Registrar glicemia",
    href: "/glicemia",
    where: ["Glicemia", "Visão geral"],
    what: "Anota uma medição de glicemia com contexto (jejum, pós-refeição) e observação.",
    terms: ["glicose", "açúcar no sangue", "medir", "dextro", "ponta de dedo", "mg/dl"],
  },
  {
    title: "Histórico de glicemia",
    href: "/glicemia/historico",
    where: ["Glicemia", "Histórico"],
    what: "Todas as leituras em lista, com filtro por período.",
    terms: ["leituras antigas", "ver tudo", "passado"],
  },
  {
    title: "Pressão arterial",
    href: "/glicemia/pressao",
    where: ["Glicemia", "Pressão"],
    what: "Registro de pressão arterial e frequência cardíaca.",
    terms: ["pressão alta", "hipertensão", "batimento", "cardíaco", "sístole", "diástole"],
  },

  // ── Alimentação ────────────────────────────────────────────────────────────
  {
    title: "Registrar refeição",
    href: "/alimentacao",
    where: ["Alimentação", "Refeições"],
    what: "Anota o que comeu, com carboidrato estimado e horário.",
    terms: ["comida", "comi", "almoço", "jantar", "café da manhã", "lanche", "carboidrato"],
  },
  {
    title: "Refeição por foto",
    href: "/alimentacao/foto",
    where: ["Alimentação", "Por foto"],
    what: "Fotografa o prato e a IA estima os alimentos e o carboidrato.",
    terms: ["foto do prato", "câmera", "tirar foto da comida", "ia da comida"],
  },
  {
    title: "Montar prato",
    href: "/alimentacao/montar-prato",
    where: ["Alimentação", "Montar prato"],
    what: "Sugere uma combinação de prato a partir do que você tem, pensando no pico de glicemia.",
    terms: ["o que comer", "sugestão de refeição", "cardápio", "bancada", "despensa"],
  },

  // ── Medicação ──────────────────────────────────────────────────────────────
  {
    title: "Doses de hoje",
    href: "/medicacao",
    where: ["Medicação", "Doses de hoje"],
    what: "O que tomar agora, o que já foi tomado e o que ficou para trás.",
    terms: ["remédio de hoje", "tomar remédio", "marcar dose", "adesão"],
  },
  {
    title: "Meus medicamentos",
    href: "/medicacao/medicamentos",
    where: ["Medicação", "Meus medicamentos"],
    what: "Cadastro de remédios e suplementos, estoque, foto do rótulo e edição.",
    terms: ["cadastrar remédio", "adicionar medicamento", "suplemento", "rótulo", "bula", "estoque"],
  },
  {
    title: "Alarmes de medicação",
    href: "/medicacao/medicamentos",
    where: ["Medicação", "Meus medicamentos", "Alarmes"],
    what: "Horários de lembrete por remédio, com som próprio para alerta crítico e um teste real.",
    terms: ["lembrete", "notificação", "despertador", "som", "vibrar", "push", "avisar"],
  },
  {
    title: "Calculadora de bolus",
    href: "/medicacao/calculadora",
    where: ["Medicação", "Calculadora"],
    what: "Cálculo educativo de insulina pelos seus parâmetros. Não registra dose e não substitui o médico.",
    terms: ["insulina", "quanto aplicar", "bolus", "correção", "unidades"],
  },

  // ── Exercícios ─────────────────────────────────────────────────────────────
  {
    title: "Registrar treino",
    href: "/exercicios",
    where: ["Exercícios", "Visão geral"],
    what: "Anota a sessão de treino, os grupos musculares e a meta semanal.",
    terms: ["malhei", "academia", "treinei", "caminhada", "corrida", "atividade"],
  },
  {
    title: "Plano de treino",
    href: "/exercicios/plano",
    where: ["Exercícios", "Plano"],
    what: "Divisão da semana guiada pela recuperação de cada músculo.",
    terms: ["divisão", "abc", "push pull", "que treinar hoje", "ficha"],
  },
  {
    title: "Recuperação muscular",
    href: "/exercicios/recuperacao",
    where: ["Exercícios", "Recuperação"],
    what: "Quanto falta para cada grupo estar pronto de novo, e pausa manual quando o corpo pede.",
    terms: ["descanso", "dor muscular", "quando treinar de novo", "pausar músculo"],
  },
  {
    title: "Catálogo de exercícios",
    href: "/exercicios/catalogo",
    where: ["Exercícios", "Catálogo"],
    what: "Os 42 exercícios que o app conhece, por categoria e com o músculo de cada um. Os mesmos aparecem na lista ao registrar carga — escolher da lista é o que faz o app saber qual músculo foi treinado.",
    terms: [
      "lista de exercícios",
      "quais exercícios",
      "supino",
      "agachamento",
      "remada",
      "rosca",
      "leg press",
      "exercícios disponíveis",
      "banco de exercícios",
    ],
  },
  {
    title: "Progressão de carga",
    href: "/exercicios/recuperacao",
    where: ["Exercícios", "Recuperação", "Progressão de carga"],
    what: "Peso × repetições por exercício, com a última vez que você fez o mesmo, para ver se está evoluindo.",
    terms: ["carga", "peso", "quantos quilos", "séries", "repetições", "evolução na academia", "1rm"],
  },

  // ── Composição corporal ────────────────────────────────────────────────────
  {
    title: "Composição corporal",
    href: "/composicao",
    where: ["Composição", "Resumo"],
    what: "Percentual de gordura, massa magra e o resumo do corpo na última medição.",
    terms: ["gordura", "massa magra", "ffmi", "shape", "corpo"],
  },
  {
    title: "Medidas corporais",
    href: "/composicao/medidas",
    where: ["Composição", "Medidas"],
    what: "As 21 medidas de fita e as dobras cutâneas, por data.",
    terms: ["fita métrica", "cintura", "braço", "coxa", "pescoço", "dobras", "adipômetro"],
  },
  {
    title: "Fotos de progresso",
    href: "/composicao/fotos",
    where: ["Composição", "Fotos"],
    what: "Quatro poses por data em bucket privado, com comparação lado a lado e, se você pedir, por IA.",
    terms: ["foto do corpo", "antes e depois", "comparar foto", "espelho", "pose"],
  },
  {
    title: "Metas de corpo",
    href: "/composicao/metas",
    where: ["Composição", "Metas"],
    what: "Meta por medida com projeção de prazo a partir do seu ritmo real.",
    terms: ["meta de peso", "objetivo", "quero chegar", "emagrecer", "ganhar massa"],
  },
  {
    title: "Histórico corporal",
    href: "/composicao/historico",
    where: ["Composição", "Histórico"],
    what: "Evolução de cada medida no tempo, em gráfico.",
    terms: ["evolução do corpo", "gráfico de medidas", "mudou quanto"],
  },

  // ── Análise ────────────────────────────────────────────────────────────────
  {
    title: "Resumo de risco",
    href: "/analise",
    where: ["Análise", "Resumo"],
    what: "Score do mapa de risco metabólico e os fatores que mais pesaram.",
    terms: ["mapa de risco", "score", "estou bem", "risco"],
  },
  {
    title: "Resumo da semana",
    href: "/analise/semana",
    where: ["Análise", "Semana"],
    what: "Sete dias contra os sete anteriores, com destaques e export em texto puro.",
    terms: ["semanal", "tir", "tempo no alvo", "exportar", "levar pro médico", "relatório"],
  },
  {
    title: "Correlações",
    href: "/analise/correlacoes",
    where: ["Análise", "Correlações"],
    what: "O que anda junto com o quê nos seus dados — comida, sono, exercício e glicemia.",
    terms: ["o que causa", "relação", "padrão", "por que subiu"],
  },
  {
    title: "Linha do tempo",
    href: "/analise/linha-do-tempo",
    where: ["Análise", "Linha do tempo"],
    what: "Tudo que aconteceu num dia, em ordem, num só lugar.",
    terms: ["dia a dia", "cronologia", "o que fiz no dia", "diário"],
  },
  {
    title: "Alertas metabólicos",
    href: "/analise/alertas",
    where: ["Análise", "Alertas"],
    what: "O que o app já sinalizou, e por quê.",
    terms: ["avisos", "notificações antigas", "o que o app achou"],
  },

  // ── Conta e dados ──────────────────────────────────────────────────────────
  {
    title: "Exames",
    href: "/exames",
    where: ["Exames"],
    what: "Cadastro de laboratório, ECG e raio-X, leitura por IA e evolução dos parâmetros.",
    terms: ["laboratório", "sangue", "hemoglobina glicada", "hba1c", "colesterol", "resultado", "pdf"],
  },
  {
    title: "Conexões",
    href: "/integracoes",
    where: ["Conexões"],
    what: "Sensor de glicemia (Libre, Dexcom), import por CSV, Google Fit e sono.",
    terms: ["sensor", "cgm", "libre", "dexcom", "sincronizar", "google fit", "relógio", "csv"],
  },
  {
    title: "Perfil metabólico",
    href: "/perfil",
    where: ["Perfil", "Metabólico"],
    what: "Faixa alvo de glicemia e os parâmetros que a calculadora usa.",
    terms: ["faixa alvo", "meta de glicemia", "razão de carboidrato", "fator de correção"],
  },
  {
    title: "Corpo e peso",
    href: "/perfil/corpo",
    where: ["Perfil", "Corpo & peso"],
    what: "Altura, peso-meta, objetivo corporal e o gráfico de peso.",
    terms: ["altura", "peso", "objetivo", "balança"],
  },
  {
    title: "Exportar ou apagar meus dados",
    href: "/perfil/conta",
    where: ["Perfil", "Conta"],
    what: "Export completo e apagamento definitivo, incluindo fotos (LGPD).",
    terms: ["lgpd", "privacidade", "baixar dados", "excluir conta", "deletar", "backup"],
  },
  {
    title: "Diário completo",
    href: "/relatorio-completo",
    where: ["Perfil", "Conta", "Diário completo"],
    what: "Tudo que você registrou desde o primeiro dia, num documento só.",
    terms: ["tudo", "desde o começo", "documento", "histórico completo", "imprimir"],
  },
  {
    title: "Estado do sistema",
    href: "/status",
    where: ["Sistema"],
    what: "Se o sensor está sincronizando, se os alertas saem e o que está configurado.",
    terms: ["está funcionando", "sync parou", "diagnóstico", "erro"],
  },
  {
    title: "Manual do app",
    href: "/ajuda",
    where: ["Ajuda"],
    what: "Explicação tela por tela, do login à privacidade.",
    terms: ["como usar", "tutorial", "não sei mexer", "manual", "socorro", "dúvida"],
  },
];

/** Sem acento, sem maiúscula — "glicemia", "Glicêmia" e "GLICEMIA" são a mesma busca. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export type FeatureMatch = { feature: Feature; score: number };

/**
 * Busca por título, sinônimo e descrição, nessa ordem de peso.
 *
 * A pontuação existe para o resultado certo ficar em primeiro, não para filtrar:
 * quem digita "carga" tem que ver "Progressão de carga" antes de "Catálogo de
 * exercícios", ainda que os dois sejam respostas legítimas.
 */
export function searchFeatures(query: string, features: Feature[] = FEATURES): FeatureMatch[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const matches: FeatureMatch[] = [];

  for (const feature of features) {
    const title = normalize(feature.title);
    let score = 0;

    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;

    if (!score) {
      for (const term of feature.terms) {
        const t = normalize(term);
        if (t === q) {
          score = Math.max(score, 50);
        } else if (t.includes(q) || q.includes(t)) {
          score = Math.max(score, 40);
        }
      }
    }

    // Descrição por último: casar aqui é sinal fraco, mas é o que salva a busca
    // por uma palavra que só aparece na explicação da função.
    if (!score && normalize(feature.what).includes(q)) score = 20;

    // O caminho também conta: quem digita "composicao" espera as telas dela.
    if (!score && feature.where.some((w) => normalize(w).includes(q))) score = 15;

    if (score) matches.push({ feature, score });
  }

  return matches.sort((a, b) => b.score - a.score || a.feature.title.localeCompare(b.feature.title));
}

/** Caminho legível: "Exercícios › Recuperação › Progressão de carga". */
export function formatWhere(feature: Feature): string {
  return feature.where.join(" › ");
}

/**
 * O mesmo índice em texto, para entrar no contexto do chat.
 *
 * Compacto de propósito: é prompt, não documentação, e cresce a cada função
 * nova. Título, caminho e uma linha bastam para a IA responder "onde acho X"
 * sem inventar tela que não existe.
 */
export function featureIndexForPrompt(features: Feature[] = FEATURES): string {
  const linhas = features.map((f) => `- ${f.title} — ${formatWhere(f)} (${f.href}): ${f.what}`);
  return [
    "MAPA DE TELAS DO APP (onde cada função fica). Use para responder perguntas de localização — diga o caminho, não que você não tem acesso. Não invente tela que não esteja nesta lista:",
    ...linhas,
  ].join("\n");
}
