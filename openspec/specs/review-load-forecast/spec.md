# review-load-forecast Specification

## Purpose
TBD - created by archiving change orquestracao-e-orientacao. Update Purpose after archive.
## Requirements
### Requirement: Projeção de carga de revisões

O sistema SHALL projetar a carga de revisões por dia (`forecastReviewLoad`:
contagem de fsrs_state com due em cada dia do horizonte, função pura no core) e
exibi-la: na agenda, uma linha discreta por dia ("≈ N revisões"); no Hoje, a
carga de amanhã quando maior que zero.

#### Scenario: agenda mostra a carga

- **WHEN** existem 18 cards com due na quarta-feira
- **THEN** a coluna de quarta mostra "≈ 18 revisões" em type-meta, sem bloquear
  interação

### Requirement: Sugestão calma de bloco extra

Quando a carga projetada de um dia exceder o limiar (30 cards), o Hoje SHALL
sugerir — nunca impor — um bloco extra de revisão: uma linha dispensável
("amanhã chegam ≈ 40 revisões — quer reservar 30min a mais?") com ação de
reservar (cria um lembrete-bloco "bloco extra de revisão · 30min" amanhã, que
aparece na agenda e na fila) e ação de dispensar (por dia, local); o tom segue
o princípio anti-culpa.

#### Scenario: sugerir e aceitar

- **WHEN** a projeção de amanhã é 40 e o usuário aceita a sugestão (testid
  `forecast-accept`)
- **THEN** um lembrete-bloco de revisão (30min) é criado para amanhã — visível
  na agenda e na fila de amanhã — e a sugestão some

#### Scenario: dispensar sem culpa

- **WHEN** o usuário dispensa (testid `forecast-dismiss`)
- **THEN** a sugestão não reaparece para aquele dia e nada é registrado contra
  o usuário

