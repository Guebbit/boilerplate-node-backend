/**
 * @module
 * The placeholder an anonymised order carries in place of the buyer's email.
 */

/**
 * What `scrubDueForAnonymization` writes over `email` (the schema requires one). `.invalid` never
 * resolves (RFC 6761 section 6.4), so a mail to it is a guaranteed bounce: buyer mails skip it.
 */
export const ANONYMIZED_EMAIL = 'anonymized@deleted.invalid';
