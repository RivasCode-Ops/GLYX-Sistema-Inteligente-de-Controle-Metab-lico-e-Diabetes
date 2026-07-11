import Link from "next/link";

export const metadata = {
  title: "Privacidade — GLYX",
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-12 md:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
        Política de Privacidade
      </h1>
      <p className="mt-2 text-sm text-zinc-500">GLYX — Controle metabólico · atualizada em 11/07/2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7 text-zinc-300">
        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">Quais dados coletamos</h2>
          <p>
            Ao usar o GLYX você registra voluntariamente dados de saúde: leituras de glicemia,
            refeições, medicações, sessões de exercício, texto de exames laboratoriais e métricas de
            bem-estar (passos, sono). Também guardamos seu nome e e-mail para autenticação. Dados de
            saúde são considerados <strong>dados pessoais sensíveis</strong> pela LGPD (Lei
            13.709/2018) e são tratados com base no seu consentimento explícito, dado no cadastro.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">Como usamos</h2>
          <p>
            Os dados servem exclusivamente para exibir seu histórico, gerar alertas e correlações
            dentro do app, e — quando você aciona funções de IA (chat, foto de refeição,
            interpretação de exames) — o conteúdo enviado é processado por um provedor de modelo de
            linguagem para gerar a resposta. Não vendemos nem compartilhamos seus dados para fins de
            marketing.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">Onde ficam armazenados</h2>
          <p>
            Os dados residem em banco PostgreSQL gerenciado (Supabase, região São Paulo), com
            isolamento por usuário (Row Level Security): cada conta só acessa os próprios registros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">Seus direitos (LGPD)</h2>
          <p>
            Você pode solicitar acesso, correção, exportação ou exclusão definitiva dos seus dados a
            qualquer momento pelo e-mail do responsável indicado abaixo. A exclusão da conta remove
            todos os registros vinculados de forma irreversível.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">Aviso importante</h2>
          <p>
            O GLYX organiza informações e oferece conteúdo educativo. <strong>Não é dispositivo
            médico, não faz diagnóstico e não substitui avaliação profissional.</strong> Decisões
            sobre medicação e tratamento cabem ao seu médico.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium text-zinc-100">Contato do responsável</h2>
          <p>
            Dúvidas ou solicitações sobre dados:{" "}
            <a href="mailto:rivaldo.alexandre.ra@gmail.com" className="text-emerald-400 hover:underline">
              rivaldo.alexandre.ra@gmail.com
            </a>
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-emerald-400 hover:underline">
          ← Voltar ao início
        </Link>
      </p>
    </main>
  );
}
