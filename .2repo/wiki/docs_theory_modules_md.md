# docs/theory/modules.md

## Purpose

Explains the four-tier module architecture (app → modules → kernel → infrastructure) and the dependency rules that make adding or removing a domain a one-folder-plus-one-line operation. It exists so a reader never has to guess which tier a file belongs to.

## Key elements

- **Four-tier table** — defines what each tier knows about, what it may import, and the folder it occupies. Every arrow points down; lint enforces both directions of each edge.
- **Infrastructure / kernel boundary question** — the single decision test: "If this project had no modules at all, would this file still make sense?" Yes → infrastructure; No → kernel.
- **Kernel file inventory (5 files)** — `registry.ts`, `events.ts`, `authentication.ts`, `middlewares/authorizations.ts`, `seed-accounts.ts`. Each has a one-line justification for why it cannot be infrastructure.
- **Infrastructure file inventory** — caches, locale, observability, rate limiting, email/PDF workers, route-flag toggle, worker registration. All domain-free but not kernel because they don't dissolve without modules.
- **Naming rationale** — documents why this repo uses `kernel` (not `platform`, `core`, `common`) and `infrastructure` (not `base`, `utils`), with a cross-project comparison table (VS Code, NestJS, Angular, Spring, Backstage).
- **Authorization port pattern** — `authorizations.ts` lives in kernel behind a port that `account` registers; prevents a `users → account → users` cycle and an upward `modules → app` import.
- **"App" tier justification** — holds bootstrap, system routes, and `modules.ts` because they are the only code allowed to know which domains exist.
- **Where everything else sits** — a flowchart from process entry through `modules.ts` → modules → kernel → infrastructure.

## Relationships

- **`docs/theory/index.md`** — directly linked: this page defers to it for the definitions of "domain" and "barrel".
- **`docs/theory/architecture.md`** — sibling theory page; `modules.md` covers the tier structure that `architecture.md` describes at a higher level.
- **`docs/theory/layers.md`** — complementary: `layers.md` covers the conceptual layering; `modules.md` pins each layer to a concrete folder and file set.
- **`docs/theory/domain-layer.md`** — explains the domain (modules) tier in depth; `modules.md` places that tier in the four-tier dependency graph.
- **`docs/theory/module-lifecycle.md`** — covers what happens at boot (registration, DAG check, event wiring); `modules.md` defines *where* those steps live (kernel vs. app).
- **`docs/theory/request-flow.md`** — traces a request through tiers; `modules.md` defines the tier boundaries that the flow crosses.
- **`docs/reference/src-modules.md`** — the per-module reference; `modules.md` is the architectural page that explains the folder structure those references live in.
- **`docs/reference/src-app.md`** — documents the app tier code; `modules.md` justifies why bootstrap and system routes sit there.
- **`docs/modules/index.md`** — the practical "list of domains" page; `modules.md` is the theory behind why that list is a single array in `modules.ts`.

## Notes

- The `kernel` vs. `infrastructure` distinction is the most commonly confused boundary. The operational test is deletion: if you `rm -rf src/modules/` and the file loses its purpose, it is kernel.
- `seed-accounts.ts` looks like it belongs in the `users` module but lives in kernel to avoid three extra registry edges and a dangling-reference trap. Its own header carries the full argument.
- "Two modules need it" is explicitly *not* a reason to push a shared rule into infrastructure or kernel. It belongs in the owning domain's barrel.
- The naming section is load-bearing: the words `kernel` and `infrastructure` are deliberately chosen over `platform`, `core`, `common`, and `base`. A rename is discouraged as "motion rather than progress."
