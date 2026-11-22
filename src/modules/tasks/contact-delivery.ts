/**
 * @module
 * The contact-delivery port: where a contact message goes instead of becoming a to-do, when the
 * support mailbox is a help desk. Basic mode (no port, or a port that declines) is the default and
 * always remains the safety net: the to-do and the mail to `NODE_SUPPORT_EMAIL`.
 *
 * A module installs the port from its own `onRegistered`, the way `locales` installs the
 * translation port, so `tasks` never names the module that answers.
 *
 * @see docs/modules/tasks-lifecycle.md#lifecycle
 */

/** What the form collected, already normalised and screened: the message a help desk takes over. */
export interface ContactMessage {
    /** The typed name, trimmed; absent when the visitor left it empty. */
    name?: string;
    /** The typed address, normalised. */
    email: string;
    subject: string;
    message: string;
    category?: string;
    orderNumber?: string;
    /** The signed-in sender's account id; absent for an anonymous sender. */
    subjectId?: string;
    /**
     * The email check refused the address (a disposable inbox, no mail server): the help desk files
     * it already closed and tagged as spam, notifying nobody. Never set for a honeypot catch,
     * which stays local.
     */
    suspectedSpam?: true;
    /** When the form arrived. */
    receivedAt: Date;
}

/** What a module supplies to take contact messages over from basic mode. */
export interface ContactDelivery {
    /**
     * Take the message in place of a to-do. Resolves `true` once it is stored durably, so no
     * to-do is filed; `false` when this port is not on (basic mode files the to-do). Never calls
     * the help desk inside the request: it stores and returns.
     *
     * @param message - the screened message; a honeypot catch never reaches the port
     */
    accept: (message: ContactMessage) => Promise<boolean>;

    /**
     * Whether the support mailbox is a help desk right now. When it is, the mail to it carries a
     * link only, with no customer data and no `Reply-To`, and the erasure notice is not sent.
     */
    mailboxIsHelpdesk: () => boolean;
}

/** The installed port, if any. Module state, set once at boot by the module that answers. */
let installed: ContactDelivery | undefined;

/**
 * Install (or, with no argument, remove) the contact-delivery port.
 *
 * @param port - the module's implementation
 */
export const registerContactDelivery = (port?: ContactDelivery): void => {
    installed = port;
};

/**
 * The port, for this module's own services only: the barrel publishes
 * {@link registerContactDelivery}, not this read.
 *
 * @internal a sibling asks `tasks` to file a contact, never the port behind it
 */
export const contactDelivery = (): ContactDelivery | undefined => installed;

/** Whether mails to the support mailbox are link-only and the erasure notice is withheld. */
export const supportMailboxIsHelpdesk = (): boolean => installed?.mailboxIsHelpdesk() ?? false;
