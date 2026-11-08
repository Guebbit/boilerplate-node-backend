---
source: src/modules/audit-logs/tests/unit/schema-contract.test.ts
sha256: 4f0220efdd2a23999114bf8157153dd2c20a8e89ca90e178351063a03a85bbb5
generated_at: 2026-11-08T05:10:24.935329+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/unit/schema-contract.test.ts

## Purpose

Contract test for the `auditLogSchema` (Mongoose). It asserts the schema's required fields, closed enum sets, schema options, index definitions, and TTL policy. The file is explicitly positioned as a **compliance artifact**—changing any assertion here means the audit-log contract has changed, not that the test needs updating.

## Key elements

- **`RETENTION_SECONDS`** — module-level constant derived from `currentEnvironment().NODE_AUDIT_RETENTION_DAYS ?? 90`; used to assert the TTL value without hardcoding a number.
- **`describe("what an entry must carry")`** — verifies the seven required paths (`action`, `actorRole`, `actorScope`, `actorUserId`, `level`, `outcome`, `timestamp`); asserts closed enums on `actorRole`, `outcome`, `level`; confirms `actorRoleName` is present but open and optional.
- **`describe("the credential behind an entry")`** — asserts `actorCredentialId` exists in the schema but is not required.
- **`describe("options")`** — asserts `timestamps: false` (timestamp comes from the emitter) and `bufferCommands: false` (unreachable DB must reject, not buffer).
- **`describe("indexes and retention")`** — asserts the four index specs (three compound descending-on-timestamp, one standalone ascending); asserts `expireAfterSeconds` appears only on the standalone ascending `timestamp_1` index and equals `RETENTION_SECONDS`.

## Relationships

- **`src/modules/audit-logs/model.ts`** — sole subject under test; the file imports `auditLogSchema` and every assertion is a property check on that object.
- **`tests/support/schema.ts`** — provides the introspection helpers (`requiredPaths`, `enumOf`, `pathNames`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) used to read Mongoose schema internals without string-matching.
- **`src/infrastructure/config/store.ts`** — supplies `currentEnvironment()` so the TTL assertion tracks the actual configured retention window rather than a literal.

## Notes

- The TTL assertion is coupled to the environment variable: changing `NODE_AUDIT_RETENTION_DAYS` moves both the production index and this test simultaneously. There is no independent "expected value" to update.
- `bufferCommands: false` is load-bearing for the caller's failure path (log-to-fallback + increment `auditSinkFailuresTotal`); a `true` value would resolve the write later and silently drop the signal.
- Mongo only honours `expireAfterSeconds` on a **single-field ascending** index. The same `timestamp` field appears descending in the two compound indexes; a refactor that merges or reorders indexes can silently break deletion without any schema validation error.
