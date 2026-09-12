# Deployment hardening

Recipes for the controls this codebase **cannot** implement, because they live in DNS, in CI, in
the network, or in a reverse proxy — not in `src/`.

Every row in [Web Attacks & Defences](../theory/defences/) that reads _"Not this layer"_ or _"the
deployment's"_ points here. That verdict is honest but useless on its own: naming an owner is not
the same as telling them what to do. This page is the other half.

**Provider-neutral on purpose.** Each recipe gives the shape, the record, or the command — not a
vendor. Where a concrete tool is named (cosign, syft) it is because an open-source de-facto
standard exists, and an equivalent is always noted.

## The recipes

| Recipe                                                                   | Answers                                         | Status here          |
| ------------------------------------------------------------------------ | ----------------------------------------------- | -------------------- |
| [1 · TLS termination](#tls-termination)                                  | §9 missing TLS, weak ciphers, SSL stripping     | documented elsewhere |
| [2 · Email authentication](#email-authentication-spf-dkim-dmarc)         | §17 email spoofing                              | **recipe below**     |
| [3 · Supply-chain provenance](#supply-chain-provenance-sbom-and-signing) | §14 unsigned artefacts, no SBOM                 | **recipe below**     |
| [4 · Edge rate limiting](#edge-rate-limiting-and-waf)                    | §13 no WAF at the edge, §11 volumetric DDoS     | **recipe below**     |
| [5 · Egress and cloud metadata](#egress-filtering-and-cloud-metadata)    | §7 cloud metadata, §13 missing egress controls  | **recipe below**     |
| [6 · Network segmentation](#network-segmentation)                        | §13 flat network, exposed management interfaces | **recipe below**     |
| [7 · Backups and restore](#backups-and-tested-restore)                   | §13 backup and DR gaps                          | documented elsewhere |
| [8 · Object storage](#object-storage-for-uploads)                        | §11 storage exhaustion, §13 public buckets      | **recipe below**     |
| [9 · Clock](#clock)                                                      | §13 time drift                                  | **recipe below**     |

## TLS termination

Already written up — do not duplicate it here:

- [Putting a reverse proxy in front](../getting-started-production.md#putting-a-reverse-proxy-in-front)
  — why `docker-compose.production.yml` binds the API to loopback, and the nginx / Caddy / Traefik
  options.
- [Many clients behind one proxy](./two-client-stacks.md#many-clients-behind-one-proxy) — the
  Traefik overlay for several stacks on one host.

The app already sends `Strict-Transport-Security` via `helmet()`. **HSTS preload** is the one piece
neither the app nor the proxy can do: submit the apex domain at
[hstspreload.org](https://hstspreload.org/), and only once you are certain every subdomain can
serve HTTPS forever — preload removal takes months.

## Email authentication (SPF, DKIM, DMARC)

Without these, anyone can send mail claiming to be your domain, and your genuine password-reset
mail lands in spam. Three DNS records, in this order — **DMARC last**, and only after the first two
are verified passing.

```dns
; SPF — who may send as this domain. One record only; more than one is a permanent failure.
example.com.        TXT  "v=spf1 include:_spf.your-provider.example -all"

; DKIM — the provider gives you the selector and the public key.
sel1._domainkey.example.com.  TXT  "v=DKIM1; k=rsa; p=MIGfMA0GCSq..."

; DMARC — start at p=none and WATCH the reports before tightening.
_dmarc.example.com. TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s"
```

| Step | Do                                                                                  |
| ---- | ----------------------------------------------------------------------------------- |
| 1    | Publish SPF with `-all` (hard fail), not `~all` — a soft fail is widely ignored     |
| 2    | Publish DKIM, then send a test mail and confirm `dkim=pass` in the received headers |
| 3    | Publish DMARC at `p=none` and read the aggregate reports for a few weeks            |
| 4    | Move to `p=quarantine`, then `p=reject`, once no legitimate source is failing       |

**The trap:** every system that sends as your domain — the app, invoicing, a CRM, a newsletter tool
— needs to be in SPF and DKIM. `p=reject` published before you have inventoried them silently
destroys mail from the one you forgot. That is what `p=none` plus reports is for.

Related: [Email & PDF rendering](./email-and-rendering.md) for the SMTP side this app controls.

## Supply-chain provenance: SBOM and signing

Answers §14 "unsigned / unverified artefacts". Two separate wins, and **the SBOM is the one that
pays off first** — signing matters when other people run your images; an SBOM matters the first
time a CVE lands and you need to know whether you are affected.

### SBOM

```bash
# syft — CycloneDX or SPDX from the built image. Anchore, Apache-2.0.
syft <image>:<tag> -o cyclonedx-json > sbom.cdx.json
```

Attach it to the image rather than leaving it in a CI log, which expires with the log. Then a CVE
question becomes a query over stored SBOMs instead of a rebuild.

`docker sbom` and `trivy image --format cyclonedx` produce the same thing if syft is unwelcome.

### Signing

```bash
# cosign keyless — the signature is bound to the CI workflow identity via OIDC.
# No key to store, rotate, or leak. Sigstore, Apache-2.0.
cosign sign --yes <image>@<digest>
cosign attest --yes --predicate sbom.cdx.json --type cyclonedx <image>@<digest>

# Verify, at deploy time:
cosign verify <image>@<digest> \
  --certificate-identity-regexp '^https://github\.com/<org>/<repo>/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

**Sign the digest, never the tag.** A tag is mutable; signing `:latest` proves nothing about what
is actually running.

| Constraint                     | Consequence                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Keyless needs an OIDC issuer   | works in GitHub Actions / GitLab CI. Elsewhere, use `cosign generate-key-pair` and accept owning a key |
| Registry must accept referrers | any OCI 1.1 registry does; some older self-hosted ones do not                                          |
| Verification must be enforced  | a signature nobody checks at deploy is decoration                                                      |

**Where it goes in this repo:** `.github/workflows/ci.yml`, beside the existing `audit` job, and
like `audit` it should **alert rather than gate** — a missing SBOM must not block a merge.

## Edge rate limiting and WAF

The app has a per-address burst brake plus credential budgets
([rate limits](./security.md#the-rate-limit-budgets)), and every one of them is keyed on an IP
address — which [is a weak key](../theory/defences/automation-and-abuse.md#why-the-table-above-is-weaker-than-it-looks).
None of it helps against a volumetric flood, because the packets still arrive.

What to put at the edge, in order of value:

| Control                    | Why it must be upstream                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| Volumetric DDoS absorption | a single origin cannot absorb a botnet; only a network with capacity can |
| Connection / request caps  | cheaper than the app's, and applied before the process is touched        |
| Geo or ASN rules           | blunt, but effective against a scripted run from one hosting ASN         |
| Managed rule sets          | catches generic scanner traffic before it reaches the app                |

**Two rules that matter more than the choice of product:**

1. **Preserve the client IP** — the app reads `X-Forwarded-For` by HOP COUNT (`NODE_TRUST_PROXY_HOPS`).
   Adding an edge means adding a hop; if the count is not updated, every caller buckets together and
   the app's own limits become worthless. See
   [`trust proxy`](./security.md#trust-proxy-and-the-two-ways-to-get-it-wrong).
2. **Do not let the edge replace the app's limits.** The credential budgets are per-identity and
   spent only by failures — an edge product cannot see that distinction.

## Egress filtering and cloud metadata

This repo has no SSRF primitive: every outbound `fetch` has a hard-coded host
([SSRF](../theory/defences/ssrf.md)). Egress filtering is the belt to that braces — it bounds the
damage if that ever stops being true, or if a dependency is compromised.

| Control             | Recipe                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| Cloud metadata      | require IMDSv2 (token-based) and set the hop limit to 1, so a container cannot reach it |
| Link-local          | block `169.254.0.0/16` and `fd00:ec2::254` outbound from the app's network              |
| Private ranges      | block outbound to `10/8`, `172.16/12`, `192.168/16` except the compose network          |
| Default-deny egress | allow only the OAuth providers, the SMTP host, and the analytics collector              |

The allowlist is short precisely because the app's outbound surface is small — that is what makes
default-deny practical here rather than aspirational.

## Network segmentation

`docker-compose.production.yml` already does the important half: Mongo, Redis and RabbitMQ publish
**no ports**, and the app publishes one, bound to loopback. The compose network is the segment.

What a deployment adds beyond that:

| Risk                             | Recipe                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Host reachable from anywhere     | firewall the host itself; the compose port binding is not a firewall                       |
| Backing services on a shared LAN | put them on their own network or VPC subnet, not the one the app shares with other tenants |
| Management interfaces            | never publish a database UI. Reach them through an SSH tunnel or a bastion                 |
| SSH                              | key auth only, no password auth, no root login                                             |

## Backups and tested restore

Already written up: [Backups](./backups.md) — resticprofile, the config, and `--oplog`.

The one thing worth repeating, because it is the failure everyone actually has: **an untested
restore is not a backup.** Schedule a real restore into a scratch database on a calendar, not on
good intentions.

## Object storage for uploads

Uploads are written to the app server's own disk under `NODE_PUBLIC_PATH`. That is deliberate —
[no third-party sub-processor](../theory/data-protection.md) — and it has two consequences a
deployment inherits:

- **A full disk takes the whole app down**, not just uploads. Until a per-account quota exists
  (tracked as an open item), a disk watermark alarm is the cheap backstop.
- **Replicas do not share what they store.** More than one app container needs shared storage; the
  durable answer is an S3-compatible `ImageStore` implementation — see
  [scaling out](../getting-started-production.md).

If a bucket is added: block public access at the bucket level, and keep serving through the app or
a signed URL rather than making objects world-readable. The randomised 16-byte filenames make an
object unguessable, not private.

## Clock

Token expiry, TOTP windows and log ordering all assume the clock is right. The TOTP verifier
tolerates small drift by design (`account/two-factor/totp.ts`), but nothing tolerates a host that
is minutes out.

Run NTP (`systemd-timesyncd` or `chrony`) and alert on offset. In a container, the clock is the
host's — fix it there.

## Keeping this true

These recipes describe systems this repo does not control, so nothing here is machine-checked. Two
habits keep it honest:

- When a defence row's verdict changes from "the deployment's" to a control in `src/`, delete the
  recipe rather than leaving both.
- Re-read the DNS and CI recipes when the provider changes. A DKIM selector or an OIDC issuer is
  provider-specific even though the shape is not.

## Related pages

- [Web Attacks & Defences](../theory/defences/) — the rows each recipe answers
- [Security](./security.md) — the controls this app DOES implement
- [Hosting](./hosting.md) — choosing a host that can satisfy the above
- [Getting started (production)](../getting-started-production.md) — the deploy itself
