# src/modules/users/tests/unit/validation.test.ts

## Purpose

Exercises the six i18n message thunks in `zodUserSchema` to guarantee two things that "happy-path parse" suites never verify: (1) each thunk is evaluated lazily (so it never resolves to `undefined` before `i18next.init()`), and (2) each message is attached to the correct rule rather than a sibling with a similar constraint.

## Key elements

- **`en` / `copy(key)`** — Loads the shipped English dictionary via `readLocaleDictionary('en')` and provides a `copy` helper so assertions reference i18n keys, not prose.
- **`validUser`** — A payload that satisfies every rule, letting each test break exactly one field in isolation.
- **`messagesFor(payload, field)`** — Runs `zodUserSchema.safeParse`, filters issues by top-level field name, and returns the array of messages Zod produced for that field.
- **`describe('email messages')`** — Asserts `field-email-required` vs. `field-email-invalid` are each produced (and the other is *not*) for the respective failure.
- **`describe('username messages')`** — The `min(1)` vs. `min(3)` disambiguation: `'ab'` must yield `field-username-min`, never `field-username-required`.
- **`describe('password messages')`** — Derives the one-character-short boundary from `createUserBodyPasswordMin` (generated schema) rather than a hardcoded literal; also confirms the exact-minimum length passes.
- **`describe('inherited rules')`** — Feeds a bad `admin` value to confirm `.extend()` preserves base-class rules (`admin`, `active`, `imageUrl`) from the generated `CreateUserBody`.

## Relationships

- **`src/modules/users/index.ts`** → re-exports `zodUserSchema`, the sole SUT.
- **`src/modules/users/model.ts`** → defines the schema and its message thunks; the file's header comment documents "PROBLEM 01" (eager thunk evaluation) that these tests guard against.
- **`src/infrastructure/i18n/index.ts`** → provides `readLocaleDictionary`, which loads the locale JSON the thunks resolve against at runtime.
- **`src/infrastructure/i18n/catalog.ts`** → underlying catalog/dictionary store that `readLocaleDictionary` reads from.
- **`@api/schemas.zod`** (not in neighbor list but imported) → `createUserBodyPasswordMin` keeps the min-length boundary in lock-step with `openapi.yaml`.

## Notes

- Assertions always go through `copy(key)`, so the English source of truth remains `en.json`; a wording change requires no test edit.
- The `createUserBodyPasswordMin` import means a contract change in `openapi.yaml` automatically shifts the boundary test instead of leaving a stale literal.
- The "inherited rules" block is the only test that does **not** use `messagesFor`; it asserts parse failure to catch a regression where `.extend()` accidentally replaces the base schema.
- The file header explicitly frames itself as a regression guard for eager thunk evaluation: if a thunk were changed from `() => t(…)` to `t(…)`, Zod would substitute its own English and every copy-key assertion here would fail.
