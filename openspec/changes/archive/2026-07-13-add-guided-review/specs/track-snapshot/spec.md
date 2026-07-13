# track-snapshot (delta)

## ADDED Requirements

### Requirement: Optional focus block in the snapshot payload

The snapshot wire format SHALL accept an optional
`focus: {week: string, topic_ids: string[≤5]}`. Importers apply it to the imported
track; absent field keeps current behavior.

#### Scenario: Backward compatibility

- **WHEN** a snapshot without `focus` is imported
- **THEN** the import flow behaves exactly as before this change
