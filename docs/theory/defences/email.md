# Email and notifications

Mail is a security surface twice over: it is the channel account recovery runs through, so whoever
holds the mailbox effectively holds the account — and it is an outbound capability an attacker can
borrow, to send spam or phishing with your domain's reputation behind it.

Three directions, and they are genuinely different problems:

| Direction                    | The risk                                   |
| ---------------------------- | ------------------------------------------ |
| Mail this app sends          | content and headers an attacker influenced |
| Mail claiming to be this app | spoofing, because nothing proves otherwise |
| How much mail                | the send endpoint as an amplifier          |

## Mail this app sends

| Attack                       | How it works                                                                                   | This boilerplate                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template injection in email  | names or messages rendered into a template without escaping                                    | EJS interpolates with `<%= %>`, which HTML-escapes; the only `<%- %>` in the templates is `include(…)` of a fixed layout path — `shared/templates/emails/`                                                                                              |
| Header injection             | a newline in `subject` or `from` adds `Bcc:` or new recipients                                 | The contact form's `subject` IS user text, and it IS concatenated into the mail's Subject — nodemailer's `mime-node` strips CR/LF from every header value, so the stop is the LIBRARY's, not this codebase's — `feedback/emails.ts#contactRequestEmail` |
| Link poisoning               | links built from the `Host` header point at the attacker                                       | Every link in an email is `NODE_URL` plus a route and a token — the `Host` header is not read anywhere in this codebase — `account/emails.ts`. Same answer as [Host header injection](injection.md#into-a-path-or-a-model).                             |
| Address parser differentials | the validator and the mailer disagree — `user@victim.com(@attacker.com)`, punycode look-alikes | The recipient is always a stored, validated `user.email` or the operator mailbox from config — never a value assembled at send time — `infrastructure/adapters/mailer.ts`                                                                               |
| Notification content leakage | order details or codes in a plaintext preview                                                  | A delivered 2FA code is the only secret an email carries, and it is single-use, time-boxed and deleted the moment it is spent — `account/two-factor/delivered-codes.ts`                                                                                 |
| Tracking pixels / privacy    | mail opens tracked without consent                                                             | No tracking pixel is embedded in any template — `shared/templates/emails/`                                                                                                                                                                              |

**Why the header-injection row names the library rather than a guard.** It is the honest verdict:
this codebase does not strip CR/LF from that subject, nodemailer does. Writing "sanitised" here
would claim a control that is not in `src/` — and the day nodemailer is swapped for something
else, this row is the note that says what the replacement has to do.

## Mail claiming to be this app

| Attack         | How it works                                    | This boilerplate                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email spoofing | no SPF, DKIM or DMARC on the sending domain     | DNS records, not code — the domain owner's. The recipe, including why `p=reject` published too early destroys your own mail, is [Email authentication](../../tools/deployment-hardening.md#email-authentication-spf-dkim-dmarc). |
| Open relay     | a misconfigured SMTP server sends anyone's mail | No surface: this application is an SMTP CLIENT, never a server.                                                                                                                                                                  |

## How much mail

An unbounded send endpoint is two attacks at once: a bomb aimed at one victim's inbox, and a way
to burn your domain's sending reputation using your own credits.

| Attack                       | How it works                                   | This boilerplate                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email bombing / resend abuse | unlimited resend endpoints                     | `credentialLimiters` on `/reset`, `/verify-request` and the 2FA send route; `mfaSendLimiter` bounds outbound CODES separately from guesses, because sending and guessing are different budgets — `infrastructure/http/middlewares/rate-limit.ts` |
| Spam via forms               | contact or invite features relay attacker text | See [Automation and abuse](automation-and-abuse.md#accounts-and-content-at-scale) — the honeypot field.                                                                                                                                          |
| SMS pumping                  | toll fraud through an SMS sending endpoint     | No surface: there is no SMS factor. See [The second factor](authentication.md#the-second-factor) for why that is a deliberate absence.                                                                                                           |

## The address itself

| Attack                     | How it works                                                    | This boilerplate                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified email at signup | the account is bound to an address the user does not own        | 🚧 Coming soon. Today nothing enforces `verified` — no route, no middleware, no guard reads it.                                                                               |
| Pre-account-takeover       | the attacker registers the victim's address, who later links in | Same row. The OAuth link path is the one place that demands a verified address, and it demands it of the PROVIDER — see [Federated login](authentication.md#federated-login). |

## Boot-time refusal

An SMTP host configured without its credentials stops the boot rather than failing silently on the
first password reset — `kernel/required-config.ts`. Mail that quietly does not send is worse than
mail that fails loudly: the reset flow appears to work and the user simply never receives it.

## Related

- [Authentication](authentication.md#recovery-and-changing-the-credential) — the flows that depend on the mailbox
- [Injection](injection.md#into-a-protocol-or-a-document) — the CRLF family this page's header row belongs to
- [Denial of service](denial-of-service.md#making-the-server-do-the-work-outward) — outbound amplification
- [Email and rendering](../../tools/email-and-rendering.md) — how the templates work
