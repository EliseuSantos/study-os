## ADDED Requirements

### Requirement: Retenção alvo dinâmica por data de prova

Um objetivo com `target_date` PODE ser vinculado a uma trilha (`goals.track_id`);
quando vinculado, o scheduler SHALL usar retenção alvo em rampa para os cards
daquela trilha: 0.90 até 30 dias da prova, subindo linearmente até 0.95 na data
(`retentionForDate(examAt, now)`, pura, testada). Sem vínculo, permanece 0.90.

#### Scenario: intervalos encurtam na reta final

- **WHEN** a prova vinculada está a 10 dias e um card da trilha é avaliado com 3
- **THEN** o intervalo resultante é calculado com retenção ≈ 0.933 e fica mais
  curto do que seria com 0.90

#### Scenario: sem prova, nada muda

- **WHEN** a trilha não tem objetivo com data vinculado
- **THEN** o scheduler usa 0.90 como sempre

### Requirement: Vínculo objetivo↔trilha na UI

O formulário de objetivo SHALL permitir escolher uma trilha (opcional,
SelectSearch); o detalhe da trilha mostra a prova vinculada ("prova em 45 dias")
quando existir.

#### Scenario: vincular na criação

- **WHEN** o usuário cria "prova TRF" com data e trilha
- **THEN** o objetivo aparece na página de objetivos com a trilha e o cabeçalho
  da trilha mostra a contagem regressiva
