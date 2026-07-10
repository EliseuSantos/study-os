import { describe, expect, test } from 'bun:test';
import { parseOutline, type OutlineNode } from '../src/outline-parser';

interface FlatNode {
  title: string;
  depth: number;
}

function flatten(nodes: OutlineNode[]): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (list: OutlineNode[]): void => {
    for (const node of list) {
      out.push({ title: node.title, depth: node.depth });
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

describe('parseOutline', () => {
  test('pure markdown headings', () => {
    const roots = parseOutline('# A\n## B\n### C\n## D\n# E');
    expect(flatten(roots)).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
      { title: 'C', depth: 2 },
      { title: 'D', depth: 1 },
      { title: 'E', depth: 0 },
    ]);
    expect(roots.length).toBe(2);
    expect(roots[0]!.children.length).toBe(2);
  });

  test('heading depth is anchored at the minimum heading level present', () => {
    const roots = parseOutline('## A\n### B\n## C');
    expect(flatten(roots)).toEqual([
      { title: 'A', depth: 0 },
      { title: 'B', depth: 1 },
      { title: 'C', depth: 0 },
    ]);
  });

  test('pure indented list (spaces and tabs)', () => {
    const text = '- a\n  - b\n    - c\n  - d\n- e\n\t- f';
    expect(flatten(parseOutline(text))).toEqual([
      { title: 'a', depth: 0 },
      { title: 'b', depth: 1 },
      { title: 'c', depth: 2 },
      { title: 'd', depth: 1 },
      { title: 'e', depth: 0 },
      { title: 'f', depth: 1 },
    ]);
  });

  test('numbered lists with . and )', () => {
    const text = '1. um\n2) dois\n  1. dois.um\n3. tres';
    expect(flatten(parseOutline(text))).toEqual([
      { title: 'um', depth: 0 },
      { title: 'dois', depth: 0 },
      { title: 'dois.um', depth: 1 },
      { title: 'tres', depth: 0 },
    ]);
  });

  test('ragged indentation nests under the nearest shallower item', () => {
    const text = '- a\n   - b\n     - c\n  - d\n- e';
    expect(flatten(parseOutline(text))).toEqual([
      { title: 'a', depth: 0 },
      { title: 'b', depth: 1 },
      { title: 'c', depth: 2 },
      { title: 'd', depth: 1 },
      { title: 'e', depth: 0 },
    ]);
  });

  test('mixed headings and lists; blank lines ignored', () => {
    const text = '# A\n\n- a1\n  - a1a\n\n## B\n- b1\n* b2\n';
    expect(flatten(parseOutline(text))).toEqual([
      { title: 'A', depth: 0 },
      { title: 'a1', depth: 1 },
      { title: 'a1a', depth: 2 },
      { title: 'B', depth: 1 },
      { title: 'b1', depth: 2 },
      { title: 'b2', depth: 2 },
    ]);
  });

  test('stray plain lines become depth-0 nodes and anchor following items', () => {
    const text =
      'Direito Penal\n- Crimes contra a pessoa\n- Crimes contra o patrimonio\nObservacoes gerais';
    expect(flatten(parseOutline(text))).toEqual([
      { title: 'Direito Penal', depth: 0 },
      { title: 'Crimes contra a pessoa', depth: 1 },
      { title: 'Crimes contra o patrimonio', depth: 1 },
      { title: 'Observacoes gerais', depth: 0 },
    ]);
  });

  test('empty input yields an empty forest', () => {
    expect(parseOutline('')).toEqual([]);
    expect(parseOutline('\n\n  \n')).toEqual([]);
  });

  test('realistic pt-BR edital round-trip', () => {
    const edital = [
      '# Direito Constitucional',
      '## Princípios fundamentais',
      '- Fundamentos da República',
      '- Separação dos poderes',
      '## Direitos e garantias fundamentais',
      '- Direitos individuais e coletivos',
      '  - Remédios constitucionais',
      '    - Habeas corpus',
      '    - Mandado de segurança',
      '- Direitos sociais',
      '',
      '# Direito Administrativo',
      '## Atos administrativos',
      '1. Conceito e requisitos',
      '2. Atributos',
      '3. Revogação e anulação',
      '## Licitações',
      '- Lei 14.133/2021',
      '  - Modalidades',
      '  - Critérios de julgamento',
    ].join('\n');

    expect(flatten(parseOutline(edital))).toEqual([
      { title: 'Direito Constitucional', depth: 0 },
      { title: 'Princípios fundamentais', depth: 1 },
      { title: 'Fundamentos da República', depth: 2 },
      { title: 'Separação dos poderes', depth: 2 },
      { title: 'Direitos e garantias fundamentais', depth: 1 },
      { title: 'Direitos individuais e coletivos', depth: 2 },
      { title: 'Remédios constitucionais', depth: 3 },
      { title: 'Habeas corpus', depth: 4 },
      { title: 'Mandado de segurança', depth: 4 },
      { title: 'Direitos sociais', depth: 2 },
      { title: 'Direito Administrativo', depth: 0 },
      { title: 'Atos administrativos', depth: 1 },
      { title: 'Conceito e requisitos', depth: 2 },
      { title: 'Atributos', depth: 2 },
      { title: 'Revogação e anulação', depth: 2 },
      { title: 'Licitações', depth: 1 },
      { title: 'Lei 14.133/2021', depth: 2 },
      { title: 'Modalidades', depth: 3 },
      { title: 'Critérios de julgamento', depth: 3 },
    ]);
  });
});
