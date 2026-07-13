# Design: quiz-authoring

## Context

M9 entregou prática por tópico sobre cards `kind='quiz'` (JSON congelado) e
acurácia medida via sessões `notes='quiz'`. Cards quiz só nascem de aulas ou
snapshots. `review_logs` é o precedente de tabela local-only.

## Goals / Non-Goals

**Goals:** autoria/edição de questões onde os cards moram; taxa de erro por
questão sem tocar o protocolo de sync; prática por trilha reusando o TopicQuiz.

**Non-Goals:** banco de questões separado (tabela `questions` do change antigo —
descartada); estatística agregada de turma (fica no dashboard do professor);
import de questões externas.

## Decisions

1. **Sem tabela nova sincronizada** — o card quiz É a questão. Única migração:
   `question_attempts` local-only (id, card_id, correct, attempted_at), espelho
   do padrão `review_logs`.
2. **Formulário único**: CardsPanel ganha modo quiz por alternador; edição
   reabre o mesmo estado a partir do JSON parseado (parse defensivo já existe no
   TopicQuiz).
3. **Prática por trilha** = TopicQuiz com `cards` vindos de `listQuizCardsByTrack`
   (query nova espelhando `listQuizCards`).

## Risks / Trade-offs

- Attempts locais não seguem o usuário entre devices (aceito — como review_logs).
- Editar uma questão após tentativas mantém as tentativas antigas contando na
  taxa (aceito; a taxa é heurística local).
