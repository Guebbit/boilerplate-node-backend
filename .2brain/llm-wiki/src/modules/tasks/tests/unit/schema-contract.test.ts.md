---
source: src/modules/tasks/tests/unit/schema-contract.test.ts
sha256: fa8c49323863a1a53e183637df5dc30681c8d46038f006865da0801a2a9057de
generated_at: 2026-11-08T08:42:15.006205+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins down the public contract of `taskSchema`: which fields are required vs. optional, what defaults exist, which indexes are declared, and how TTL/retention is wired. It encodes the design decision that a stranger submitting a task must provide email, subject, and message (so operators can reply and understand context), while name stays optional.

## Key elements

- **`RETENTION_SECONDS`** – Computed from `currentEnvironment().NODE_TASKS_RETENTION_DAYS` (fallback 730 days). Used so the TTL assertion tracks config changes instead of a hardcoded literal.
- **Required-paths test** – Asserts `['message', 'routeSet', 'subject']` are the only required paths; `name` is explicitly *not* required.
- **Operator-field defaults test** – Verifies `respondedAt` and `closedAt` have **no** schema default (a default on `respondedAt` would auto-mark every incoming task as answered).
- **Status enum/default test** – `status` must accept exactly `Object.values(TaskStatus)` and default to `TaskStatus.new`.
- **Index specs test** – Enumerates all 8 indexes on the schema (queue, retention, lookup, etc.).
- **Timestamps test** – Confirms `timestamps: true` is set.
- **TTL / index-options test** – Asserts per-index options: partial filters on `assigneeId`, `email`, `eventIds`, `openKey` (unique), `subjectId`; `expireAfterSeconds` on `closedAt_1` and `createdAt_1`; `createdAt_1` additionally filtered to `source: "visitor"`.
- **`closedAt` ascending test** – Re-asserts the single-field `closedAt+1` index exists, because Mongo only honours `expireAfterSeconds` on a single-field ascending index (the compound `routeSet+1, status+1, dueAt+1` index contains `closedAt` descending and must not be confused with it).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/tasks/model.ts` | Imports `taskSchema` — the object under test. |
| `src/types/index.ts` | Imports `TaskStatus` to assert the enum constraint. |
| `tests/support/schema.ts` | Imports introspection helpers (`requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `optionsOf`) that read Mongoose schema metadata. |
| `src/infrastructure/config/store.ts` | Imports `currentEnvironment` to read `NODE_TASKS_RETENTION_DAYS` at test time. |

## Notes

- The file docblock frames the schema in "contact form" language (stranger → operator). This is design rationale, not a description of a separate contact module; the tests are about `taskSchema`.
- `createdAt_1` TTL is **partial** (`source: "visitor"`); `closedAt_1` TTL is **unconditional**. Don't add a partial filter to `closedAt_1` without updating the test.
- The last test exists as a guard against a subtle bug: if someone removes the standalone `closedAt_1` index and relies on the compound index (where `closedAt` is descending), Mongo silently ignores `expireAfterSeconds` and no tasks are ever deleted.
- Changing `NODE_TASKS_RETENTION_DAYS` in any environment config will shift the expected `expireAfterSeconds` values automatically because the assertion is computed, not literal.
