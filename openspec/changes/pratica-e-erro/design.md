# Design: pratica-e-erro

## Context

Revisão usa FSRS-5 no core com `recordReview` no repo; `review_logs` é local-only
(sem updated_at, não sincroniza). Cards têm `kind` livre ('basic' hoje, 'quiz' nas
aulas). Stats agregam `ReviewSlice`/`SessionSlice`; acurácia vem do autorrelato em
`sessions.questions_*`. M8 introduz `cards.source_ref`.

## Goals / Non-Goals

**Goals:**

- Erro registrado vira revisão agendada sem passo extra.
- Prática de teste medida dentro do app, por tópico.
- Pontos de atenção funcional com uso real (reviews de card).
- Avaliação com consequência visível e reversível.

**Non-Goals:**

- Banco de questões importado de fontes externas (fora de escopo; via share/aulas).
- Estatística de confiabilidade psicométrica das questões.
- Undo de mais de um passo (só a última avaliação).

## Decisions

1. **Erro é um card, não uma entidade nova.** `kind='error'` + `source_ref`
   `{kind:'error'}` reutiliza toda a máquina (FSRS, fila, sync, painéis). Lista de
   erros = query por kind. Zero migração além do M8.
2. **Undo por snapshot, não por inversa.** Antes de `recordReview`, o estado FSRS
   anterior segue com o resultado (retorno da função); desfazer regrava o snapshot
   via `localWrite` e apaga o `review_log` local por id. Sem tentar inverter a
   matemática do scheduler.
3. **Preview de intervalo é o próprio scheduler.** `previewIntervals(state)` roda
   `rate(state, r)` para r=1..4 em modo puro e devolve os `due_at` — nenhuma
   duplicação de fórmula.
4. **Quiz grava sessão, não tabela nova.** O placar agregado entra em
   `sessions` (type='questions', topic_id, questions_total/correct) — já
   sincronizada e já lida pelas stats. Origem "medida" = sessão com
   `notes='quiz'` (marcador barato, sem migração).
5. **`ReviewSlice.topic_id`**: join no SELECT de stats-queries
   (`LEFT JOIN cards ON review_logs.ref_id = cards.id AND ref_kind='card'`,
   COALESCE com ref_id quando ref_kind='topic').

## Risks / Trade-offs

- `review_logs` local-only: undo não propaga para outros devices (aceito — o log
  não sincroniza por design; o estado FSRS sim, e é ele que importa).
- Marcar origem de quiz em `notes` é convenção, não schema — documentada no spec;
  se crescer, migra para coluna própria depois.
- Cards de erro com enunciado longo: o card view já rola; sem tratamento especial.
