# track-snapshot (delta)

## ADDED Requirements

### Requirement: Snapshot version

The snapshot payload SHALL carry `version: number` (integer ≥ 1; absent = 1 for
backward compatibility). Republishing to the same share id MUST bump the version;
consumers MUST ignore payloads whose version is lower than the one already imported.

#### Scenario: Republish bumps

- **WHEN** a teacher republishes a track already shared at version 3
- **THEN** the stored snapshot has version 4 under the same share id

### Requirement: Update banner on imported tracks

An imported track SHALL remember its origin share id and version. When a newer origin
version is detected (online check through the existing cached proxy), the track detail
shows `track-update-banner` with the copy "esta trilha tem uma versão nova do
professor — atualizar mantém seu progresso." and the actions `track-update-apply` /
`track-update-dismiss` (dismiss silences that version only).

#### Scenario: Newer version detected

- **WHEN** the origin share is at version 5 and the local import was version 4
- **THEN** `track-update-banner` is visible on that track

### Requirement: Progress-preserving merge

Applying an update SHALL merge, in one atomic batch through the repos: topics matched
by stable snapshot id keep local `status`, fsrs state and cards; topics absent from
the new version are soft-deleted; new topics are inserted as `pending`. The local
origin version is set to the applied version.

#### Scenario: Progress survives

- **WHEN** a student with 10 dominated topics applies an update that renames 2 topics
  and adds 3
- **THEN** the 10 `done` statuses remain and the 3 new topics appear as `pending`
