-- Alias de MARCA que faltava, achado medindo a base contra os itens realmente
-- cadastrados (08/09/2026, com as sete migrations já em produção).
--
-- O QUE APARECEU: "Addera D3 14.000 UI" normaliza para `addera d ui` — o
-- normalizador remove dígitos, que é o que apaga a dose. Os aliases de
-- `vitamina_d3` são 'vitamina d' e 'colecalciferol', e nenhum casa com o nome
-- de marca. Resultado: o app diz "não conheço esta substância" sobre algo que
-- ele CONHECE e classificou de propósito como sem interação na base.
--
-- Não é risco de liberar o que deveria alertar — erra para o lado cauteloso.
-- Mas é exatamente a distinção que esta fatia existe para manter: "conheço e
-- não achei nada" tem que ser diferente de "não conheço". Com o alias faltando,
-- as duas frases colapsam numa só.
--
-- POR QUE SÓ ESTE ALIAS, e não os outros oito não reconhecidos: adicionar uma
-- substância nova à base é AFIRMAR algo clínico sobre ela — no mínimo, que as
-- interações curadas são as que estão lá. Creatina, taurina, melatonina,
-- magnésio e proteína de soja não estão na base, e pô-las com zero interações
-- faria o app dizer "conheço e não achei nada" sobre curadoria que ninguém fez.
-- Isso é decisão clínica, não de implementação, e fica declarada em aberto.
--
-- `addera` é seguro porque não introduz classe nem interação nova: apenas liga
-- um nome de marca a um canônico JÁ curado, e o próprio rótulo do produto diz
-- o que ele é (colecalciferol, vitamina D3).
insert into public.substance_aliases (canonical, alias) values
  ('vitamina_d3','addera')
on conflict (canonical, alias) do nothing;
