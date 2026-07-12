## ADDED Requirements

### Requirement: Pontos de atenção com uso real

`weakTopics` SHALL considerar reviews de card mapeando card→tópico: o
`ReviewSlice` carrega `topic_id` (join `cards.topic_id` no SELECT), e a fórmula
existente (70% taxa de notas 1–2 + 30% tempo inverso, mínimo 3 reviews) passa a
agregar por tópico tanto reviews de tópico quanto de card.

#### Scenario: acende com revisão de cards

- **WHEN** um tópico acumula 3+ reviews de seus cards com maioria de notas 1–2
- **THEN** ele aparece em "pontos de atenção" com o score calculado

### Requirement: Acurácia medida tem precedência

A acurácia por trilha SHALL combinar resultados medidos (quiz por tópico) e
autorrelatados (registro de sessão), identificando a fonte; quando existem
resultados medidos no período, o rótulo indica "medido" e eles dominam o número
exibido.

#### Scenario: quiz alimenta acurácia

- **WHEN** o usuário pratica quizzes com 80% de acerto numa trilha sem sessões
  autorrelatadas no período
- **THEN** "acerto por trilha" mostra 80% com origem medida
