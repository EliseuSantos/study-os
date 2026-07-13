# Proposal: quiz-authoring

## Why

Substitui o antigo `add-question-bank`, superado pelo M9: uma tabela `questions`
separada viraria um segundo modelo de dados para o que os cards `kind='quiz'` já
representam (JSON congelado `{"q","options","answer"}`, prática por tópico com
acurácia medida, erros virando revisão). O que o M9 NÃO entregou — e este change
recorta — é a autoria: hoje cards quiz só nascem de aulas ou de snapshots
importados; professor e autodidata não conseguem criar questões direto na trilha,
nem ver quais questões a turma/eles mesmos mais erram.

## What Changes

- **Autoria de questão no CardsPanel**: alternador basic/quiz no formulário de
  novo card; modo quiz mostra enunciado + 2–5 alternativas + select da correta
  (UI 1-based, dado 0-based) e grava card `kind='quiz'`.
- **Edição** de cards quiz existentes (mesmo formulário).
- **Estatística por questão**: taxa de erro local por card quiz ("errada em 40%
  das tentativas · 5 tentativas") agregada de `question_attempts` local-only
  (sem `updated_at`, nunca sincroniza — como `review_logs`); o TopicQuiz do M9
  passa a registrar um attempt por resposta.
- **Prática por trilha**: além do quiz por tópico (M9), botão "praticar" no
  nível da trilha roda todos os cards quiz (filtro por tópico opcional).

## Capabilities

### New Capabilities

- `quiz-authoring`: criação/edição de cards quiz na trilha e estatística de
  erro por questão.

### Modified Capabilities

- `topic-quiz`: a sessão de prática registra `question_attempts` por resposta
  (novo efeito colateral observável) e ganha a variante por trilha.

## Impact

- Migração: tabela `question_attempts` (local-only, fora de SYNCED_TABLES).
- `packages/db`: repo attempts + agregação; `apps/pwa`: CardsPanel (form quiz),
  TopicQuiz (gravar attempts, modo trilha), aba erros inalterada.
- Aproveita integralmente os primitivos do M9 — sem tabela `questions`.
