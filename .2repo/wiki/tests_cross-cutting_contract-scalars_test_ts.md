# tests/cross-cutting/contract-scalars.test.ts

## Purpose

Guarantees that the scalar bounds declared once in `infrastructure` (page-size maximum, hard-delete default) still match every per-operation constant that orval emits from the OpenAPI contract. Because orval duplicates a shared component into one constant per endpoint, `infrastructure` cannot import a single "the" constant without coupling to a domain name; this test replaces that import-time guarantee with a runtime one that sweeps the entire generated module.

## Key elements

- **`constantsEndingIn(suffix)`** — Filters `Object.entries(generated)` for keys ending in a given suffix, returning `[name, value]` pairs. Used with `'PageSizeMax'` and `'HardDeleteDefault'`.
- **Canary test** (`finds the generated constants…`) — Asserts the sweep yields more than 5 / 2 constants respectively, so a silent rename in orval's naming convention fails loudly instead of passing over an empty set.
- **`agrees with every operation on the maximum page size`** — Every `*PageSizeMax` constant must `safeParse` successfully against `pageSizeSchema`.
- **`rejects one above every operation's maximum`** — `(value + 1)` must *fail* `pageSizeSchema.safeParse`, catching the opposite drift (a lowered contract bound going unnoticed).
- **`agrees with every operation on the hard-delete default`** — Every `*HardDeleteDefault` constant must equal the value produced by `hardDeleteSchema.parse(undefined)`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Source of `pageSizeSchema` and `hardDeleteSchema`. This test is the sole contract link: it asserts that the infrastructure-declared bounds are consistent with all orval-generated per-operation constants, substituting for the import relationship that would otherwise couple infrastructure to a specific domain's generated name.

## Notes

- The test imports the entire generated module (`@api/schemas.zod`) as a namespace and sweeps it by name suffix. Adding a new endpoint to `openapi.yaml` and regenerating requires no test change — the new constant is picked up automatically.
- Both directions of the page-size bound are asserted (accept-at-bound, reject-above-bound) because a one-sided check would let a lowered `maximum` in the contract slip through.
- `hardDeleteSchema` is validated via `.parse(undefined)` rather than a literal, reflecting that the schema's value is its *default* for an absent input.
