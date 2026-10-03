---
source: scripts/contracts/generate-error-codes.ts
sha256: 1740c0b2a56375cc68df39bfd6f912a7d67099e98df03eba0c62307caf542d5f
generated_at: 2026-10-01T12:26:58.324744+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-error-codes.ts

## Purpose
Generates a TypeScript `error-codes.ts` module (a `const` object + union type) from the `x-error-codes` extension in the shared `openapi.yaml`. It exists so call sites can reference `ERROR_CODES.CART_EMPTY` instead of retyping raw strings, while the contract itself keeps `errors[].code` as an open `string` (CT-D5 / Zalando guideline #112) so adding a code is never a breaking change.

## Key elements
- **`resolveOutputPath()`** – parses the required `--out` CLI flag and resolves it relative to the repo root; exits 1 if missing.
- **`checkOnly`** – boolean flag (`--check`); when set the script diffs output against the existing file and exits 1 on mismatch instead of writing.
- **`renderRow(code)`** – renders one JSDoc-annotated `key: value` line per code, embedding the code's `status` and `description` from the contract so hovering in an editor surfaces the meaning.
- **`ERROR_CODES`** (generated output) – a `const` object mapping each declared code string to itself; keys are sorted alphabetically.
- **`ErrorCode`** (generated output) – a union type derived from `ERROR_CODES` via `(typeof ERROR_CODES)[keyof typeof ERROR_CODES]`.
- **`ErrorCodeEntry` / `OpenApiDocument`** – narrow structural types for the `x-error-codes` fragment read from YAML.

## Relationships
No graph neighbors are recorded. The script is byte-identical in both repos of the pair; it reads only the shared `openapi.yaml` and writes a standalone `error-codes.ts` that is consumed by application code in either repo.

## Notes
- **Deliberately not a Zod `z.enum`** – the catalogue is a compile-time convenience only; it never rejects a code the contract hasn't declared yet. The contract's `code: string` stays open-ended.
- **Byte-identical across repos** – both the backend and frontend keep an exact copy of this script. The input (`x-error-codes`) is collected once in the backend's bundler and shipped to the frontend inside the shared `openapi.yaml`.
- **`Object.hasOwn` guard in `renderRow`** – used instead of a nullish check because `codes` comes from `Object.keys(errorCodes)`; the guard is defensive, not expected to fire. The same pattern appears in `generate-asyncapi-types.ts`.
- **ESM context** – `import.meta.url` is used for path resolution; the script must run via `tsx` (shebang confirms this).
- **`--check` contract** – same exit-code-1-on-mismatch convention as every other generator in this family; safe for CI pre-commit hooks.
