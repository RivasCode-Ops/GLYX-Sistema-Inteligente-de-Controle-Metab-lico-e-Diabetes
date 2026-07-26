import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ScreenPreview } from "@/components/help/screen-preview";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Ajuda — GLYX" };

/**
 * Manual do usuário, dentro do próprio app. Cada seção mostra um mockup
 * estático (dados fictícios, sem exigir login) do que a tela real parece —
 * pensado pra alguém que nunca usou o GLYX entender rápido, tela por tela.
 */
export default function AjudaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">📖 Manual do usuário</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Um guia rápido de cada tela do GLYX. Toque num item pra abrir — os exemplos abaixo usam
          dados fictícios, só pra mostrar como cada tela funciona.
        </p>
        <p className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          ⚠️ O GLYX organiza dados e dá orientações educativas — <strong>não substitui avaliação
          médica</strong>. Ajuste de dose, diagnóstico e conduta clínica são sempre responsabilidade
          do seu médico.
        </p>
      </div>

      <CollapsibleSection title="🚪 Entrar e instalar" defaultOpen description="Login, convite, PWA">
        <p className="text-sm text-zinc-300">
          Entre com e-mail e senha, ou pelo atalho <strong>&quot;Continuar com Google&quot;</strong>.
          O cadastro exige um <strong>código de convite</strong>. Se aparecer &quot;conta não
          autorizada&quot;, seu e-mail ainda não foi liberado — fale com quem administra o app.
        </p>
        <ScreenPreview label="glyx.app/login">
          <div className="text-center">
            <p className="text-xs font-semibold text-emerald-400">GLYX</p>
            <p className="text-sm font-medium text-zinc-100">Controle metabólico</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-300">Entrar</p>
            <div className="space-y-2">
              <div className="h-8 rounded-lg border border-zinc-800 bg-zinc-950" />
              <div className="h-8 rounded-lg border border-zinc-800 bg-zinc-950" />
              <Button disabled size="sm" className="w-full">
                Entrar
              </Button>
              <Button disabled variant="outline" size="sm" className="w-full">
                Continuar com Google
              </Button>
            </div>
          </div>
        </ScreenPreview>
        <p className="text-xs text-zinc-500">
          Depois de entrar, procure &quot;📱 Instalar o GLYX como aplicativo no celular&quot; pra
          adicionar na tela inicial com ícone próprio e notificações.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="🏠 Hoje (Dashboard)" description="Resumo do seu dia">
        <p className="text-sm text-zinc-300">
          Tela inicial com o resumo rápido: última glicemia, carboidratos e água do dia, minutos
          ativos, progresso de macros vs. meta, e alertas não lidos.
        </p>
        <ScreenPreview label="/dashboard">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Última glicemia", value: "118 mg/dL" },
              { label: "Carboidratos hoje", value: "92 g" },
              { label: "Minutos ativos", value: "38 min" },
              { label: "Água", value: "1.2 / 2 L" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-[11px] text-zinc-500">{item.label}</p>
                <p className="text-sm font-medium text-zinc-100">{item.value}</p>
              </div>
            ))}
          </div>
        </ScreenPreview>
      </CollapsibleSection>

      <CollapsibleSection title="🩸 Glicemia" description="Registro, sensor automático, tendências">
        <p className="text-sm text-zinc-300">
          Registre manualmente ou conecte um sensor (FreeStyle Libre ou Dexcom, em{" "}
          <strong>Conexões</strong>) pra sincronização automática a cada ~15 minutos. Veja também
          histórico, gráfico de tendências de 14 dias com previsão, pressão arterial e o teste
          público de risco (ADA).
        </p>
        <ScreenPreview label="/glicemia">
          <ul className="divide-y divide-zinc-800/70 text-sm">
            {[
              { time: "07:10", value: "104 mg/dL", tag: "jejum" },
              { time: "13:20", value: "137 mg/dL", tag: "pós-prandial" },
              { time: "21:00", value: "121 mg/dL", tag: "noite" },
            ].map((r) => (
              <li key={r.time} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs text-zinc-500">{r.time}</span>
                <span className="text-zinc-200">{r.value}</span>
                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-500">
                  {r.tag}
                </span>
              </li>
            ))}
          </ul>
        </ScreenPreview>
        <p className="text-xs text-zinc-500">
          Diferença de alguns pontos com o app oficial do sensor é normal — o GLYX sincroniza a cada
          ~15 min, e a glicemia varia entre uma sincronização e outra.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="🍽️ Alimentação" description="Refeições, foto, montar prato">
        <p className="text-sm text-zinc-300">
          Registre manualmente ou envie uma <strong>foto</strong> — a IA estima calorias, macros e
          carga glicêmica, e sugere a ordem ideal de consumo. Você sempre revisa antes de salvar. Em{" "}
          <strong>Montar prato</strong>, fotos da geladeira/despensa viram sugestão de refeição.
        </p>
        <ScreenPreview label="/alimentacao">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-sm font-medium text-zinc-100">Almoço mediterrâneo</p>
            <p className="text-xs text-zinc-500">Arroz integral, frango grelhado, salada e azeite.</p>
            <div className="mt-2 flex gap-3 text-[11px] text-zinc-400">
              <span>620 kcal</span>
              <span>58g carbo</span>
              <span>42g proteína</span>
              <span>carga glicêmica ~21</span>
            </div>
          </div>
        </ScreenPreview>
      </CollapsibleSection>

      <CollapsibleSection title="💊 Medicação" description="Doses de hoje, cadastro, calculadora, alarmes">
        <p className="text-sm text-zinc-300">
          <strong>Doses de hoje</strong> mostra os horários do dia em ordem, com status (tomada /
          adiada / agendada / pendente) — toque em &quot;Marcar como tomada&quot; a qualquer momento,
          mesmo bem depois do horário. <strong>Meus medicamentos</strong> guarda cadastro, foto do
          rótulo e estoque. A <strong>calculadora</strong> apoia o cálculo de bolus (bloqueada durante
          hipoglicemia).
        </p>
        <ScreenPreview label="/medicacao — Doses de hoje">
          <ul className="divide-y divide-zinc-800/70">
            <li className="flex items-center gap-2 py-2.5 text-sm">
              <span className="w-12 shrink-0 font-mono text-zinc-400">07:00</span>
              <span className="min-w-0 flex-1 text-zinc-200">Metformina · 500 mg</span>
              <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                ✓ tomada às 07:12
              </span>
            </li>
            <li className="flex items-center gap-2 py-2.5 text-sm">
              <span className="w-12 shrink-0 font-mono text-zinc-400">12:30</span>
              <span className="min-w-0 flex-1 text-zinc-200">Vitamina D · 2000 UI</span>
              <Button disabled variant="outline" size="sm" className="shrink-0">
                Marcar como tomada
              </Button>
            </li>
            <li className="flex items-center gap-2 py-2.5 text-sm">
              <span className="w-12 shrink-0 font-mono text-zinc-400">19:00</span>
              <span className="min-w-0 flex-1 text-zinc-200">Metformina · 500 mg</span>
              <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-500">
                mais tarde
              </span>
            </li>
          </ul>
        </ScreenPreview>
        <p className="text-xs text-zinc-500">
          Alarme chega por notificação, com os botões <strong>&quot;✅ Já tomei&quot;</strong> e{" "}
          <strong>&quot;⏰ Adiar 15min&quot;</strong> — direto na tela de bloqueio, sem abrir o app. Se
          você usa o GLYX em mais de um aparelho, responda num só pra não se confundir com
          notificação duplicada.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="🏋️ Exercícios" description="Sessões, plano, recuperação muscular">
        <p className="text-sm text-zinc-300">
          Registre sessões reais (tipo, duração, intensidade), acompanhe seu plano de treino guiado
          pela recuperação dos grupos musculares trabalhados.
        </p>
        <ScreenPreview label="/exercicios">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-sm font-medium text-zinc-100">Caminhada rápida</p>
            <p className="text-xs text-zinc-500">38 min · intensidade moderada · ~210 kcal</p>
          </div>
        </ScreenPreview>
      </CollapsibleSection>

      <CollapsibleSection
        title="📏 Composição corporal"
        description="Medidas, fotos, metas e leitura de músculo x gordura"
      >
        <p className="text-sm text-zinc-300">
          A balança não separa músculo de gordura — 15 circunferências, dobras cutâneas (opcionais,
          exigem adipômetro) e fotos de progresso separam. Em <strong>Medidas</strong> você registra
          com fita métrica; em <strong>Metas</strong> define alvos por medida e o app projeta prazo
          no ritmo observado; em <strong>Histórico</strong> vê a evolução de cada uma.
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          O resumo cruza tudo: peso × cintura diz se o ganho foi magro ou com gordura, o volume
          semanal por grupo muscular diz se o treino comporta a meta, e a leitura da IA junta isso
          com glicemia, sono e alimentação.
        </p>
        <ScreenPreview label="/composicao">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="text-sm font-medium text-emerald-200">Recomposição corporal</p>
            <p className="text-xs text-zinc-400">
              Peso +1,2 kg com cintura −2 cm: ganhar peso reduzindo cintura é o padrão de ganho de
              músculo com perda de gordura.
            </p>
          </div>
        </ScreenPreview>
        <p className="mt-2 text-xs text-zinc-500">
          Percentual de gordura por fita ou dobra é estimativa (erro de 3 a 4 pontos) e serve pra
          acompanhar a sua tendência, não pra comparar com exame. Diferença de até 1 cm entre
          medições é erro de fita — o app trata como estabilidade.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="📊 Análise" description="Resumo, correlações, linha do tempo, alertas">
        <p className="text-sm text-zinc-300">
          Consolida as visões retrospectivas em abas: mapa de risco (<strong>Resumo</strong>),
          relações encontradas nos seus dados (<strong>Correlações</strong>), histórico cronológico
          (<strong>Linha do tempo</strong>) e hiper/hipoglicemia identificadas (<strong>Alertas</strong>).
        </p>
        <ScreenPreview label="/analise — Correlações">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-sm font-medium text-amber-200">Almoço com maior carga glicêmica</p>
            <p className="text-xs text-zinc-400">
              Nos dias com mais de 55g de carboidratos no almoço, a média da tarde subiu 18 mg/dL.
            </p>
          </div>
        </ScreenPreview>
      </CollapsibleSection>

      <CollapsibleSection title="🧪 Exames" description="Cadastro, interpretação por IA, evolução">
        <p className="text-sm text-zinc-300">
          Cole o texto do laudo, envie foto ou PDF — a IA transcreve, explica os termos e sugere
          perguntas pro médico (educativo, não é laudo). Com 2 ou mais exames do mesmo parâmetro
          (ex.: colesterol), o GLYX já monta um gráfico de evolução sozinho.
        </p>
        <ScreenPreview label="/exames — Evolução">
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-zinc-300">
                Colesterol total <span className="text-zinc-500">(mg/dL)</span>
              </span>
              <span className="text-zinc-500">jan/2026 → jun/2026</span>
            </div>
            <svg viewBox="0 0 300 70" className="w-full rounded-lg border border-zinc-800 bg-zinc-950/50">
              <rect x="8" y="10" width="284" height="20" fill="#34d399" fillOpacity={0.08} />
              <path d="M8,15 L150,35 L292,50" fill="none" stroke="#38bdf8" strokeWidth={2} />
              <circle cx="8" cy="15" r="2.5" fill="#38bdf8" />
              <circle cx="150" cy="35" r="2.5" fill="#38bdf8" />
              <circle cx="292" cy="50" r="4" fill="#34d399" />
            </svg>
            <p className="mt-1 text-[11px] text-zinc-500">-32 mg/dL desde o primeiro registro</p>
          </div>
        </ScreenPreview>
      </CollapsibleSection>

      <CollapsibleSection title="👤 Perfil" description="Metabólico, corpo & peso, conta">
        <p className="text-sm text-zinc-300">
          Em abas: <strong>Metabólico</strong> (foco escolhido, metas), <strong>Corpo &amp; peso</strong>{" "}
          (dados corporais, evolução do peso, viabilidade da meta por IA) e <strong>Conta</strong>{" "}
          (login, instalar app, exportar/apagar dados).
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="🔌 Conexões" description="Sensor de glicemia (CGM) e Google Fit">
        <p className="text-sm text-zinc-300">
          Conecte seu sensor FreeStyle Libre (login LibreLinkUp) ou Dexcom, e/ou o Google Fit — a
          sincronização passa a rodar sozinha em segundo plano.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="🤖 Copiloto de IA metabólica" description="Chat flutuante, em qualquer tela">
        <p className="text-sm text-zinc-300">
          Ícone de chat disponível em qualquer tela — converse sobre seus dados (glicemia,
          alimentação, exames, medicação) com contexto do seu histórico. Apoio educativo, não é
          consulta médica.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="🔒 Seus dados" description="Exportar, apagar, privacidade (LGPD)">
        <p className="text-sm text-zinc-300">
          Em <strong>Perfil → Conta</strong>: exportar todos os seus dados (segredos de conexão do
          sensor ficam ocultos), ou apagar seus registros e fotos. A conta de login só é removida
          mediante contato direto, por segurança.
        </p>
      </CollapsibleSection>
    </div>
  );
}
