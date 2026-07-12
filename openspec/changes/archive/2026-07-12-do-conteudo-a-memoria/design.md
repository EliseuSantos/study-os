# Design: do-conteudo-a-memoria

## Context

O leitor (`/library/read?src=…`) renderiza markdown sanitizado de artigos salvos;
o player (`/library/watch/[videoId]`) mostra transcrição segmentada com timestamps.
Cards são criados manualmente em `CardsPanel` na trilha. `content_items` liga
conteúdo a tópicos. Sync é LWW por linha, oplog invariant via `localWrite`.

## Goals / Non-Goals

**Goals:**

- Persistir destaques/notas sobre conteúdo salvo, offline-first, sincronizados.
- Criar card a partir de seleção em ≤ 2 interações, com fonte rastreada.
- Cloze de um clique no editor do card nascido de seleção.
- Ancoragem robusta o suficiente para conteúdo imutável (nosso caso: o markdown
  salvo não muda depois de anexado).

**Non-Goals:**

- Anotação sobre PDFs ou páginas ao vivo (só conteúdo salvo).
- Editor rico de notas (nota é texto curto).
- Geração automática de frente por IA (fica para depois; a frente sugerida é
  heurística local: trecho → "Complete/explique: …").

## Decisions

1. **Âncora por offsets no texto-fonte, não no DOM.** `anchor_json =
   {start, end, quote}` sobre o texto plano do markdown salvo (ou
   `{segment_index, start, end, quote}` na transcrição). O conteúdo salvo é
   imutável ⇒ offsets estáveis; `quote` serve de verificação e fallback (se não
   bater, destaque vira "órfão" listado no painel, nunca perdido).
2. **Uma tabela `annotations`** para highlight e nota (kind + note_md nullable)
   em vez de duas — mesma âncora, mesmo ciclo de vida, sync único.
3. **`cards.source_ref` JSON nullable** em vez de tabela de junção — 1 card tem
   0..1 fonte; JSON evita migração de junção e o wire LWW já manda linha cheia.
4. **Popover de seleção** componente único (`SelectionActions.svelte`) usado por
   leitor e transcrição: escuta `selectionchange`, posiciona sobre o range,
   ações: destacar · nota · criar card. Teclado: `h` destaca, `c` cria card.
5. **Cloze**: no editor, selecionar trecho do verso e clicar `[…]` gera
   `front_md` com `{{c1::trecho}}` substituído por lacuna na renderização da
   revisão (render já passa por markdown → extensão simples). `kind='cloze'`.
6. **Render dos destaques**: pós-processamento do HTML sanitizado — walk de text
   nodes acumulando offsets e envolvendo ranges em `<mark data-annotation-id>`.
   Sem dependência nova.

## Risks / Trade-offs

- **Offsets vs. re-render markdown**: mudanças futuras no pipeline de render
  (ex.: outra lib) quebrariam âncoras → mitigado pelo `quote` fallback + testes
  de ancoragem no `packages/core` (função pura de anchor/resolve).
- **Seleção em mobile** é menos precisa; popover deve não cobrir a seleção
  (posiciona abaixo em touch).
- `topic_deps`-style: `annotations` sincroniza (tem updated_at); volume esperado
  baixo (dezenas por conteúdo).
