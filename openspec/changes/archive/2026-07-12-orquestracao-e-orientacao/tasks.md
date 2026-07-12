## 1. Core

- [x] 1.1 `forecastReviewLoad(dues, horizonDays)` pura + testes
- [x] 1.2 `retentionForDate(examAt, now)` (rampa 0.90→0.95/30d) + scheduler com
      `desiredRetention` opcional + testes (incl. preview M9 coerente)

## 2. Dados

- [x] 2.1 Migração `goals.track_id` NULL + row type + repo patch
- [x] 2.2 Query agregada de due por dia (GROUP BY) no repo fsrs
- [x] 2.3 Flags `why_*` em settings (helpers get/set)

## 3. UI

- [x] 3.1 Carga projetada na agenda (linha por dia) e no Hoje (amanhã)
- [x] 3.2 Sugestão de bloco extra (aceitar/dispensar, testids
      `forecast-accept/dismiss`), criando bloco na agenda
- [x] 3.3 Objetivo com trilha (SelectSearch) + contagem regressiva no cabeçalho
      da trilha
- [x] 3.4 Porquês de primeira vez (testid `why-note`) nos 4 mecanismos
- [x] 3.5 Campo de elaboração no registro pós-sessão + lista "suas explicações"
      no painel do tópico

## 4. Fechamento

- [x] 4.1 e2e: forecast→aceitar bloco; prova vinculada muda intervalo; porquê
      aparece uma vez; elaboração aparece no tópico
- [x] 4.2 Sync specs + validação
