/**
 * @module
 * Card details as they cross the provider port, and the one safe projection of a card number.
 *
 * Its own file so both the port and every provider can read it without importing each other.
 */

/** What the provider needs to know about the card. The demo asks for no more than the number. */
export interface CardDetails {
    cardNumber: string;
}

/**
 * The only part of a card number allowed to leave this module — logs, payment documents and
 * analytics all carry these four digits and never the number itself.
 */
export const cardLastFour = (cardNumber: string): string =>
    cardNumber.replaceAll(/\s/gu, '').slice(-4);
