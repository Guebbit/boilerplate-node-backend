# docs/theory/glossary.md

## Purpose

Defines the ubiquitous-language terms **per bounded context** (module), capturing the meaning and constraint behind each identifier that the code itself cannot express. It exists to make cross-module divergence of terminology explicit and intentional, rather than hidden in a shared dictionary.

## Key elements

- **Per-module term tables** — Each section (`account`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `observability`, `orders`, `payments`, `products`, …) lists the identifiers that module uses with a module-specific definition and the constraint behind it.
- **Framing tip** — A callout establishing that the identifiers in code *are* the ubiquitous language; this page carries only the meaning and constraint an identifier cannot.
- **Explicit divergence examples** — e.g. `softDelete` means "withdrawal from sale" in `products` but "destroyed account" in `users`; `Availability` is a pre-flight check in `cart` and a re-check inside the write in `inventory`.
- **Cross-references within definitions** — Terms reference sibling modules (e.g. `cart` → `inventory`, `orders` → `payments` → `inventory`, `delivery` → `cart`).

## Relationships

- **`docs/theory/strategic-ddd.md`** — This page links out to the *Ubiquitous Language* section of that document to justify *why* the glossary is split per context rather than shared. The strategic doc provides the architectural rationale; this page is the concrete vocabulary.
- **`docs/theory/domain-layer.md`** — The domain-layer doc describes the structural layout of `domain/` subdirectories (e.g. `domain/rates.ts`, `domain/lifecycle.ts`, `domain/transitions.ts`) that several glossary entries reference as the source-of-truth location for closed sets and transition tables.

## Notes

- The glossary is **deliberately not a flat list**. The same word may appear in multiple modules with different definitions; that is the design, not a bug.
- Several entries encode invariants that are otherwise only visible in code (e.g. `Available` is "derived everywhere, stored nowhere"; `Account deletion` is always two steps; `Confirm` can only be set by `system` in the lifecycle table). Treat these as design constraints, not just descriptions.
- The `products` section is truncated in the stored copy; verify against the full file before relying on a complete product vocabulary.
- `locales` distinguishes *Language* (a DB registration) from *Scope* (what the API actually does with it) — a language row in the DB does not by itself enable API responses in that language.
