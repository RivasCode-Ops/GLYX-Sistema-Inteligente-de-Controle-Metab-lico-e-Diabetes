import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trava estática das migrations do alarme de 14/10/2026 (GLYX-07, 10, 11, 12).
 *
 * Isto NÃO prova que o SQL funciona — isso é dos testes em supabase/tests/,
 * que precisam de banco de teste (GLYX-03). Prova que os defeitos corrigidos
 * não voltam por edição descuidada do arquivo: cada asserção é um defeito
 * que existiu na definição anterior.
 */

const DIR = join(process.cwd(), "supabase", "migrations");
const ler = (nome: string) => readFileSync(join(DIR, nome), "utf8");
const semComentarios = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

describe("migration do despachante de alarmes", () => {
  const sql = semComentarios(ler("20261015103000_med_alarms_cadencia_e_confiabilidade.sql"));

  it("decide o dia pela cadência", () => {
    expect(sql).toMatch(/public\.med_alarm_is_dose_day\(/);
    expect(sql).toMatch(/p_cadence = 'semanal'/);
    expect(sql).toMatch(/p_cadence = 'intervalo'/);
    expect(sql).toMatch(/from public\.med_alarms_due\(now\(\)\)/);
  });

  it("intervalo nunca dispara antes da âncora (D2)", () => {
    expect(sql).toMatch(/\(p_dose_date - p_anchor\) >= 0/);
  });

  it("rigidez 'livre' não tem alarme implícito, mesmo com horário (D3)", () => {
    expect(sql).toMatch(/timing_strictness is distinct from 'livre'/);
  });

  it("D1: coluna de confirmação sem preenchimento automático, e o despachante não a lê", () => {
    expect(sql).toMatch(/alter table public\.medications add column if not exists cadence_confirmed_at timestamptz;/);
    expect(sql).not.toMatch(/update\s+public\.medications/i);
    // Só a criação da coluna e o comentário: nenhuma função depende dela.
    expect(sql.match(/cadence_confirmed_at/g)).toHaveLength(2);
  });

  it("não compara time com time + intervalo (dá a volta à meia-noite)", () => {
    expect(sql).not.toMatch(/::time\s*\+\s*interval/);
    expect(sql).toMatch(/\(d\.dose_date \+ h\.hora\) at time zone h\.tz/);
  });

  it("valida o horário antes do cast, dentro de CASE", () => {
    expect(sql).toMatch(/case when rt\.t ~ '\^\(\[01\]\?\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$' then rt\.t::time end/);
  });

  it("fuso inválido não derruba o envio de todos", () => {
    expect(sql).toMatch(/pg_timezone_names/);
    expect(sql).not.toMatch(/at time zone p\.timezone/);
  });

  it("adiamento só com medicamento do mesmo usuário", () => {
    expect(sql).toMatch(/join public\.medications m on m\.id = s\.medication_id and m\.user_id = s\.user_id/);
  });

  it("reivindica com skip locked e limita tentativas e validade", () => {
    expect(sql).toMatch(/for update skip locked/);
    expect(sql).toMatch(/l\.attempts < 3/);
    expect(sql).toMatch(/interval '4 minutes'/);
    expect(sql).toMatch(/interval '30 minutes'/);
  });

  it("manda identificador de despacho e tag por dose para a rota", () => {
    expect(sql).toMatch(/'dispatchId', l\.id::text/);
    expect(sql).toMatch(/'tag', 'glyx-' \|\| l\.kind/);
  });

  it("URL vem do Vault, nunca escrita por extenso", () => {
    expect(sql).toMatch(/public\.app_base_url\(\) \|\| '\/api\/push\/dispatch'/);
    expect(sql).not.toMatch(/vercel\.app/);
  });

  it("nenhuma função nova fica executável pela API", () => {
    for (const fn of ["glyx_fuso_valido", "med_alarm_is_dose_day", "med_alarms_due", "dispatch_med_alarms"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    }
  });

  it("status novo nasce 'enviado' para os despachantes que não confirmam", () => {
    expect(sql).toMatch(/add column if not exists status text not null default 'enviado'/);
  });
});

describe("migration das policies de dono do medicamento", () => {
  const sql = semComentarios(ler("20261015100000_filhos_de_medications_mesmo_dono.sql"));

  it.each(["medication_snoozes", "medication_logs"])("%s exige medicamento próprio na gravação", (tabela) => {
    const bloco = sql.slice(sql.indexOf(`on public.${tabela}`));
    expect(bloco).toMatch(/with check \(\s*auth\.uid\(\) = user_id\s*and/);
    expect(bloco).toMatch(/m\.user_id = auth\.uid\(\)/);
  });
});

describe("migration de dose única prospectiva (D14, opção B)", () => {
  const sql = semComentarios(ler("20261015101000_medication_logs_dose_unica.sql"));
  const doseUnica = sql.indexOf("create unique index medication_logs_dose_confirmada_unica");

  it("não escolhe a data de corte sozinha: lê o parâmetro da sessão e para se ele faltar", () => {
    expect(sql).toMatch(/corte text := nullif\(btrim\(current_setting\('glyx\.corte_dose_unica', true\)\), ''\);/);
    expect(sql).toMatch(/if corte is null then\s+raise exception/);
    // Nenhum instante escrito no arquivo: o mesmo arquivo serve para qualquer corte.
    expect(sql).not.toMatch(/corte\s+(constant\s+)?text\s*:=\s*'\d{4}-/);
    expect(sql).not.toContain("DEFINIR_NA_IMPLANTACAO");
  });

  it("exige fuso explícito, valor legível e dentro do intervalo esperado", () => {
    expect(sql).toMatch(/if corte !~ '\(Z\|\[\+-\]\[0-9\]\{2\}\(:\?\[0-9\]\{2\}\)\?\)\$' then\s+raise exception/);
    expect(sql).toMatch(/corte_ts := corte::timestamptz;\s+exception when others then\s+raise exception/);
    expect(sql).toMatch(/if corte_ts < timestamptz '2026-10-15' or corte_ts > now\(\) \+ interval '1 day' then\s+raise exception/);
  });

  it("deixa o corte usado registrado no próprio índice", () => {
    expect(sql).toMatch(/comment on index public\.medication_logs_dose_confirmada_unica is %L/);
  });

  it("o corte é pela CRIAÇÃO do registro, não pela data clínica, e só restringe confirmação com dose prevista", () => {
    expect(sql).toMatch(/where confirmed and scheduled_for is not null and created_at >= %L::timestamptz/);
    expect(sql).not.toMatch(/taken_at >=/);
  });

  it("confere repetição DEPOIS do corte e falha com mensagem antes de criar o índice", () => {
    const checagem = sql.indexOf("created_at >= corte_ts");
    expect(checagem).toBeGreaterThan(-1);
    expect(sql.lastIndexOf("raise exception", doseUnica)).toBeGreaterThan(checagem);
    expect(doseUnica).toBeGreaterThan(-1);
  });

  it("não apaga nem altera registro existente", () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.medication_logs/i);
    expect(sql).not.toMatch(/update\s+public\.medication_logs/i);
  });

  it("created_at vem do relógio do banco e não muda depois — o cliente não contorna o corte", () => {
    expect(sql).toMatch(/if tg_op = 'INSERT' then\s+new\.created_at := now\(\);/);
    expect(sql).toMatch(/new\.created_at := old\.created_at;/);
    expect(sql).toMatch(/before insert or update on public\.medication_logs/);
  });

  it("correção guarda o valor anterior; o cliente não escreve o histórico", () => {
    expect(sql).toMatch(/new\.correcoes := old\.correcoes \|\| jsonb_build_array/);
    expect(sql).toMatch(/'taken_at_anterior', old\.taken_at/);
    expect(sql).toMatch(/new\.correcoes := '\[\]'::jsonb;/);
  });

  it("D15: o autor vem da identidade validada no banco, nunca de coluna do cliente", () => {
    expect(sql).toMatch(/'por', auth\.uid\(\)/);
    expect(sql).toMatch(/'papel', coalesce\(\s*nullif\(current_setting\('request\.jwt\.claim\.role', true\), ''\)/);
    expect(sql).not.toMatch(/'por', new\./);
  });

  it("apagar o medicamento continua anulando medication_id (o gatilho não o trava)", () => {
    expect(sql).not.toMatch(/new\.medication_id := old\.medication_id/);
  });

  it("reenvio da mesma ação: índice do pedido só onde há pedido", () => {
    expect(sql).toMatch(/create unique index if not exists medication_logs_pedido_unico\s+on public\.medication_logs \(user_id, client_request_id\)\s+where client_request_id is not null;/);
  });

  it("aceita o rótulo `adicional` sem perder os anteriores", () => {
    expect(sql).toMatch(/check \(adherence_status in \('no_horario', 'atrasado', 'fora_janela', 'avulso', 'adicional'\)\)/);
  });
});

