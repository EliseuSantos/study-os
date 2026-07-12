# review-session Specification

## Purpose
TBD - created by archiving change pratica-e-erro. Update Purpose after archive.
## Requirements
### Requirement: Preview de intervalo nos botões de avaliação

Os quatro botões de avaliação da revisão SHALL exibir o intervalo resultante de
cada nota (ex.: "1 · de novo · 10min", "4 · fácil · 12d"), calculado por
`previewIntervals(state)` no core (função pura, testada) antes de avaliar.

#### Scenario: preview visível

- **WHEN** a resposta de um card é revelada
- **THEN** cada botão mostra rótulo e intervalo previsto para aquela nota

### Requirement: Desfazer última avaliação

A sessão de revisão SHALL oferecer desfazer da última avaliação (testid
`review-undo`, atalho `z`): o estado FSRS anterior do card é restaurado, o
`review_log` correspondente é removido e o card volta à frente da fila.

#### Scenario: desfazer um toque errado

- **WHEN** o usuário avalia com 1 por engano e aciona desfazer
- **THEN** o card reaparece imediatamente com o estado anterior intacto e o
  contador da sessão regride em 1

