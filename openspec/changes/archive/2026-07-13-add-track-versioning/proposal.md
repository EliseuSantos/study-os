# Teacher mode: versões de trilha (republicar sem quebrar alunos)

> Nota de revisão (2026-07-12): a *detecção* de versão nova já existe desde o
> redesign — trilhas importadas guardam `origin`/`origin_version` (hash) e o
> detalhe da trilha mostra "há uma versão mais nova desta trilha compartilhada"
> (testid `origin-update-note`). O recorte vivo deste change é o que falta:
> versão monotônica explícita no snapshot e, principalmente, o **re-import com
> merge preservando progresso**.

## Why

Republishing a share today overwrites the snapshot silently; students who imported an
older edital have no signal and re-importing would clobber their progress. Editais
change mid-course — versioning is what makes a turma survivable.

## What changes

1. **`version` in the snapshot payload**: monotonically increasing integer set by the
   publisher; republish keeps the same share id and bumps the version.
2. **Import records origin**: imported tracks already store their origin share id;
   they now also store the imported `version`.
3. **Update detection**: when online, the app checks the origin share (existing proxy,
   cached 6h) and, if `version` is newer, shows a calm banner on the track:
   "esta trilha tem uma versão nova do professor — atualizar mantém seu progresso.".
4. **Merge re-import**: "atualizar" re-imports the snapshot preserving local state:
   topics are matched by their stable snapshot ids; `status`, fsrs state and cards on
   surviving topics are kept; topics removed upstream are soft-deleted locally; new
   topics arrive as `pending`.

data-testids: `track-update-banner`, `track-update-apply`, `track-update-dismiss`.

## Non-goals

- No diff preview UI in v1 (banner + one-click apply only).
- No downgrade path (older version never overwrites newer).
- No auto-apply — always user-initiated.

## Impact

- `packages/core`: snapshot version field + merge algorithm (pure, heavily unit
  tested — the risky part).
- `packages/db`: origin version column; merge executor via repos (oplog).
- `apps/pwa`: banner + apply flow on track detail.
- Delta on existing `track-snapshot` spec.
