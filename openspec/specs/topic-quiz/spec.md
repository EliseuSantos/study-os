# topic-quiz Specification

## Purpose
TBD - created by archiving change pratica-e-erro. Update Purpose after archive.
## Requirements
### Requirement: Quiz avulso por tópico

O sistema SHALL permitir praticar os cards `kind='quiz'` de um tópico fora de
aulas: o painel do tópico expõe "praticar" (testid `topic-quiz-start`) quando há
pelo menos 1 card quiz; a sessão apresenta uma questão por vez (opções 1-based na
UI, `answer` 0-based no dado), corrige imediatamente com feedback calmo e, ao
final, mostra placar e grava `questions_total/questions_correct` numa sessão do
tipo questões vinculada à trilha/tópico. Cada resposta SHALL também gravar uma
linha em `question_attempts` (card, correta ou não, timestamp — local-only). A
trilha PODE oferecer a prática agregada (todos os tópicos, filtro opcional).

#### Scenario: praticar e pontuar

- **WHEN** o usuário responde 8 de 10 questões corretamente e encerra
- **THEN** o placar "8 de 10" aparece, uma sessão type='questions' é gravada com
  os números, a acurácia da trilha reflete o resultado e 10 linhas de
  `question_attempts` existem

#### Scenario: sem cards quiz

- **WHEN** o tópico não tem cards kind='quiz'
- **THEN** a ação "praticar" não aparece

