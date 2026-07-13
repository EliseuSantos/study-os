## ADDED Requirements

### Requirement: Autoria de cards quiz na trilha

O formulário de card do painel do tópico SHALL oferecer o modo quiz (alternador
basic/quiz, testid `card-kind-toggle`): enunciado, 2–5 alternativas (testid
`quiz-option-input`) e seleção da correta (UI 1-based); salvar grava um card
`kind='quiz'` com `front_md` no JSON congelado `{"q","options","answer"}`
(`answer` 0-based). Cards quiz existentes PODEM ser reabertos no mesmo
formulário para edição.

#### Scenario: criar uma questão

- **WHEN** o usuário alterna o formulário para quiz, preenche enunciado, 3
  alternativas e marca a 2ª como correta
- **THEN** o card salvo tem `kind='quiz'` e `answer` 1, e o botão "praticar"
  do tópico passa a contá-lo

### Requirement: Estatística de erro por questão

O sistema SHALL registrar cada resposta de prática em `question_attempts`
(local-only, nunca sincronizada) e mostrar por card quiz a taxa de erro local
("errada em N% das tentativas · M tentativas") na lista de cards.

#### Scenario: taxa aparece após tentativas

- **WHEN** uma questão é respondida 5 vezes com 2 erros
- **THEN** a lista de cards mostra "errada em 40% das tentativas · 5 tentativas"
