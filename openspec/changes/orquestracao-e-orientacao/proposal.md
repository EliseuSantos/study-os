# Proposal: orquestracao-e-orientacao (M10)

## Why

Os dois cérebros do StudyOS não conversam: o planner aloca blocos sem saber a
carga de revisões que o FSRS vai despejar, e a retenção alvo é fixa (0.9) mesmo
com prova marcada. Além disso, o app aplica técnicas que o usuário leigo não
entende — sem o "porquê", a fila do dia parece burocracia e o loop se perde.

## What Changes

- **Planner ciente do FSRS**: a agenda e o Hoje mostram a carga de revisões
  projetada por dia (contagem de cards com due naquele dia); quando a fila
  projetada de um dia excede um limiar calmo, o Hoje sugere (sem impor) um bloco
  extra de revisão.
- **Modo reta final**: um objetivo com data alvo vinculado a uma trilha ajusta a
  retenção alvo do FSRS daquela trilha numa rampa (0.9 → 0.95 nos últimos 30
  dias), encurtando intervalos perto da prova.
- **Porquês contextuais**: primeira vez em cada mecanismo (fila, streak, ciclo,
  revisão) mostra uma linha calma explicando o porquê, dispensável e nunca
  repetida (flags em settings, local-only).
- **Elaboração pós-sessão**: ao encerrar uma sessão de estudo, prompt opcional
  "explique em 2 frases o que estudou" grava a explicação como nota da sessão e
  a lista no painel do tópico.

## Capabilities

### New Capabilities

- `review-load-forecast`: projeção de carga de revisões por dia e sugestão calma
  de bloco extra.
- `exam-mode`: retenção alvo dinâmica por data de prova (objetivo ↔ trilha).
- `contextual-why`: microexplicações de primeira vez por mecanismo.
- `post-session-elaboration`: prompt de auto-explicação pós-sessão.

### Modified Capabilities

- (nenhuma — os specs existentes não formalizam planner/FSRS; os contratos
  nascem nestes novos capabilities)

## Impact

- `packages/core`: `forecastReviewLoad(states, horizon)` puro; rampa de retenção
  `retentionForDate(examAt, now)`; scheduler aceita retenção alvo por chamada.
- `packages/db`: goals ganham `track_id` NULLABLE (migração pequena, sincronizada)
  para vincular prova↔trilha; flags de porquês em `settings` (local-only).
- `apps/pwa`: carga projetada na agenda (linha discreta por dia) e no Hoje;
  sugestão de bloco; prompt pós-sessão no registro; microcopy dos porquês.
- Sem breaking changes; retenção padrão permanece 0.9 sem data de prova.
