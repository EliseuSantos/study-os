# track-snapshot (delta)

## ADDED Requirements

### Requirement: Optional class name in the snapshot payload

The snapshot wire format SHALL accept an optional top-level `class_name: string`
(≤ 80 chars). Absent field keeps the current behavior; consumers MUST treat it as
purely informational.

#### Scenario: Backward compatibility

- **WHEN** a pre-existing snapshot without `class_name` is imported
- **THEN** the import flow behaves exactly as before this change
