# teacher-progress (delta)

## ADDED Requirements

### Requirement: Anonymous opt-in progress report

A device with `joined_class` SHALL offer an off-by-default setting `progress-optin`.
While on, each successful sync cycle also sends
`POST /class/:shareId/progress` with body
`{anon_id: string, topics_done: number, topics_total: number, cycle_pct: number,
week_minutes: number}` where `anon_id = sha256(device_id + share_id)` (hex, 64 chars).
The worker upserts by `(share_id, anon_id)` with last-write-wins on `updated_at`.

#### Scenario: Opt-out stops reporting

- **WHEN** the student turns `progress-optin` off
- **THEN** no further POSTs occur and the previous row ages out server-side (30 days)

### Requirement: Aggregate-only reads with a k-anonymity floor

`GET /class/:shareId/progress` SHALL require the teacher secret issued at publish
time and return only aggregates: `{devices: number, median_done: number,
topics: {topic_id, done_ratio}[]}`. With fewer than 3 reporting devices the endpoint
returns 204 and the UI shows "poucos alunos compartilhando ainda — os números aparecem
com 3 ou mais.".

#### Scenario: Below the floor

- **WHEN** only 2 devices reported for a share
- **THEN** the endpoint returns 204 and `class-progress-empty` renders the calm copy

#### Scenario: Aggregate view

- **WHEN** 5 devices reported
- **THEN** `class-progress-count` shows 5 and each `class-progress-topic-row` shows a
  bar with the done ratio — no row identifies a device
