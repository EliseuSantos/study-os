## ADDED Requirements

### Requirement: Registrar erro vira revisão

O sistema SHALL oferecer o caderno de erros: registrar uma questão errada
(enunciado, resposta correta, comentário opcional, trilha/tópico obrigatórios via
SelectSearch) cria um card `kind='error'` com `front_md` = enunciado, `back_md` =
resposta + comentário, `source_ref` `{kind:'error'}`, que entra como novo no FSRS
e aparece na fila de revisão normalmente.

#### Scenario: registrar um erro

- **WHEN** o usuário registra um erro pelo botão "registrar erro" (testid
  `error-log-open`) e confirma o formulário (testid `error-log-form`)
- **THEN** um card kind='error' é criado no tópico escolhido, toast "erro salvo —
  vira revisão" aparece e o card entra na fila do FSRS como novo

#### Scenario: erros consultáveis por trilha

- **WHEN** o usuário abre a aba "erros" no detalhe da trilha (testid
  `errors-panel`)
- **THEN** vê a lista dos cards kind='error' da trilha com data, tópico e estado
  de revisão (próxima revisão em X dias)

### Requirement: Erro nascido da sessão de estudo

Durante uma sessão do tipo questões, o registro pós-sessão SHALL oferecer o
atalho "registrar erros desta sessão" que abre o formulário do caderno de erros
pré-preenchido com a trilha/tópico da sessão, encadeando um registro por erro.

#### Scenario: fluxo pós-sessão

- **WHEN** o usuário encerra uma sessão de questões com acertos < total
- **THEN** o registro mostra "registrar os N erros?" e cada confirmação cria um
  card de erro sem sair do fluxo
