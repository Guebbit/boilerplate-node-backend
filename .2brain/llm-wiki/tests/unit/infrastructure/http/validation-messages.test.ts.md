---
source: tests/unit/infrastructure/http/validation-messages.test.ts
sha256: a79144cacd66ce6e654d4bfcf756e96a919d0ec48ad9ac162540e14701e8bed8
generated_at: 2026-11-08T10:19:10.625228+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/validation-messages.test.ts

## Purpose

End-to-end verification of Zod's global error map as installed by `registerValidationMessages`. Rather than unit-testing the mapper in isolation, every assertion drives a real `safeParse` through a one-field schema and compares the rendered English (or Italian) sentence against the shipped i18n dictionary. The file exists to catch the silent regression where a message falls back to Zod's own English, which looks plausible but bypasses the translation pipeline.

## Key elements

- **`dictionary` / `copy`** – Cast the `en` locale dictionary and extract the `validation` section so no test re-types a sentence literal.
- **`render(key, values)`** – Renders a `validation.*` i18n key with placeholders via the same `translator('en')` the error map uses, keeping expectations in lockstep with production.
- **`messageOf(schema, value)`** – Asserts a `safeParse` failure and returns the first issue's message.
- **`messagesOf(schema, value)`** – Same but returns all issue messages (used for multi-error object checks).
- **`field(name, schema)`** – Wraps a schema in a single-key `z.object` so the field label is part of every assertion.
- **`beforeAll → registerValidationMessages()`** – Installs the error map on the Zod singleton before any parse runs.
- **Describe blocks** – Cover: required-vs-typed distinction, label resolution (innermost, unlabelled-segment fallback, neutral fallback, locale switching), size constraints with correct units and singular/plural variants, format-specific sentences, remaining named constraints (multipleOf, unrecognized keys, enum), and a catch-all "nothing falls through to Zod English" block.

## Relationships

- **`src/infrastructure/http/validation-messages.ts`** – The module under test; `registerValidationMessages` is its sole export consumed here.
- **`src/infrastructure/i18n/catalog.ts`** – Source of `readLocaleDictionary`, used to load the `en` and `it` dictionaries for expectations.
- **`src/infrastructure/i18n/context.ts`** – Source of `runWithLocale`, used to assert locale-aware rendering (Italian case).
- **`src/infrastructure/i18n/index.ts`** – Barrel re-export through which `translator` and the other helpers are imported.
- **`tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`** – Shares the i18n validation-attribute concern; exercises the scaffold script that removes attribute labels, a sibling concern to the label-resolution tests here.

## Notes

- The map is installed on the **Zod singleton**, so order matters: `registerValidationMessages()` must run before any parse. The `beforeAll` hook handles this, but parallel test runners or a missing import will silently let Zod's default English through.
- Label resolution walks the issue path **from the innermost labelled segment outward**, skipping array indexes and unlabelled segments (e.g. `record` keys). The tests explicitly assert each fallback tier.
- Singular vs. plural messages are separate i18n keys (`too-big-items-one` vs. `too-big-items`). A constraint boundary of exactly 1 must hit the `*-one` key; this is a common source of copy drift.
- `z.set()` is tested under "items" (not "characters"), confirming the mapper treats Sets like arrays for unit selection.
- The "nothing falls through" block includes a bare `.refine()` with no message and a failed `z.union`, both of which previously leaked Zod's `"Invalid input"` string.
