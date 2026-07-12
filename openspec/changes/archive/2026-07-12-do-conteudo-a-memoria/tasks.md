## 1. Dados e core

- [x] 1.1 Migração `annotations` (id, content_item_id, kind, anchor_json, note_md,
      created_at, updated_at, deleted_at) + `cards.source_ref` TEXT NULL; `?raw`
      import no worker do db; tabela em SYNCED_TABLES + row types em shared
- [x] 1.2 `packages/core`: funções puras `anchorFromSelection(text, range)` e
      `resolveAnchor(text, anchor)` (offsets + quote fallback) com testes
- [x] 1.3 `packages/db`: repo `annotations` (create/list/patch nota/delete soft)
      + patch de `cards` com `source_ref`; testes bun:sqlite

## 2. Popover e destaques na UI

- [x] 2.1 `SelectionActions.svelte` (popover: destacar/nota/criar card, atalhos
      h/c, posicionamento touch) + wiring no leitor `library/read`
- [x] 2.2 Render de destaques no HTML sanitizado (`<mark data-annotation-id>`)
      + tooltip de nota
- [x] 2.3 Painel de destaques (testid `annotations-panel`) com ir-até/card/excluir
      e estado "trecho não localizado"
- [x] 2.4 Mesmo fluxo na transcrição do player (âncora por segmento + ts)

## 3. Card a partir de seleção

- [x] 3.1 Editor de card pré-preenchido (frente sugerida, verso com trecho +
      fonte, tópico herdado ou SelectSearch) + toast
- [x] 3.2 Cloze de um clique (`kind='cloze'`, render `[…]` na revisão)
- [x] 3.3 Link de fonte no verso durante a revisão (URL / vídeo·mm:ss)

## 4. Stats e fechamento

- [x] 4.1 Contagem "cards nascidos de conteúdo" no bloco de estatísticas
- [x] 4.2 e2e Cypress: destacar → painel → criar card → card aparece na revisão
- [x] 4.3 Docs curtos no readme da biblioteca + validar templates/specs
