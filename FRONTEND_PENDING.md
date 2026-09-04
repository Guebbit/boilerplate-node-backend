# Frontend work from the test-infrastructure pass — `../boilerplate-vue-frontend`

**Nothing is outstanding.** Every item below is applied or resolved; this is the record of what was
done there and why, kept because two of the conclusions are worth not re-deriving.

The durable conclusions have been folded into [Pairing & Ports](docs/tools/pairing-and-ports.md#keeping-the-pair-in-step); this file is the spent working record.

## Already applied — no action

The seed-credential note landed in both frontend files while they were free:

- `.env` and `.env-example` — the `NODE_SEED_ADMIN_PASSWORD`/`NODE_SEED_USER_PASSWORD` block now
  says what the values are for (logging into the demo by hand; `cy.loginAs()` and the `adminApi`
  task), and that they must match whichever paired backend is running plus the hardcoded copy in
  `tests/support/e2e/accounts.ts`.

Phrased backend-agnostically on purpose: the backends are interchangeable and each reads these
same two variable names.

## 0. ~~The contract fork~~ — RESOLVED, and it was not what it looked like

For a while `check:spec-identity` reported `openapi.yaml: FORKED` against the frontend, and the
frontend looked like it was paired with a different backend: its `.env` says
`BACKEND_PATH = ../boilerplate-node-backend`, and its copy was byte-identical to that checkout
rather than to this one.

It turned out `boilerplate-node-backend` and `boilerplate-node-backend-2` are two working copies of
the SAME repository — one `origin`, `git@github.com:Guebbit/boilerplate-node-backend.git`. This
checkout was simply six commits stale, missing the multi-method two-factor work. Merging
`origin/main` made the two contracts identical again.

Worth remembering the next time this check fires from a second checkout: `FORKED` there usually
means _behind_, not _forked_. Pull before concluding anything about pairing.

## 1. ~~Hand over the `PasswordNew` pattern~~ — DONE

`PasswordNew` gained a real complexity pattern here:

```
^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\dA-Za-z]).{8,}$
```

Bundled and handed over with `npm run sync:frontend`, which also regenerated the frontend's own
`contracts/rest/*`. The two `openapi.yaml` copies are byte-identical and `check:spec-identity`
passes.

The frontend needs no code change for it: `usersPasswordSchema` is hand-built from a bare
`z.string()` and never sees the generated constraint — see section 3.

## 2. ~~Fix the interchangeable-backend slip in `accounts.ts`~~ — DONE

`tests/support/e2e/accounts.ts` named `src/kernel/seed-accounts.ts`, a path only the Node backend
has. It now names `NODE_SEED_ADMIN_PASSWORD`/`NODE_SEED_USER_PASSWORD` instead — the two things
every backend shares — and states the failure mode (`cy.loginAs()` cannot log in).

Comment only, no behaviour. Safe to apply regardless of section 0, and applied.

## 3. Nothing else in chunk D reaches this repo — verified

Two things that would have needed work here, checked and clear:

- `usersPasswordSchema` (`src/modules/users/schemas.ts:26`) is built from a bare `z.string()`, not
  extended from the generated `CreateUserBody`. A contract `pattern` therefore cannot inject an
  untranslated English message ahead of its four `translate()` refinements. It only imports the
  `createUserBodyPasswordMin` constant.
- No generated `*Body` zod schema (`SignupBody`, `ChangePasswordBody`, `ConfirmPasswordResetBody`)
  is referenced anywhere in `src/` or `tests/`. The backend's message-ordering bug — a generated
  schema parsed before the translated one — has no equivalent here.

The rule-for-rule mirror between `usersPasswordSchema` and the backend's `zodUserSchema` still has
to be kept by hand. That is unchanged, and out of scope for this pass.

## Decided against — `E2E_ACCOUNTS` through `cy.env()`

The test-infrastructure pass proposed routing `E2E_ACCOUNTS` through the
`process.env.X ?? default` → `env:` → `cy.env()` path that `apiUrl` uses, and asked whether to pay
for it with a global `before()` hook or a per-spec one.

Not doing either. The stated worry is silent drift, and drift here is not silent: diverged
passwords mean `cy.loginAs()` cannot log in and the `adminApi` task cannot authenticate, so the
suite goes red on the next run. It just does not say why — which is what the `.env` note above
fixes, for no machinery and no risk to command timing across every spec.

Revisit only if someone actually runs e2e against a backend with `NODE_SEED_*` overridden. Until
then this buys a failure message, at the cost of touching startup order in every spec.
