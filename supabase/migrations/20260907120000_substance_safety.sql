-- Camada determinística de checagem de interação substância × medicamento.
--
-- ORIGEM: o app liberou berberina para um usuário com insulina em uso. Não foi
-- falha de qualidade do modelo — foi falha de arquitetura: quem emitia o
-- veredito de segurança era o LLM. Aqui o veredito passa a ser decidido por
-- regra sobre estas duas tabelas, e o modelo generativo só redige o que já foi
-- decidido.
--
-- Duas tabelas GLOBAIS, sem user_id: leitura para qualquer autenticado, escrita
-- só por service role — a ausência de policy de write já basta. Mesmo padrão de
-- `exercises`. Curadoria é feita por migration, não pelo app: a base de
-- interação é conteúdo clínico e precisa de histórico em git, não de CRUD.
--
-- Por não terem user_id, ficam fora do export e do wipe de LGPD.
--
-- FONTE: base local e curada. A Drug Interaction API do RxNav (NLM) foi
-- descontinuada em 02/01/2024 sem substituto, e as bases que ela usava (ONCHigh,
-- DrugBank não-comercial) são medicamento × medicamento — cobrem mal justamente
-- o par suplemento × medicamento, que é o caso de uso daqui.

-- ---------------------------------------------------------------------------
-- substance_aliases: texto livre normalizado -> slug canônico
-- ---------------------------------------------------------------------------
create table if not exists public.substance_aliases (
  id         uuid primary key default gen_random_uuid(),
  canonical  text not null,
  -- SEMPRE gravado já normalizado: minúsculo, sem acento, sem pontuação,
  -- espaços colapsados. Isso deixa a comparação em runtime ser um contains por
  -- palavra inteira, sem normalizar os dois lados a cada consulta.
  alias      text not null,
  created_at timestamptz not null default now(),
  -- NÃO é `unique (alias)`. Um alias pode legitimamente mapear para mais de um
  -- canônico quando o produto é uma associação: Glyxambi é empagliflozina +
  -- linagliptina e resolve para inibidor_sglt2 E inibidor_dpp4. Com unique só
  -- no alias, a segunda linha do par seria rejeitada e o produto entraria na
  -- base pela metade — meia classe reconhecida é pior que nenhuma, porque o app
  -- passaria a se comportar como se conhecesse o remédio inteiro.
  constraint substance_aliases_pair unique (canonical, alias)
);

create index if not exists substance_aliases_canonical_idx
  on public.substance_aliases (canonical);

alter table public.substance_aliases enable row level security;

-- Reexecutável de propósito: `create policy` e `add constraint` NÃO têm
-- `if not exists` no Postgres. Sem o `drop` antes, aplicar esta migration duas
-- vezes falha — e o retry é o caso COMUM, não o raro: aplicação manual pelo
-- painel, falha no meio de uma sequência de sete, ou rodar de novo por dúvida
-- sobre ter completado. Pior, falharia DEPOIS de já ter criado tabela e índice
-- (que são idempotentes), deixando o estado pela metade.
drop policy if exists "substance_aliases_read" on public.substance_aliases;
create policy "substance_aliases_read" on public.substance_aliases
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- substance_interactions: par canônico -> severidade + mensagem fixa
-- ---------------------------------------------------------------------------
-- Invariante: substance_a < substance_b. A consulta ordena o par antes de
-- buscar, então cada par existe uma única vez e não há como cadastrar A×B e
-- B×A com severidades divergentes.
--
-- O `collate "C"` é deliberado: sem ele a comparação usaria a collation do
-- banco, onde `_` costuma ser ignorado no primeiro nível, e a ordenação do
-- Postgres poderia divergir da comparação por code point que o TypeScript faz
-- em orderPair(). Divergência aqui significa par gravado numa ordem e
-- consultado na outra — ou seja, alerta que existe na base e nunca dispara.
create table if not exists public.substance_interactions (
  id          uuid primary key default gen_random_uuid(),
  substance_a text not null,
  substance_b text not null,
  severity    text not null check (severity in ('grave','moderada','leve')),
  mechanism   text not null,
  message     text not null,
  created_at  timestamptz not null default now(),
  constraint substance_interactions_ordered
    check (substance_a collate "C" < substance_b collate "C"),
  constraint substance_interactions_pair unique (substance_a, substance_b)
);

alter table public.substance_interactions enable row level security;

drop policy if exists "substance_interactions_read" on public.substance_interactions;
create policy "substance_interactions_read" on public.substance_interactions
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed — aliases
-- ---------------------------------------------------------------------------
insert into public.substance_aliases (canonical, alias) values
  -- insulina basal
  ('insulina_basal','lantus'),
  ('insulina_basal','insulina glargina'),
  ('insulina_basal','glargina'),
  ('insulina_basal','toujeo'),
  ('insulina_basal','basaglar'),
  ('insulina_basal','levemir'),
  ('insulina_basal','detemir'),
  ('insulina_basal','tresiba'),
  ('insulina_basal','degludeca'),
  ('insulina_basal','insulina nph'),
  -- insulina rápida
  ('insulina_rapida','fiasp'),
  ('insulina_rapida','insulina asparte'),
  ('insulina_rapida','asparte'),
  ('insulina_rapida','novorapid'),
  ('insulina_rapida','humalog'),
  ('insulina_rapida','lispro'),
  ('insulina_rapida','apidra'),
  ('insulina_rapida','glulisina'),
  ('insulina_rapida','insulina regular'),
  -- antidiabéticos orais / injetáveis
  ('inibidor_sglt2','empagliflozina'),
  ('inibidor_sglt2','jardiance'),
  ('inibidor_sglt2','dapagliflozina'),
  ('inibidor_sglt2','forxiga'),
  ('inibidor_dpp4','linagliptina'),
  ('inibidor_dpp4','trayenta'),
  ('inibidor_dpp4','sitagliptina'),
  ('inibidor_dpp4','januvia'),
  ('metformina','metformina'),
  ('metformina','glifage'),
  ('metformina','glucoformin'),
  ('sulfonilureia','glibenclamida'),
  ('sulfonilureia','glimepirida'),
  ('sulfonilureia','amaryl'),
  ('sulfonilureia','gliclazida'),
  ('sulfonilureia','diamicron'),
  ('agonista_glp1','semaglutida'),
  ('agonista_glp1','ozempic'),
  ('agonista_glp1','liraglutida'),
  ('agonista_glp1','victoza'),
  ('agonista_glp1','tirzepatida'),
  ('agonista_glp1','mounjaro'),
  -- Associação: resolve para as DUAS classes componentes. É a razão de o unique
  -- ser (canonical, alias) e não só (alias).
  ('inibidor_sglt2','glyxambi'),
  ('inibidor_dpp4','glyxambi'),
  -- outras classes
  ('estatina','sinvastatina'),
  ('estatina','atorvastatina'),
  ('estatina','rosuvastatina'),
  ('estatina','lipitor'),
  ('estatina','crestor'),
  ('anticoagulante','varfarina'),
  ('anticoagulante','marevan'),
  ('anticoagulante','rivaroxabana'),
  ('anticoagulante','xarelto'),
  ('anticoagulante','apixabana'),
  ('anticoagulante','eliquis'),
  -- suplementos
  ('berberina','berberina'),
  ('berberina','berberine'),
  ('berberina','cloridrato de berberina'),
  ('cromo_picolinato','picolinato de cromo'),
  ('cromo_picolinato','cromo picolinato'),
  ('gymnema','gymnema'),
  ('gymnema','gymnema sylvestre'),
  ('acido_alfa_lipoico','acido alfa lipoico'),
  ('acido_alfa_lipoico','ala'),
  ('feno_grego','feno grego'),
  ('feno_grego','fenugreek'),
  ('melao_sao_caetano','melao de sao caetano'),
  ('melao_sao_caetano','momordica'),
  ('canela_cassia','canela cassia'),
  ('canela_cassia','cinnamomum cassia'),
  ('hiperico','hiperico'),
  ('hiperico','erva de sao joao'),
  -- Entram de propósito SEM nenhuma linha de interação. São o que permite o
  -- checador distinguir "conheço e não achei nada" de "não conheço" — a
  -- distinção que faltava quando o app liberou a berberina.
  --
  -- Note que o alias é 'vitamina d' e 'omega', sem o dígito: normalizeSubstanceText
  -- remove números (é o que apaga a dose, "500 mg"), então um alias gravado como
  -- 'vitamina d3' jamais casaria com o texto normalizado do lado de cá. O
  -- invariante que garante isso está em lib/safety/seed-invariants.test.ts:
  -- todo alias precisa ser ponto fixo do normalizador.
  ('vitamina_d3','vitamina d'),
  ('vitamina_d3','colecalciferol'),
  ('omega3','omega'),
  ('omega3','oleo de peixe')
on conflict (canonical, alias) do nothing;

-- ---------------------------------------------------------------------------
-- Seed — interações
-- ---------------------------------------------------------------------------
insert into public.substance_interactions
  (substance_a, substance_b, severity, mechanism, message) values

  ('anticoagulante','berberina','grave',
   'Berberina pode aumentar o efeito anticoagulante.',
   'Berberina junto de anticoagulante aumenta risco de sangramento. Não combine sem avaliação médica e acompanhamento laboratorial.'),

  ('berberina','estatina','moderada',
   'Berberina inibe CYP3A4 e glicoproteína-P, vias de metabolismo e transporte de várias estatinas.',
   'Berberina pode alterar a concentração da sua estatina no sangue. Comunique ao seu médico antes de iniciar.'),

  ('berberina','inibidor_dpp4','moderada',
   'Somatória de efeito hipoglicemiante.',
   'Berberina soma efeito hipoglicemiante ao seu antidiabético. Monitore a glicemia com mais frequência e avise seu médico.'),

  ('berberina','inibidor_sglt2','moderada',
   'Somatória de efeito hipoglicemiante.',
   'Berberina soma efeito hipoglicemiante ao seu antidiabético. Monitore a glicemia com mais frequência e avise seu médico.'),

  ('berberina','insulina_basal','grave',
   'Berberina potencializa o efeito hipoglicemiante da insulina.',
   'RISCO DE HIPOGLICEMIA GRAVE. Berberina potencializa o efeito da insulina. Não inicie por conta própria — fale com seu médico antes.'),

  ('berberina','insulina_rapida','grave',
   'Berberina potencializa o efeito hipoglicemiante da insulina.',
   'RISCO DE HIPOGLICEMIA GRAVE. Berberina potencializa o efeito da insulina. Não inicie por conta própria — fale com seu médico antes.'),

  ('berberina','metformina','moderada',
   'Somatória de efeito hipoglicemiante.',
   'Berberina soma efeito hipoglicemiante à metformina. Monitore a glicemia e avise seu médico.'),

  ('berberina','sulfonilureia','grave',
   'Somatória de efeito hipoglicemiante com sulfonilureia.',
   'RISCO DE HIPOGLICEMIA GRAVE. Não inicie berberina junto de sulfonilureia sem avaliação médica.'),

  ('canela_cassia','insulina_basal','moderada',
   'Efeito hipoglicemiante aditivo.',
   'Canela cássia em dose de suplemento pode somar efeito hipoglicemiante à insulina. Monitore a glicemia.'),

  ('canela_cassia','insulina_rapida','moderada',
   'Efeito hipoglicemiante aditivo.',
   'Canela cássia em dose de suplemento pode somar efeito hipoglicemiante à insulina. Monitore a glicemia.'),

  ('cromo_picolinato','insulina_basal','moderada',
   'Pode aumentar a sensibilidade à insulina.',
   'Picolinato de cromo pode aumentar a sensibilidade à insulina e favorecer queda de glicemia. Monitore e avise seu médico.'),

  ('cromo_picolinato','insulina_rapida','moderada',
   'Pode aumentar a sensibilidade à insulina.',
   'Picolinato de cromo pode aumentar a sensibilidade à insulina e favorecer queda de glicemia. Monitore e avise seu médico.'),

  ('acido_alfa_lipoico','insulina_basal','moderada',
   'Efeito hipoglicemiante aditivo.',
   'Ácido alfa-lipoico pode somar efeito hipoglicemiante à insulina. Monitore a glicemia.'),

  ('acido_alfa_lipoico','insulina_rapida','moderada',
   'Efeito hipoglicemiante aditivo.',
   'Ácido alfa-lipoico pode somar efeito hipoglicemiante à insulina. Monitore a glicemia.'),

  ('estatina','hiperico','grave',
   'Hipérico é indutor potente de CYP3A4 e reduz a concentração de vários medicamentos.',
   'Erva-de-são-joão reduz o efeito de vários medicamentos, incluindo estatinas. Não use sem avaliação médica.'),

  ('feno_grego','insulina_basal','moderada',
   'Efeito hipoglicemiante aditivo.',
   'Feno-grego pode somar efeito hipoglicemiante à insulina. Monitore a glicemia.'),

  ('feno_grego','insulina_rapida','moderada',
   'Efeito hipoglicemiante aditivo.',
   'Feno-grego pode somar efeito hipoglicemiante à insulina. Monitore a glicemia.'),

  ('gymnema','insulina_basal','grave',
   'Efeito hipoglicemiante marcado, aditivo à insulina.',
   'RISCO DE HIPOGLICEMIA. Gymnema sylvestre tem efeito hipoglicemiante próprio. Não inicie junto de insulina sem avaliação médica.'),

  ('gymnema','insulina_rapida','grave',
   'Efeito hipoglicemiante marcado, aditivo à insulina.',
   'RISCO DE HIPOGLICEMIA. Gymnema sylvestre tem efeito hipoglicemiante próprio. Não inicie junto de insulina sem avaliação médica.'),

  ('insulina_basal','melao_sao_caetano','grave',
   'Efeito hipoglicemiante marcado, aditivo à insulina.',
   'RISCO DE HIPOGLICEMIA. Melão-de-são-caetano tem efeito hipoglicemiante próprio. Não inicie junto de insulina sem avaliação médica.'),

  ('insulina_rapida','melao_sao_caetano','grave',
   'Efeito hipoglicemiante marcado, aditivo à insulina.',
   'RISCO DE HIPOGLICEMIA. Melão-de-são-caetano tem efeito hipoglicemiante próprio. Não inicie junto de insulina sem avaliação médica.')
on conflict (substance_a, substance_b) do nothing;
