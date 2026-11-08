---
source: tests/unit/infrastructure/config/fields.test.ts
sha256: 50927ffd75a4695fa9f2ae2b7c5ac6ae4bef1fecacffb556ca4cc56205c8cefa
generated_at: 2026-11-08T10:11:35.260325+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/fields.test.ts

## Purpose

Unit tests for every builder exported by `src/infrastructure/config/fields.ts`. Each test group verifies three invariants for a given field type: valid input is parsed and normalised, a blank or unset input yields the configured default (or `undefined`/`[]`), and malformed or out-of-set input is **refused** (parse failure) rather than silently coerced to a fallback.

## Key elements

- **`int`** – whole-number parse (incl. zero-padded), min/max bounds, default on `undefined`/blank, rejection of floats, hex, exponents, suffixes.
- **`decimal`** – fractional parse, range enforcement, rejection of scientific notation and leading-dot forms.
- **`flag`** – maps a small set of truthy/falsy strings (`1`, `true`, `yes`, `on`, …) to booleans; rejects ambiguous words like `"maybe"`.
- **`choice`** – trims + lower-cases input; rejects values outside the allowed set with a message naming the set. Accepts the set as an **array or a zero-arg function** (lazy, for registries populated after import).
- **`email`** – trims, validates address shape, throws on invalid rather than treating as unset; blank → `undefined`.
- **`text` / `secret`** – trimming, optional `case` normalisation. `secret` additionally exposes `sensitive: true` and a `presence` object (`minLength`, `placeholder`, `productionOnly`).
- **`csv`** – splits on comma, trims members, drops blanks; defaults to `[]` when unset (not `undefined`); per-member `case` option.
- **`keyRing`** – same list semantics as `csv` but marks the field `sensitive`.
- **`versionedKeyRing`** – parses `v2:a, b` into `{version, key}` objects; a bare member is treated as `v1`.
- **`timeZone`** – stores canonical IANA spelling (e.g. `europe/rome` → `Europe/Rome`); rejects offsets and non-IANA names.
- **`currency`** – stores ISO-4217 code upper-cased; rejects names, symbols, non-three-letter strings.
- **`country` / `countries`** – two-letter ISO code (upper, trimmed); `countries` is the CSV variant; both reject non-two-letter members.

## Relationships

- **`src/infrastructure/config/fields.ts`** — the sole import target. Every `describe` block exercises one or more of its exports (`choice`, `countries`, `country`, `csv`, `currency`, `decimal`, `email`, `flag`, `int`, `keyRing`, `secret`, `text`, `timeZone`, `versionedKeyRing`). No other modules are imported.

## Notes

- The file header comment states these tests were written around inputs that *were once a silent fallback*; the contract under test is that they are now **hard refusals**.
- `choice`'s set parameter can be a **function**, evaluated on every parse. The test demonstrates a registry that is empty at construction time and filled later—this is the one builder whose accepted input shape is polymorphic (array vs. callable).
- `csv` and `countries` default to `[]` when the input is `undefined`, unlike scalar fields which default to `undefined`. This asymmetry is intentional and covered by explicit assertions.
- `secret` and `keyRing` expose a `sensitive` boolean outside the schema; `secret` also carries a `presence` object. These are structural properties, not parse-time behavior.
- `versionedKeyRing` assigns a default version of `'v1'` to members that lack an explicit `vN:` prefix—only the `versionedKeyRing` test exercises this inference.
