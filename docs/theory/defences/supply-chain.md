# Supply chain

Code you did not write, running with your privileges. The uncomfortable part of this family is
that the trust decision was made long before the attack: every `npm install` inherits hundreds of
maintainers, and none of them agreed to be part of your threat model.

Three moments where something can be substituted — **resolve**, **install**, **build** — and a
fourth that is not code at all: what you serve from someone else's host.

## The package itself

| Attack                  | How it works                                                  | This boilerplate                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vulnerable dependencies | a known CVE in a direct or transitive package                 | `npm audit --omit=dev` runs on every push and PR, deliberately OUTSIDE the `ci` gate — a transitive finding with no non-breaking fix must not block every merge, so it ALERTS rather than gates — `.github/workflows/ci.yml`, the `audit` job |
| Malicious packages      | credential theft in a `postinstall`, or a backdoor at runtime | The runtime image installs with `--ignore-scripts` — see [The install](#the-install) — `docker/Dockerfile.production`                                                                                                                         |
| Typosquatting           | `lodahs`, `reqeusts` — a look-alike name                      | Dependencies are added deliberately and reviewed, and `package-lock.json` pins the resolved name and integrity hash of every one.                                                                                                             |
| Dependency confusion    | a public package shadows a private one at a higher version    | No surface: there is no private registry and no scoped internal package, so there is nothing for a public name to shadow.                                                                                                                     |
| Compromised maintainer  | a stolen npm account, a hijacked repo, protestware            | The lockfile is the control: an upgrade is an explicit, reviewable diff rather than something that happens on the next install.                                                                                                               |

**The dependency policy that keeps this list short** is in the repo's root `CLAUDE.md`: check
the repo first, then a maintained library judged on support rather than stars, and only then write
it. Fewer dependencies is the primary defence; every row above is what is left over.

## The install

| Attack             | How it works                                                   | This boilerplate                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install scripts    | lifecycle scripts run arbitrary code with developer privileges | The runtime image installs with `--ignore-scripts`, so no transitive `postinstall` runs at build time — `docker/Dockerfile.production`                                                                                          |
| Lockfile tampering | a PR edits `package-lock.json` to point at a malicious tarball | `npm ci`, never `npm install`, in BOTH image stages — it installs exactly the lockfile and never rewrites it — `docker/Dockerfile.production`. A lockfile change is therefore always a visible diff, never a silent resolution. |

## The build and the image

| Attack                          | How it works                                   | This boilerplate                                                                                                         |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Build-pipeline compromise       | an artefact altered after review               | The build stage IS the gate: `tsc --noEmit && eslint` must pass or no image is produced — `docker/Dockerfile.production` |
| Base-image vulnerabilities      | outdated OS packages in the image              | Pinned to `node:25-alpine` by major only, so a rebuild picks up patches — and only a rebuild does.                       |
| Unsigned / unverified artefacts | no signatures, no SBOM, no reproducible builds | 🚧 Coming soon — image signing and an SBOM are not wired in.                                                             |

## Things served from elsewhere

| Attack                  | How it works                                                | This boilerplate                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Third-party scripts     | tag managers, analytics and chat widgets run in your origin | No surface on this side: this process serves JSON and its own static files, and loads no remote script. The frontend owns its half.                         |
| CDN compromise          | a served file altered, with no Subresource Integrity        | Same — nothing is loaded from a CDN here.                                                                                                                   |
| Browser extension abuse | the user's extension reads the page                         | Outside anyone's control; it is the reason client-side secrets are worth little — see [Client-side](client-side.md#data-the-browser-holds).                 |
| Vendor / SaaS breach    | an integrated service leaks your data                       | The integrations are two OAuth providers and a self-hostable analytics collector. Nothing is shared with a vendor that is not needed to answer the request. |

## Why an unreachable advisory still gets fixed

The puppeteer chain once carried a path-traversal advisory that was genuinely unreachable here —
the vulnerable code serves the browser DOWNLOAD path, and this repo always runs against an
`executablePath`. The major upgrade was taken anyway, and the reasoning generalises:

**"Unreachable" is a claim that has to be re-proved after every change to that dependency.** Over
a few releases that costs more than the upgrade does once. What it cost once was real — an
ESM-only major meant the test suite now maps the package to a stub rather than parsing it — and
that cost was paid in one visible commit instead of spread across every future review.

The inverse case is equally deliberate: `esbuild`'s development-server advisory stays, `low` and
unreachable, because `tsx` uses esbuild as a transpiler and never starts its server. The
difference is that this one does not sit under a dependency that moves.

## Keeping this true

`npm audit --omit=dev` is the source of truth, not this page. Any snapshot of its output is stale
the moment a lockfile moves, which is why none is reproduced here — **run it, do not trust a
transcription of it.** The `audit` job is what keeps the question being asked.

## Related

- [Infrastructure](infrastructure.md) — the image these packages end up in
- [Runtime](runtime.md) — native code, where a dependency's bug becomes memory corruption
- [Dependencies](../../tools/package-dependencies.md) — what each one is for
