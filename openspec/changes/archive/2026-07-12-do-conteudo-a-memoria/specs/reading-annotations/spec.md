## ADDED Requirements

### Requirement: Destaques sobre conteúdo salvo

O sistema SHALL permitir destacar trechos de artigos salvos e de transcrições de
vídeo. Um destaque é persistido na tabela `annotations` (sincronizada, LWW) com
âncora `anchor_json` por offsets no texto-fonte (`{start,end,quote}` para artigo;
`{segment_index,start,end,quote}` para transcrição) e é re-renderizado como
`<mark data-annotation-id>` em visitas futuras.

#### Scenario: destacar trecho no leitor

- **WHEN** o usuário seleciona um trecho no leitor e escolhe "destacar" no popover
  (testid `selection-highlight`)
- **THEN** o trecho ganha fundo `--accent-tint-12` imediatamente, uma linha
  `annotations` é gravada via `localWrite` e o destaque reaparece ao reabrir o
  conteúdo

#### Scenario: âncora não resolve mais

- **WHEN** um destaque não encontra seu offset/quote no texto renderizado
- **THEN** ele não é descartado: aparece no painel de destaques marcado como
  "trecho não localizado", com o `quote` original visível

### Requirement: Nota em destaque

Um destaque MAY (PODE) receber — e o sistema SHALL persistir — uma nota curta em markdown (`note_md`). A nota aparece no
painel de destaques e num tooltip ao passar sobre o `<mark>`.

#### Scenario: anotar um destaque

- **WHEN** o usuário escolhe "nota" no popover (testid `selection-note`) e digita
  o texto
- **THEN** a mesma linha `annotations` guarda `note_md` e o painel lista o par
  trecho+nota

### Requirement: Painel de destaques

Leitor e player SHALL expor um painel "destaques" (testid `annotations-panel`)
listando destaques/notas do conteúdo em ordem de posição, cada item com ações:
ir até o trecho, criar card, excluir (soft delete).

#### Scenario: navegar do painel ao trecho

- **WHEN** o usuário clica num item do painel
- **THEN** a página rola até o `<mark>` correspondente e o realça brevemente
