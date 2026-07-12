# Design: orquestracao-e-orientacao

## Context

O scheduler FSRS usa `DESIRED_RETENTION` constante de params.ts. O planner
(`replan`/`allocateSchedule`) desconhece fsrs_state. Goals têm target_date desde
M8-goals; settings é local-only. O registro pós-sessão já existe no /study.

## Goals / Non-Goals

**Goals:**

- Tornar visível (e acionável) a carga futura de revisões.
- Intervalos sensíveis à proximidade da prova, por trilha.
- Ensinar o porquê uma única vez, sem tutorial bloqueante.

**Non-Goals:**

- Replanejamento automático de blocos pela carga (só sugestão).
- Otimização de pesos FSRS por usuário.
- Editor/álbum de explicações (é lista simples no tópico).

## Decisions

1. **Forecast é leitura pura de fsrs_state** (`due_at` por dia) — nenhuma
   dependência do planner; a UI compõe os dois. Limiar de sugestão fixo (30) em
   constants para calibrar depois.
2. **Retenção por chamada, não global**: o scheduler ganha parâmetro opcional
   `desiredRetention` (default 0.9). O repo resolve a retenção da trilha do card
   (goal vinculado → rampa) e injeta. Params continuam constantes.
3. **Rampa linear 0.90→0.95 nos últimos 30 dias** — simples, explicável e
   reversível; teto 0.95 evita explosão de reviews.
4. **Porquês em settings local-only** (`why_queue`, `why_review`, `why_cycle`,
   `why_streak`) — não sincronizam: cada device apresenta uma vez (aceito).
5. **Elaboração usa `sessions.notes`** — campo já existe e sincroniza; painel do
   tópico filtra sessões com notes não-nulo. Zero migração.
6. **Única migração**: `goals.track_id` TEXT NULL (sincronizada; LWW linha cheia
   já cobre).

## Risks / Trade-offs

- Rampa por trilha cria intervalos heterogêneos entre trilhas — é o objetivo,
  mas o preview de intervalo (M9) precisa usar a mesma retenção resolvida para
  não mentir.
- Sugestão de bloco cria rotina pontual (não recorrente) — o modelo de rotina
  atual é semanal; decisão: criar rotina de ocorrência única via rrule de um dia
  OU um bloco ad-hoc na agenda; resolvido na implementação a favor do mais
  simples que preserve o replan.
- Forecast em trilhas grandes: query agregada por dia (GROUP BY) — barata.
