---
source: scripts/contracts/response-headers.ts
source_sha256: 33421263ea6daceedf2a336871f7d44656159bbf4a0c5d3061c6818edf38db03
context_sha256: cabf4944071ede78f145dc210eca78e63de0ec435f85793f694e17b37cedea99
generated_at: 2026-11-22T01:59:52.355284+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/response-headers.ts

## Purpose
Stamps response headers that no operation writes by hand onto the bundled `openapi.yaml`. The app sets these in middleware before any route runs, so a hand-copied list on every operation would be an unguarded claim that goes stale silently. The two steps run late in `./openapi-bundle`, after the steps that add an operation's own headers, so an operation's own header always wins.

## Key elements
- `withAppLevelHeaders` (`Step`): reads the root's `x-app-level-headers` map (`{ header name: components/headers key }`) and adds a `$ref` to `#/components/headers/<key>` on every inline response. Those are each operation's inline responses plus `components/responses`. It never overwrites a header the response already declares (compared case-insensitively). It then deletes `x-app-level-headers` from the document. It throws if the map is missing, empty or not string-valued.
- `withIdempotentReplay` (`Step`): for every operation that takes an `Idempotency-Key`, declares `Idempotent-Replayed` on all its responses except `429`.
- `takesIdempotencyKey`: detects the key by a `$ref` to `IdempotencyKeyHeader` or `RequiredIdempotencyKeyHeader` under `components/parameters`. The parameter is the marker, with no hand-kept list.
- `declareReplay`: adds the header in place on inline responses. A `$ref` response is repointed to a twin. It throws if a `$ref` points outside `#/components/responses/`.
- `replayableTwinRef`: creates `<Name>Replayable` under `components/responses`, once per component, as a `structuredClone` of the original plus the replay header. It throws if the original is missing or is itself a `$ref`.
- `writeResponsesOf` / `inlineResponsesOf`: helpers that collect the write-operation responses and all inline (non-`$ref`) responses.

## Relationships
- Imports `operationsOf` and the `Operation`, `OpenApiDocument` and `Step` types from `./openapi-document`.
- Both exported steps are run by `./openapi-bundle` late in its pipeline.
- `tests/unit/scripts/contracts/response-headers.test.ts` is the unit test for this file.

## Notes
- On write operations (anything but GET and HEAD), the root-stamped `ETag` is skipped. A write answers only an `ETag` the API made itself, and a PUT answers none (RFC 9110). A write that returns a real tag declares it by hand, which wins. The doc comment says `dropUnownedValidators` enforces these ETag rules.
- The `Replayable` twin keeps non-keyed operations pointing at the original shared response, which stays without the replay header. The deep clone prevents the twin's headers leaking into the original.
- `429` is skipped because every budget refuses before the idempotency key is claimed, so the ledger never stores it.
- `x-app-level-headers` is an instruction to this script only and is removed from the published contract.
