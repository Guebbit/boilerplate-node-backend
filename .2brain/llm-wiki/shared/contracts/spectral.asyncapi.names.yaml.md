---
source: shared/contracts/spectral.asyncapi.names.yaml
sha256: fb3e34113f61d2f1912050066d728ca2f07a9bb5501716359a92da6774bf74f2
generated_at: 2026-11-08T03:08:08.975354+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.asyncapi.names.yaml

## Purpose

Spectral ruleset that enforces US English spelling in all machine-readable names within the bundled AsyncAPI contract. It exists as a standalone lint target (`npm run lint:asyncapi:names`) so that spelling compliance can be checked independently of structural or parser rules.

## Key elements

- **`names-in-us-english-channels`** — Flags channel keys (under `$.channels`) that match British English patterns.
- **`names-in-us-english-messages`** — Same check applied to message keys in `$.channels[*].messages` and `$.components.messages`.
- **`names-in-us-english-operations`** — Same check on `$.operations` keys.
- **`names-in-us-english-schemas`** — Same check on `$.components.schemas` keys.
- **`names-in-us-english-properties`** — Same check on every key under any `properties` object (recursive JSONPath `$...properties`).
- **`names-in-us-english-enum-values`** — Same check on the string values inside any `enum` array.
- **`&british` / `*british` YAML anchor** — A single `notMatch` regex (cancell*, catalogue, fulfil, colour, behaviour, licence, and common *-ise / *-isation suffixes) shared by all six rules via a YAML alias, keeping the pattern defined once.

All rules use severity `error` and the Spectral `pattern` function against the `@key` (or the enum value itself).

## Relationships

- **`shared/contracts/spectral.yaml`** — This file is explicitly described as the "twin" of the `names-in-us-english-*` rules that live in `spectral.yaml` (AIP-190 / Zalando guideline #103). The two files enforce the same spelling policy; `spectral.yaml` targets OpenAPI/other specs, while this file targets AsyncAPI documents.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — A sibling Spectral ruleset for the same AsyncAPI contract that covers structural/module-level concerns. Both are invoked under the `lint:asyncapi` umbrella; this file handles only spelling.

## Notes

- The file deliberately has **no `extends`**: the AsyncAPI parser's built-in rules already run in the `lint:asyncapi` step, so adding them here would duplicate checks. This file contributes only the spelling overlay.
- The regex is a **negative match** (`notMatch`): it flags names that *do* contain British forms. Prose (descriptions, titles) is intentionally not checked—only identifiers and enum values.
- Because the regex is anchored via a YAML alias, editing it in one place updates all six rules. Be aware that adding a new name-bearing JSONPath location requires a **new rule entry**, not a change to the shared pattern.
- `fulfil` uses a lookahead `(?!\l)` to avoid false-positives on `fulfill`.
