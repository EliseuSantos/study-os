# Sync protocol (M1)

Single-user, last-write-wins. Local wa-sqlite (OPFS) is the source of truth; D1 is a mirror.

## Wire contract

Types live in `packages/shared/src/sync-types.ts` — the frozen contract for client, worker and tests.

### `POST /sync/push`

- Headers: `Authorization: Bearer <SYNC_TOKEN>`, `content-type: application/json`
- Body: `PushRequest { device_id, ops: OpLogEntry[] }`
- Server behavior, per op, all in one atomic `D1.batch()`:
  1. Validate `tbl` against `SYNCED_TABLES` (unknown tables rejected with 400).
     Since M8 the set includes `annotations` (reading highlights/notes) and
     `cards` carries the nullable `source_ref` column (origin of the card).
  2. LWW upsert payload into the entity table: apply iff `incoming.updated_at > existing.updated_at`.
  3. Upsert into `server_oplog` (latest op per `(tbl, row_id)`), same LWW guard.
- Response: `PushResponse { accepted }` (200). 401 on bad token.

### `GET /sync/pull?since=<ms>&device=<device_id>`

- Headers: `Authorization: Bearer <SYNC_TOKEN>`
- Returns ops from `server_oplog` with `updated_at >= since` and `device_id != device`,
  ordered by `(updated_at, row_id)`, limit 500.
- Response: `PullResponse { ops, cursor, has_more }` where `cursor = max(updated_at)` seen
  (or `since` when empty).
- `>=` is intentional: same-millisecond ops are never skipped; the client apply is
  idempotent (strict `>` LWW guard), so re-delivery is a no-op.

### `GET /health`

No auth. `{ "ok": true }`.

## Client rules

- Every local write to a synced table appends an `oplog` row in the **same** `batch()` as
  the entity write (`localWrite` path).
- Remote ops are applied via `applyRemote`: entity table only, LWW-guarded, **never**
  writes `oplog` (prevents ping-pong).
- Soft delete on the wire is an `upsert` with `deleted_at` set. `op: 'delete'` is reserved
  for future hard purges.
- Payloads are **full rows**: the LWW upsert writes every declared column, so a missing
  column becomes NULL and would override SQL defaults. `localWrite` always serializes the
  complete row.
- Cursor and `device_id` are stored in the `settings` table (local-only, never synced).
- Sync triggers: app open, `online` event, 3s debounce after a local write, manual button.
  Single-flight; exponential backoff on failure; offline skips silently.

## Not synced in M1

`settings` (per-device), `topic_deps` and `review_logs` (no `updated_at` column — revisit in
M2), `oplog`, `server_oplog`, `push_subscriptions`, `track_shares` (server-side only).

## Progresso da turma (agregados anônimos)

Endpoint separado do sync, fora do oplog: `POST /class/:shareId/progress` é
**público** (o aluno não tem token) e grava uma linha LWW por dispositivo anônimo;
`GET /class/:shareId/progress` é do professor (bearer) e devolve **apenas
agregados**. Privacidade por construção:

- **Opt-in do aluno**, desligado por default (`progress_optin`); só envia quando o
  aluno entrou numa turma (`joined_class`). O envio pega carona no sync.
- **Identidade anônima**: `anon_id = SHA-256("studyos:<device_id>:<share_id>")` — o
  servidor nunca vê o `device_id`, e o id difere por turma (sem correlação entre elas).
- **Piso de k-anonimato = 3**: com menos de 3 dispositivos o GET responde `204` e a
  UI mostra a cópia calma "poucos alunos compartilhando ainda…". Nunca há linha crua
  no GET — só contagem, mediana, média de minutos/semana e razão de conclusão por
  tópico (chaveada pelo `sid` do publisher).
- **Janela de 30 dias**: linhas paradas há mais de 30 dias saem do agregado.
- Resposta do GET é `cache-control: no-store` e o service worker não cacheia
  `/class/*` — o painel do professor nunca fixa um agregado velho.

## UI contract (for e2e)

Route `/` (Today placeholder in M1):

- `data-testid="goal-form"` — form with `data-testid="goal-title-input"` and submit
  `data-testid="goal-submit"`
- `data-testid="goal-list"` — list of `data-testid="goal-item"` entries showing the title
- `data-testid="sync-now"` — manual sync button

> Limitação conhecida: o cursor de pull é `max(updated_at)` do `server_oplog`.
> Um cliente com relógio adiantado (ou dados gravados com timestamp futuro)
> avança o cursor além do presente e atrasa a entrega de ops novos até o
> relógio alcançá-lo. Endurecer isso pede um `seq` monotônico do servidor —
> candidato a um change futuro do sync-protocol.
