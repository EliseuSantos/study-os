# Proposal: pratica-e-erro (M9)

## Why

A prática de teste é, ao lado do espaçamento, a técnica com maior evidência — e
hoje o StudyOS só a oferece dentro de aulas de professor; "questões" no restante
do app é um número autorrelatado no registro da sessão. Pior: o erro do
estudante (o material de estudo mais valioso) evapora — não vira revisão. E o
painel "pontos de atenção" está morto na prática: só considera reviews de
tópico, enquanto o uso real revisa cards.

## What Changes

- **Caderno de erros**: registrar uma questão errada (enunciado + resposta certa
  + comentário opcional, com trilha/tópico) cria automaticamente um card
  `kind='error'` agendado pelo FSRS; a lista de erros é consultável por trilha.
- **Quiz avulso por tópico**: praticar os cards `kind='quiz'` de um tópico fora
  de aulas, com correção imediata; resultados alimentam a acurácia por trilha
  (medida, substituindo progressivamente o autorrelato).
- **Fix pontos de atenção**: `ReviewSlice` passa a carregar o tópico do card
  (join card→topic), de modo que `weakTopics` funcione com uso real.
- **Revisão mais honesta**: os botões 1–4 mostram o intervalo resultante
  ("de novo · 10min", "fácil · 12d") e há **desfazer** da última avaliação.

## Capabilities

### New Capabilities

- `error-log`: caderno de erros com conversão automática em card FSRS.
- `topic-quiz`: sessão de quiz por tópico com correção e acurácia medida.
- `review-session`: contrato da sessão de revisão (preview de intervalo nos
  botões 1–4, desfazer da última avaliação) — primeira formalização em spec.
- `stats-insights`: contrato dos insights (pontos de atenção via card→tópico,
  acurácia medida por quiz) — primeira formalização em spec.

### Modified Capabilities

- (nenhuma — `stats` e `review` ainda não tinham spec formal; nascem aqui)

## Impact

- **Migração**: nada estrutural para erros (card `kind='error'` + `source_ref`
  de M8 reaproveitado com `{kind:'error', note}`); tabela `quiz_results`? Não —
  resultados de quiz gravam `review_logs`-like por card quiz (local) + sessão
  agregada em `sessions.questions_*` (já sincronizada).
- `packages/db`: `ReviewSlice` ganha `topic_id` (join no SELECT — sem migração);
  repo de quiz (listar cards quiz por tópico) e helpers de undo (regravar estado
  FSRS anterior).
- `packages/core`: preview de intervalo = função já existente do scheduler
  exposta como `previewIntervals(state)`; `weakTopics` remove a limitação de
  ref_kind.
- `apps/pwa`: página/fluxo caderno de erros, quiz por tópico (no painel do
  tópico), botões com intervalo + undo na revisão.
- Sem breaking changes.
