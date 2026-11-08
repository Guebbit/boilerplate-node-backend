---
source: tests/support/ids.ts
sha256: 28372ab68003db0551cf91165f07d8f2d467bd97f969f6571cb94ac87eeb72ec
generated_at: 2026-11-08T09:55:44.681835+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ids.ts

## Purpose

Provides a single shared fake `ObjectId` for test suites. It exists so that "not found" scenarios (`findById`, `removeById`, route-param lookups) can reference a syntactically valid but guaranteed-absent ID without risking collision with a real document that a sibling test might create.

## Key elements

- **`MISSING_ID`** (`'f'.repeat(24)`) — A 24-character string that satisfies ObjectId format constraints but reads as obviously synthetic (all `f`s), making it safe to use in any test that needs a valid-shaped ID that will never match a real document.

## Relationships

Imported by contract and integration test files across multiple modules (`account`, `addresses`, `cart`, `delivery`, `example`, `inventory`, `invoicing`, `locales`, `notifications`, `orders`) as a shared "missing document" fixture, replacing the need for each test file to define its own fake ID.

## Notes

- The all-`f` pattern is deliberate: a random hex string could be mistaken for a real ID by a developer reading logs or diffs; `ffff…` is immediately recognizable as a placeholder.
- This is a constant, not a generator — every test that imports it gets the *same* ID. That is fine because it is only meant to never match, but it means two tests in the same file cannot both seed a document with this ID and then look it up.
