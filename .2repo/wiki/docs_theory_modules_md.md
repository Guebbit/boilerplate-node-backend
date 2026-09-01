# docs/theory/modules.md

## Purpose

Explains the four-tier directory architecture (`app` → `modules` → `kernel` → `infrastructure`), the one-directional dependency rule, and the exact criterion for deciding which tier a file belongs to. Exists so that adding or removing a domain is a mechanical act (one folder, one registry line) and so the `kernel`/`infrastructure` boundary — the line people most often cross — has a single unambiguous test.

## Key elements

- **Four-tier table** — `src/app` (assembly), `src/modules/<name>` (one domain each), `src/kernel` (the module system itself), `src/infrastructure` (substrate). Arrows point down only; lint enforces both directions.
- **`src/kernel/` (5 files)** — `registry.ts` (AppModule, DAG check, `registerModules`), `events.ts` (inter-module messaging), `authentication.ts` (auth port), `middlewares/authorizations.ts` (guard consuming that port), `seed-accounts.ts` (shared demo IDs owned by no single module).
- **Infrastructure/kernel boundary test** — "If this project had no modules, would this file still make sense?" Yes → infrastructure; No → kernel. Being domain-free alone is insufficient.
- **Auth port pattern** — kernel declares "turn this token into a user"; `account` module registers an implementation at boot. Avoids a `users ↔ account` cycle and prevents modules from importing upward into `app`.
- **Naming rationale** — why `kernel` (microkernel: loads plugins it has never heard of) and `infrastructure` (hexagonal substrate) were chosen over `platform`, `core`, `common`, `base`; documents the overloading problem with "core" across NestJS, Angular, Spring, VS Code, Backstage.
- **"App" tier justification** — holds bootstrap steps and the system route; the only tier allowed to know *which* domains exist. Test: does it need to know domain identities?
- **Middleware / adapter placement table** — response cache, locale, observability, rate-limit, route-flag, email/PDF workers all live in `infrastructure` because none of them require module knowledge.

## Relationships

- **`docs/theory/index.md`** — parent page; defines the shared vocabulary (domain, barrel, tier) that this page references.
- **`docs/theory/layers.md`** — broader layering discussion; this page is the concrete instantiation of the tier rule for `src/`.
- **`docs/theory/architecture.md`** — overall system architecture; this page covers the directory-level dependency contract that architecture enforces.
- **`docs/theory/module-lifecycle.md`** — covers what happens at runtime when a module loads; this page covers *where* the code lives and *who may import whom*.
- **`docs/theory/request-flow.md`** — traces a request through the tiers; this page explains why the tiers are ordered the way they are.
- **`docs/theory/domain-layer.md`** — domain-layer responsibilities; this page's "Modules" tier row and the barrel rule connect to it.
- **`docs/reference/src-modules.md`** — per-module API reference; this page explains the structural rules those modules follow.
- **`docs/reference/src-app.md`** — reference for `src/app` and `src/modules.ts`; this page justifies why those files sit at the top tier.
- **`docs/modules/index.md`** — catalog of concrete domains; this page defines the folder-per-domain rule that catalog assumes.
- **`docs/getting-started.md`** — onboarding; links here as the conceptual prerequisite before reading module code.
- **`README.md`** — top-level project overview; this page is the "why" behind the directory layout it lists.

## Notes

- The `kernel` tier is deliberately five files. If a new file is added there, the boundary test must be re-applied; "two modules share this rule" is explicitly *not* a valid reason to place it in kernel or infrastructure — the rule belongs to the owning domain's barrel.
- `seed-accounts.ts` is the most common "why is this in kernel?" question. It holds demo-ID *handles* (not user records) so that `orders`, `cart`, and `wishlist` can reference a person without importing `@modules/users`. The file's own header comment carries the full argument.
- The naming section documents a deliberate decision *not* to rename `kernel` → `platform` despite VS Code precedent. The names are locked; a rename would be "motion rather than progress."
- `src/modules.ts` and `app.ts` sit beside `src/app/` (not inside it) because the registry names every enabled domain — nothing below `app` may do that.
