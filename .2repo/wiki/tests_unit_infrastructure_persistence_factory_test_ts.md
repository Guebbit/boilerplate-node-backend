# tests/unit/infrastructure/persistence/factory.test.ts

## Purpose

Unit tests for the four shared fixture helpers (`toObjectId`, `compact`, `toDate`, `identityOf`) that every per-module `factory.ts` composes. The tests lock down the "unspecified field" contract: which values are dropped, which are preserved, and how a seeded record's identity and timestamps are derived when the caller omits fields.

## Key elements

- **`describe('toObjectId')`** — Verifies hex-string → `Types.ObjectId` conversion, that calling with no argument mints a fresh unique id, and that a malformed string throws rather than silently substituting a new id.
- **`describe('compact')`** — Verifies that only `undefined`-valued keys are removed; `null`, `0`, `''`, and `false` are kept. Also asserts the input object is not mutated.
- **`describe('toDate')`** — Verifies ISO-string parsing, `Date` passthrough by value, and that `undefined` passes through as `undefined` (not `new Date(undefined)` / Invalid Date) so `compact` can still drop it.
- **`describe('identityOf')`** — Verifies the full identity-derivation contract: `_id` from explicit or generated value, `createdAt` from the id's embedded timestamp or an explicit override, and `updatedAt` defaulting to `createdAt` (not `new Date()`) unless explicitly provided.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — The sole SUT under test; all four helpers are imported from here via the `@infrastructure/persistence/factory` alias.
- **`mongoose`** (`Types`) — Imported only to assert `instanceof Types.ObjectId` in the `toObjectId` and `identityOf` suites.

## Notes

- The file-level doc block (lines 1–18) is the canonical explanation of *why* each helper exists and what silent failure it prevents. Read it before modifying the helpers.
- `compact` and `toDate` are intentionally composed: `toDate` must return `undefined` for `undefined` input so that `compact` can drop the key, letting Mongoose's `default:` apply. A change to either breaks that pipeline.
- `identityOf` defaulting `updatedAt` to `createdAt` (rather than the current time) is deliberate: an untouched seeded record must not appear in "recently changed" views.
- The hex constant `HEX` is a single shared fixture id; `identityOf` tests rely on its embedded timestamp being deterministic.
