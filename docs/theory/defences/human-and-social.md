# Human and social

Attacks on people, not code. The family every other page's controls route around: no amount of
token rotation helps when the user types their password into a convincing copy of your login page,
and no authorization model helps when support is talked into changing an email address.

Included rather than omitted for one reason: **software decides how much a successful social
attack is worth.** Phishing is not preventable from a codebase, but "phished credential equals
full account takeover" versus "phished credential equals one factor of two, and still cannot
change the email" is entirely a design decision.

## Getting the credential from the person

| Attack                              | How it works                                          | What this codebase changes about it                                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phishing                            | a look-alike domain and an urgent message             | Cannot be prevented here. What it is WORTH is reduced: TOTP means a captured password is one factor, and step-up means the captured session still cannot change the email or delete the account — see [Step-up authentication](authentication.md#step-up-authentication). |
| Spear phishing / whaling            | a researched pretext aimed at one person              | Same, and more so — the highest-value accounts are the ones step-up protects hardest, since staff writes carry permission keys.                                                                                                                                           |
| Smishing / vishing / quishing       | the same idea over SMS, voice or a QR code            | No SMS is sent by this application, so a message claiming to be from it over that channel is prima facie false.                                                                                                                                                           |
| Homograph / IDN attack              | a domain visually identical in Unicode                | DNS and the registrar. Every link this app sends is built from `NODE_URL`, so a genuine mail never points anywhere else — `account/emails.ts`                                                                                                                             |
| Typosquatted domains                | `exmaple.com` registered by an attacker               | The domain owner's, defensively.                                                                                                                                                                                                                                          |
| Open-redirect-assisted phishing     | a trusted domain in the link that bounces away        | **Closed here.** No redirect target is caller-supplied — see [Cross-origin reading and navigation](client-side.md#cross-origin-reading-and-navigation).                                                                                                                   |
| Consent phishing                    | an OAuth app that looks legitimate harvests scopes    | No surface: this application is an OAuth CLIENT, never a provider, so there is no consent screen here to imitate.                                                                                                                                                         |
| Fake browser updates / tech support | injected banners persuade the user to install malware | Outside any application's control.                                                                                                                                                                                                                                        |
| Baiting / malvertising              | malicious ads or fake downloads                       | Outside; no ad network is embedded.                                                                                                                                                                                                                                       |
| Watering hole                       | a third-party site the target visits is compromised   | Outside.                                                                                                                                                                                                                                                                  |

## Getting it from the staff

The attack that actually works against well-built systems: don't break the control, ask someone
with the authority to disable it.

| Attack                          | How it works                                                           | What this codebase changes about it                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pretexting support              | a fake identity persuades staff to reset a password or change an email | Staff-assisted 2FA reset (`DELETE /users/:id/2fa`, `users.update`) is deliberately the ONLY recovery path from a lost authenticator and lost backup codes — and it is audited, so the action has a name attached. There is intentionally no self-service email reset, because that would reduce 2FA to mailbox possession, the exact thing it exists to defend against. |
| Insider threat                  | legitimate access misused; no least privilege, no audit                | Permission keys are per-action, not per-role-blob, and auditable actions are registered and asserted by `tests/cross-cutting/audit-actions-registered.test.ts`. A staff write leaves a record; see [Authorization](../authorization.md).                                                                                                                                |
| MFA fatigue                     | repeated push prompts until one is approved                            | Out of reach by construction — no push factor exists. See [The second factor](authentication.md#the-second-factor).                                                                                                                                                                                                                                                     |
| SIM swap                        | the carrier moves the victim's number                                  | Out of reach by construction — no SMS factor exists.                                                                                                                                                                                                                                                                                                                    |
| Shoulder surfing / device theft | physical access to an unlocked device                                  | Refresh tokens are revocable per session, so a lost device can be cut off without changing the password — `account/routes.ts`' session management, behind step-up.                                                                                                                                                                                                      |

## What a boilerplate can honestly claim here

Not much, and the honest framing is the deliverable:

- **Nothing on this page is closed by code.** Every row's real control is a process — training,
  a verification script for support, a registrar lock.
- **Three rows ARE closed**, and only because the feature they attack was never built: consent
  phishing, MFA fatigue and SIM swap. Not building a factor is a legitimate defence, and it is the
  cheapest one available.
- **The rest is blast radius.** Two factors, short-lived access tokens, step-up on anything that
  matters, revocable sessions, and an audit trail on staff writes. Each one converts "compromised"
  into "compromised, and here is exactly how far it got".

## Related

- [Authentication](authentication.md) — the factors and the step-up gate
- [Email](email.md#mail-claiming-to-be-this-app) — SPF/DKIM/DMARC, the anti-spoofing half
- [Authorization](../authorization.md) — least privilege for staff accounts
- [Infrastructure](infrastructure.md#seeing-it-happen) — the audit trail
