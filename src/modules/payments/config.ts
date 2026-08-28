/**
 * The one value a deployment tunes about money, read in one place.
 *
 * Same arrangement as `@modules/inventory`'s `config.ts`, and for the same two reasons. It is read
 * per call rather than captured at import, so an operator changing the variable affects the next
 * intent rather than the next restart, and a test can set it per case without knowing which import
 * order froze it. And it is a file rather than an expression inside the service, because a second
 * reader is a matter of time — the currency is already documented in two places (`.env-example`
 * and `model.ts`'s `currency` field) and the moment a price formatter or a report wants it, the
 * fallback gets transcribed and the two copies start disagreeing about what an unset deployment
 * charges in.
 */

/**
 * The currency every payment is denominated in — ISO-4217, one per deployment.
 *
 * Stamped onto each payment document at intent time rather than read back at display time, so a
 * deployment that changes it leaves money already taken denominated in what it was actually taken
 * in. That is the model's rule (`currency` is a required field on the document, not a lookup) and
 * this function is only where the default comes from.
 *
 * Absent means `EUR`; a variable set to something meaningless is NOT second-guessed here, which is
 * deliberate. A currency has no arithmetic to go wrong the way an interval does — the write simply
 * carries whatever three letters the deployment asked for, and the model's `required` refuses a
 * blank one loudly rather than quietly substituting euros for a misconfiguration.
 *
 * @returns the ISO-4217 code to stamp on new payments
 */
export const defaultCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';
