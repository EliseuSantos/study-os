## ADDED Requirements

### Requirement: Card a partir de seleção

O sistema SHALL criar um card a partir de texto selecionado em conteúdo salvo em
até 2 interações: popover "criar card" (testid `selection-card`) → editor
pré-preenchido → salvar. O verso recebe o trecho citado e a fonte; a frente vem
sugerida (editável) como "Explique: <primeiras palavras do trecho>…". O card
herda o tópico do conteúdo quando o `content_item` está anexado a um tópico;
caso contrário o editor exige escolher trilha/tópico (SelectSearch).

#### Scenario: criar card de artigo anexado a tópico

- **WHEN** o usuário seleciona um trecho num artigo anexado ao tópico T e
  confirma o editor
- **THEN** o card é criado no tópico T com `back_md` contendo o trecho e
  `source_ref` `{content_item_id, url}`, entra como novo no FSRS e um toast
  "card criado" confirma

#### Scenario: criar card de transcrição com timestamp

- **WHEN** a seleção vem de um segmento de transcrição
- **THEN** `source_ref` inclui o timestamp (`ts`) e o verso mostra
  "fonte: vídeo · mm:ss" com link que abre o player naquele ponto

### Requirement: Cloze de um clique

No editor do card nascido de seleção, o usuário PODE selecionar um trecho do
verso e acionar "lacuna" (testid `card-cloze`): o sistema SHALL gerar `kind='cloze'`,
com `front_md` igual ao trecho com a seleção substituída por `{{c1::…}}`. Na
revisão, a lacuna renderiza como `[…]` até revelar.

#### Scenario: gerar cloze

- **WHEN** o usuário marca "princípio da legalidade" dentro do verso e clica
  em lacuna
- **THEN** a frente vira o trecho com `[…]` no lugar da marca e a resposta
  revela o texto completo com o termo em destaque

### Requirement: Origem rastreada nas estatísticas

Cards com `source_ref` SHALL ser contáveis: as estatísticas expõem "cards
nascidos de conteúdo" (total e % dos criados nos últimos 28 dias).

#### Scenario: contagem no painel

- **WHEN** existem 10 cards criados no período, 6 com `source_ref`
- **THEN** o bloco de estatísticas mostra "60% dos cards novos nasceram da leitura"
