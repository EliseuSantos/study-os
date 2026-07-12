## ADDED Requirements

### Requirement: Auto-explicação pós-sessão

Ao encerrar uma sessão de estudo com tópico definido, o registro SHALL oferecer
o campo opcional "explique em 2 frases o que você estudou" (testid
`elaboration-input`); o texto é gravado em `sessions.notes` e listado no painel
do tópico como "suas explicações", mais recente primeiro. Pular é sempre
possível e não gera aviso.

#### Scenario: explicar e reencontrar

- **WHEN** o usuário encerra sessão de teoria no tópico T e escreve a explicação
- **THEN** a sessão guarda o texto e o painel do tópico T lista a explicação com
  a data

#### Scenario: pular sem fricção

- **WHEN** o usuário encerra a sessão e ignora o campo
- **THEN** o registro conclui normalmente, sem lembrete posterior
