## ADDED Requirements

### Requirement: Porquês de primeira vez

O sistema SHALL mostrar, na primeira interação com cada mecanismo (fila do dia,
revisão, ciclo, streak), uma linha calma explicando o porquê da técnica (ex.:
revisão — "revisar no limite do esquecimento fixa mais com menos tempo"), com
ação "entendi" que a dispensa para sempre (flag `why_<mecanismo>` em settings,
local-only, nunca sincronizada).

#### Scenario: primeira revisão

- **WHEN** o usuário abre a revisão pela primeira vez
- **THEN** a linha do porquê aparece acima do card (testid `why-note`) e some
  para sempre após "entendi"

#### Scenario: nunca repete

- **WHEN** a flag já foi marcada
- **THEN** o porquê não renderiza
