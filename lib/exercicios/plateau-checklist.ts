/**
 * Checklist de platô — a ORDEM é o produto.
 *
 * Quando a carga para de subir com volume dentro da faixa, a saída fácil é
 * mandar somar série. É errada com frequência: comer pouco, dormir mal, faltar
 * dose, treinar sempre em grupo ainda em recuperação e executar mal produzem o
 * mesmo sintoma, e nenhum deles se resolve com mais volume — somar série em cima
 * de qualquer um dos cinco piora o quadro.
 *
 * Por isso volume é o ÚLTIMO item, sempre, e a lista não se reordena por
 * gravidade: reordenar devolveria o volume ao topo no dia em que ele fosse o
 * único com número ruim, que é exatamente o atalho que esta lista existe para
 * fechar.
 *
 * ---------------------------------------------------------------------------
 * "Sem dado" é resposta, e é diferente de "está bem"
 * ---------------------------------------------------------------------------
 * Três dos sete itens dependem de coisas que o app ainda não registra. Omiti-los
 * faria a lista parecer completa e dar o volume como conclusão de uma
 * investigação que nunca aconteceu. Eles aparecem, dizem que não há dado e
 * dizem onde o dado nasceria.
 */

export type ItemEstado = "ok" | "atencao" | "sem_dado";

export type ItemDoChecklist = {
  id: "alimentacao" | "sono" | "adesao" | "recuperacao" | "esforco" | "execucao" | "volume";
  titulo: string;
  estado: ItemEstado;
  detalhe: string;
};

export type EntradaDoChecklist = {
  /** Proteína média por quilo na janela; null sem refeição ou sem peso. */
  proteinaPorKg: number | null;
  /** Alvo de proteína em g/kg do objetivo do usuário; null sem objetivo. */
  alvoProteinaPorKg: number | null;
  /** Média de kcal por dia na janela contra a meta; null sem dado. */
  kcalMedia: number | null;
  kcalAlvo: number | null;
  /** Horas de sono médias na janela, de `health_snapshots`; null sem integração. */
  sonoHoras: number | null;
  /** Doses registradas ÷ doses previstas na janela (0-1); null sem medicamento. */
  adesao: number | null;
  /** Grupos ainda em recuperação e grupos pausados, agora. */
  gruposEmRecuperacao: number;
  gruposPausados: number;
  gruposTotais: number;
  /** Séries/semana do grupo em questão e o piso da faixa. */
  volumeSetsPorSemana: number;
  volumePiso: number;
};

/** Abaixo disto, a proteína é candidata melhor que o volume para explicar o platô. */
const PROTEINA_MINIMA_RELATIVA = 0.8;
/** Déficit médio maior que isto, em quem tenta ganhar, explica carga parada. */
const DEFICIT_RELEVANTE = 0.9;
/** Média abaixo disto por várias noites derruba performance de força. */
const SONO_MINIMO_HORAS = 6.5;
/** Adesão abaixo disto deixa de ser ruído de registro. */
const ADESAO_MINIMA = 0.8;

function pct(x: number): number {
  return Math.round(x * 100);
}

export function montarChecklistDePlato(e: EntradaDoChecklist): ItemDoChecklist[] {
  const itens: ItemDoChecklist[] = [];

  // 1. Alimentação
  if (e.proteinaPorKg == null && e.kcalMedia == null) {
    itens.push({
      id: "alimentacao",
      titulo: "Alimentação",
      estado: "sem_dado",
      detalhe:
        "Sem refeições registradas na janela para comparar proteína e energia. Registre em Alimentação por alguns dias antes de mexer no treino.",
    });
  } else {
    const proteinaBaixa =
      e.proteinaPorKg != null &&
      e.alvoProteinaPorKg != null &&
      e.proteinaPorKg < e.alvoProteinaPorKg * PROTEINA_MINIMA_RELATIVA;
    const energiaBaixa =
      e.kcalMedia != null && e.kcalAlvo != null && e.kcalMedia < e.kcalAlvo * DEFICIT_RELEVANTE;

    const partes: string[] = [];
    if (e.proteinaPorKg != null) {
      partes.push(
        `proteína ${e.proteinaPorKg.toFixed(1)} g/kg${
          e.alvoProteinaPorKg != null ? ` (alvo ${e.alvoProteinaPorKg.toFixed(1)})` : ""
        }`
      );
    }
    if (e.kcalMedia != null) {
      partes.push(
        `${Math.round(e.kcalMedia)} kcal/dia${e.kcalAlvo != null ? ` de ${e.kcalAlvo}` : ""}`
      );
    }

    itens.push({
      id: "alimentacao",
      titulo: "Alimentação",
      estado: proteinaBaixa || energiaBaixa ? "atencao" : "ok",
      detalhe:
        proteinaBaixa || energiaBaixa
          ? `Média da janela: ${partes.join(" · ")}. Carga parada com ${
              proteinaBaixa ? "proteína" : "energia"
            } abaixo do alvo raramente se resolve somando série.`
          : `Média da janela: ${partes.join(" · ")}.`,
    });
  }

  // 2. Sono
  itens.push(
    e.sonoHoras == null
      ? {
          id: "sono",
          titulo: "Sono",
          estado: "sem_dado",
          detalhe:
            "O app só tem sono quando há integração de saúde conectada. Sem ela, este item fica em branco em vez de ser dado como resolvido.",
        }
      : {
          id: "sono",
          titulo: "Sono",
          estado: e.sonoHoras < SONO_MINIMO_HORAS ? "atencao" : "ok",
          detalhe:
            e.sonoHoras < SONO_MINIMO_HORAS
              ? `Média de ${e.sonoHoras.toFixed(1)} h por noite na janela. Abaixo de ${SONO_MINIMO_HORAS} h a força para de responder mesmo com treino e dieta certos.`
              : `Média de ${e.sonoHoras.toFixed(1)} h por noite na janela.`,
        }
  );

  // 3. Adesão
  itens.push(
    e.adesao == null
      ? {
          id: "adesao",
          titulo: "Adesão ao treino e à medicação",
          estado: "sem_dado",
          detalhe: "Sem medicamento com horário cadastrado para medir adesão na janela.",
        }
      : {
          id: "adesao",
          titulo: "Adesão ao treino e à medicação",
          estado: e.adesao < ADESAO_MINIMA ? "atencao" : "ok",
          detalhe: `${pct(e.adesao)}% das doses previstas foram registradas na janela.${
            e.adesao < ADESAO_MINIMA
              ? " Dose que não entra muda o controle metabólico, e controle metabólico muda a resposta ao treino."
              : ""
          } A conta usa os horários cadastrados hoje: medicamento incluído no meio da janela distorce o denominador.`,
        }
  );

  // 4. Recuperação
  const emRisco = e.gruposEmRecuperacao + e.gruposPausados;
  itens.push({
    id: "recuperacao",
    titulo: "Recuperação",
    estado: emRisco > e.gruposTotais / 2 ? "atencao" : "ok",
    detalhe: `${e.gruposEmRecuperacao} de ${e.gruposTotais} grupos ainda em recuperação${
      e.gruposPausados > 0 ? ` e ${e.gruposPausados} em pausa manual` : ""
    }. Treinar sempre em cima de grupo que não recuperou produz carga parada com volume alto.`,
  });

  // 5. Esforço
  itens.push({
    id: "esforco",
    titulo: "Intensidade e esforço",
    estado: "sem_dado",
    detalhe:
      "O app ainda não registra RIR nem esforço percebido por série. Sem isso não dá para separar 10 repetições com duas de sobra de 10 repetições no limite — que produzem resultados diferentes com o mesmo número na planilha.",
  });

  // 6. Execução
  itens.push({
    id: "execucao",
    titulo: "Técnica e execução",
    estado: "sem_dado",
    detalhe:
      "O app ainda não registra qualidade de execução. Carga que sobe com execução piorando aparece como progressão e não é.",
  });

  // 7. Volume — sempre por último, e nunca reordenado.
  itens.push({
    id: "volume",
    titulo: "Volume",
    estado: e.volumeSetsPorSemana < e.volumePiso ? "atencao" : "ok",
    detalhe:
      e.volumeSetsPorSemana < e.volumePiso
        ? `${e.volumeSetsPorSemana} séries/semana, abaixo do piso de ${e.volumePiso}. Aqui o volume é candidato de verdade.`
        : `${e.volumeSetsPorSemana} séries/semana, dentro da faixa (piso ${e.volumePiso}). Mexer no volume é o último passo, depois de descartar o que está acima.`,
  });

  return itens;
}

/** Os itens que apontam causa provável, na ordem da lista — nunca reordenados. */
export function causasProvaveis(itens: ItemDoChecklist[]): ItemDoChecklist[] {
  return itens.filter((i) => i.estado === "atencao");
}
