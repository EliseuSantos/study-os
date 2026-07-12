## ADDED Requirements

### Requirement: Seleção de texto com ações no conteúdo renderizado

O leitor de artigos e a transcrição do player SHALL exibir, ao selecionar texto,
um popover de ações (testid `selection-actions`) com: destacar, nota e criar
card. O popover posiciona-se acima da seleção (abaixo, em touch), fecha em Esc
ou clique fora, e oferece atalhos `h` (destacar) e `c` (criar card).

#### Scenario: popover aparece na seleção

- **WHEN** o usuário seleciona texto dentro do artigo renderizado
- **THEN** o popover aparece junto à seleção com as três ações e navegação por
  teclado

#### Scenario: sem seleção, sem popover

- **WHEN** a seleção é vazia ou está fora do corpo do conteúdo
- **THEN** nenhum popover aparece
