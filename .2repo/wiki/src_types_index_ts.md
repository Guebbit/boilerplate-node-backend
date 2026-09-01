# src/types/index.ts

## Purpose

Type barrel that consolidates three sources of public types—generated API models, generated AsyncAPI types, and a hand-written auth-context DTO—behind a single import path (`@types`). Consumers never need to know which file a type actually originates from.

## Key elements

- **`export * from '@api/models'`** — Re-exports all generated API model types (request/response schemas, etc.).
- **`export * from './asyncapi.generated'`** — Re-exports types generated from `asyncapi.yaml` (run `npm run gen:asyncapi`). The file name mirrors the spec name; the paired frontend uses the same convention for its own copy of the shared half.
- **`export type { AuthContext, Caller } from './auth-context'`** — Exports the hand-written auth-context DTO. Described as a DIP-compliant, transport-safe user representation (no infrastructure types leak in).

## Relationships

Every file in the listed graph neighbors imports types through this barrel (`@types`) rather than reaching into `@api/models`, `./asyncapi.generated`, or `./auth-context` directly. This covers:

- **Infrastructure adapters** (`image.worker.ts`, `mailer.ts`, `pdf.worker.ts`, `queue.ts`) — consume generated model/AsyncAPI types for their input/output contracts.
- **HTTP / observability** (`request.ts`, `stream.ts`) — reference shared type definitions.
- **Kernel** (`authorization.ts`) — consumes `AuthContext` / `Caller` from the hand-written DTO.
- **Account controllers** (signup, login, reset, password-change, verify, delete, put-account) — use both generated model types and the auth context.

The barrel is the sole public surface for these types; the source files are effectively internal.

## Notes

- `asyncapi.generated.ts` is **generated**, not hand-edited. Regenerate with `npm run gen:asyncapi` after changing `asyncapi.yaml`.
- The `@types` path alias (not to be confused with the npm `@types/*` packages) resolves to this file. Import from `@types`, not from the individual source paths.
- `AuthContext` / `Caller` are the **only** hand-written types here; everything else is generated. Changes to the generated sources should go through their respective codegen steps, not by editing the barrel.
