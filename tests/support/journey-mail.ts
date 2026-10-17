/**
 * @module
 * Reading the mail a journey caused. The `outbox` transport keeps every send in memory; this is
 * the lookup by recipient and template that a journey asserts through.
 *
 * Never clears the outbox between steps: a journey asks "was it sent exactly once", and a clear
 * would hide a second send. Addresses are unique per journey, so mail from another case in the
 * process never matches.
 */
import { readDemoOutbox, type DemoOutboxEmail } from '@scenarios/support/doubles/mail-outbox';
import { setEnvironment } from './environment';
import { eventually } from './eventually';

/**
 * Sends this case's mail to the in-memory outbox, with no broker to queue it on.
 *
 * Call it in `beforeEach`: overrides reset per case, and a reachable local broker would take the
 * mail off the inline path.
 */
export const useOutboxMail = (): void => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox', NODE_RABBITMQ_ENABLED: '0' });
};

/**
 * Every mail of one template sent to one address, oldest first.
 *
 * @param to - the recipient
 * @param template - the outbox name, such as `orders.order-confirm`
 */
export const mailsTo = (to: string, template: string): DemoOutboxEmail[] =>
    readDemoOutbox()
        .filter((mail) => mail.to === to && mail.template === template)
        .toReversed();

/**
 * Waits for a mail to arrive and returns the newest one. Signup and reset mail are sent after the
 * response, so a journey polls instead of reading once.
 *
 * Do not call it while the clock is frozen: `eventually` reads the clock for its deadline.
 *
 * @param to - the recipient
 * @param template - the outbox name
 * @throws {Error} when none arrives
 */
export const waitForMail = async (to: string, template: string): Promise<DemoOutboxEmail> => {
    await eventually(() => mailsTo(to, template).length > 0);
    const mail = mailsTo(to, template).at(-1);
    if (!mail) throw new Error(`no ${template} mail reached ${to}`);

    return mail;
};
