# Proposal: do-conteudo-a-memoria (M8)

## Why

O StudyOS tem um motor de memória forte (FSRS-5 + fila diária) e uma ponte fraca até
ele: 100% dos cards nascem de digitação manual, e a leitura na biblioteca (artigos
web e transcrições de vídeo) termina sem nenhuma ação possível sobre o texto. Quem
não domina a habilidade de "cardificar" nunca liga o motor. Este change faz o
material revisável nascer do próprio ato de estudar.

## What Changes

- Leitor de artigos e transcrição de vídeo ganham **destaques**: selecionar texto →
  destacar (persistido por conteúdo, com âncora no trecho).
- Destaque pode receber uma **nota** curta opcional.
- **Seleção → card em um gesto**: popover sobre a seleção oferece "criar card";
  frente editável sugerida a partir do trecho, verso pré-preenchido com o trecho +
  fonte (URL do artigo ou vídeo+timestamp), tópico herdado do conteúdo quando
  anexado a um tópico.
- **Cloze com um clique**: dentro do editor do card nascido de seleção, marcar uma
  palavra/trecho gera card de lacuna (`{{...}}` na frente, resposta no verso).
- Painel "destaques" por conteúdo no leitor/player, com atalho para virar card.
- Stats: contagem de cards nascidos de conteúdo (fonte registrada no card).

## Capabilities

### New Capabilities

- `reading-annotations`: destaques e notas sobre conteúdo salvo (artigo web e
  transcrição), ancoragem de trecho, persistência local-first sincronizada.
- `card-from-selection`: fluxo seleção → card (frente sugerida, verso com trecho e
  fonte, cloze de um clique), origem rastreada no card.

### Modified Capabilities

- `content-connectors`: o leitor e o player de transcrição expõem seleção de texto
  com popover de ações (destacar / anotar / criar card) — comportamento novo de UI
  sobre conteúdo renderizado.

## Impact

- **Migração nova**: tabela `annotations` (id, content_item_id, kind
  highlight|note, anchor_json, note_md, timestamps LWW) — sincronizada; e coluna
  `source_ref` em `cards` (nullable; JSON {content_item_id, url, ts?}) para origem.
- `packages/db`: repo `annotations` + patch em `cards`; oplog invariant mantido.
- `packages/shared`: row types novos + tabela na lista de sync.
- `apps/pwa`: leitor (`library/read`), player (`library/watch/[videoId]`), popover
  de seleção, editor de card com cloze, painel de destaques.
- `apps/worker`: nada além do sync já genérico (tabela nova entra no LWW).
- Sem breaking changes; cards existentes não mudam.
