## 1. Core e dados

- [x] 1.1 `previewIntervals(state)` no core FSRS (puro, 4 notas → ms) + testes
- [x] 1.2 `ReviewSlice` ganha `topic_id` via join; `weakTopics` sem limitação de
      ref_kind + testes atualizados
- [x] 1.3 Repo: listar cards quiz por tópico; undo de review (restaurar estado
      FSRS anterior + remover review_log) com teste de round-trip

## 2. Caderno de erros

- [x] 2.1 Formulário de erro (modal, SelectSearch de trilha/tópico, testids
      `error-log-open/form`) criando card kind='error' + toast
- [x] 2.2 Aba "erros" no detalhe da trilha (testid `errors-panel`)
- [x] 2.3 Atalho pós-sessão de questões ("registrar os N erros?")

## 3. Quiz por tópico

- [x] 3.1 Sessão de quiz (uma questão por vez, correção imediata, placar,
      testid `topic-quiz-start`), gravando sessão type='questions'
- [x] 3.2 Acurácia por trilha com origem medida vs autorrelato

## 4. Revisão

- [x] 4.1 Botões 1–4 com intervalo previsto
- [x] 4.2 Desfazer (testid `review-undo`, atalho z)

## 5. Fechamento

- [x] 5.1 e2e: erro→card→revisão; quiz→acurácia; undo
- [x] 5.2 Specs sincronizados + validação
