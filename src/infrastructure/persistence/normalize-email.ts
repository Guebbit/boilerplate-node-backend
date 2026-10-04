/**
 * @module
 * The one normalisation an email address gets before it is stored, looked up or compared anywhere
 * in the app — trim, then lowercase. Shared so `users`' schema-level cast, an infrastructure
 * budget keyed on a submitted address, and any other module's own email field cast the same way a
 * login lookup does; two different casings of one address must never look like two callers, or
 * two rows.
 */

/** Trim and lowercase an email address, the one way this app ever normalises one. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Providers that ignore dots in the local part and deliver `googlemail.com` to `gmail.com`. */
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * The MAILBOX an address delivers to, for budgets only: lowercase, the `+tag` dropped, and the dots
 * dropped where the provider ignores them (Gmail). `a+1@x`, `a+2@x` and `A@x` are one inbox, so a
 * budget on the mailbox is not escaped by minting a new tag.
 *
 * Never used for storage or uniqueness: two accounts may legitimately register `a@x` and `a+shop@x`
 * (GitHub, Google and Shopify all allow it), and rewriting a stored address would change who the
 * account says it is. A tag is dropped only after a non-empty local part, so `+@x` stays as it is.
 *
 * @param email - an address as submitted
 * @returns the canonical mailbox, `local@domain`
 */
export const canonicalMailbox = (email: string): string => {
    const normalized = normalizeEmail(email);
    const at = normalized.lastIndexOf('@');
    if (at < 1) return normalized;

    const domain = normalized.slice(at + 1);
    const plus = normalized.indexOf('+');
    const withoutTag = normalized.slice(0, plus > 0 && plus < at ? plus : at);
    if (!DOT_INSENSITIVE_DOMAINS.has(domain)) return `${withoutTag}@${domain}`;

    return `${withoutTag.replaceAll('.', '')}@gmail.com`;
};
