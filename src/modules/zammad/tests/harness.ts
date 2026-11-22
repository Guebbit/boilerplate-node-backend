/**
 * @module
 * The setup every Zammad integration case shares: a running stub, the environment that points the
 * module at it, the modules registered (the port is installed by `onRegistered`), and the teardown
 * that lets a nudged hand-over finish before the database is wiped.
 */

import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { setEnvironment } from '@tests/environment';
import { startZammadStub, type ZammadStub } from '@tests/zammad-stub';
import { enabledModules } from '../../../modules';
import { zammadService } from '../services';
import { zammadContactModel } from '../model';

/**
 * Hook a describe-less suite up to a fresh stub per case. Call once at the top level of the file,
 * after `setupTestDb()`.
 *
 * @param options - `fieldsExist: false` for a Zammad `zammad:setup` never ran against
 * @returns a reader for the current case's stub
 */
export const useZammad = (options: { fieldsExist?: boolean } = {}): (() => ZammadStub) => {
    let current: ZammadStub | undefined;

    beforeEach(async () => {
        current = await startZammadStub(options);
        setEnvironment({
            NODE_ZAMMAD_URL: current.url,
            NODE_ZAMMAD_API_TOKEN: current.token,
            NODE_ZAMMAD_GROUP: 'Support',
            NODE_SUPPORT_EMAIL: 'desk@example.com'
        });
        resetDomainEvents();
        registerModules(enabledModules);
    });

    afterEach(async () => {
        await zammadService.settleHandovers();
        resetDomainEvents();
        await current?.stop();
    });

    // `!`: `current` is set by the `beforeEach` above, which runs before any case reads it.
    return () => current!;
};

/** Make every waiting message due now, as if its backoff had passed. */
export const makeDue = (): Promise<unknown> =>
    zammadContactModel.updateMany({}, { $set: { nextAttemptAt: new Date(0) } }).exec();
