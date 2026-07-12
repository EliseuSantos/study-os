## ADDED Requirements

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
("amanhã chegam ≈ 40 revisões — quer reservar 30min a mais?") com ação de criar
o bloco na agenda e ação de dispensar; o tom segue o princípio anti-culpa.

#### Scenario: sugerir e aceitar

- **WHEN** a projeção de amanhã é 40 e o usuário aceita a sugestão (testid
  `forecast-accept`)
- **THEN** um bloco de revisão de 30min é criado na agenda de amanhã e a
  sugestão some

#### Scenario: dispensar sem culpa

- **WHEN** o usuário dispensa (testid `forecast-dismiss`)
- **THEN** a sugestão não reaparece para aquele dia e nada é registrado contra
  o usuário
