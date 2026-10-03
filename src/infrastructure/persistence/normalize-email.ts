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
