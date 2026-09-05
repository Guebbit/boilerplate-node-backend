/**
 * The process-level handlers installed by `src/app/error-handling.ts`.
 *
 * Registering an `uncaughtException` listener REPLACES Node's default behaviour — print the stack,
 * exit 1. So the listener is not an addition to what happens on a fatal throw; it is the whole of
 * what happens. A branch that returned before logging meant that in development and in CI the
 * process caught every uncaught exception, did nothing at all with it, and carried on in an
 * unknown state: no stack, no log line, no crash, no exit code. The symptom is "the server just
 * stops doing that thing", and a fatal defect passes a green suite.
 *
 * Two properties, and they pull in opposite directions:
 *   - outside a test runner, ALWAYS log and ALWAYS exit — the state after an uncaught exception is
 *     unknown, which is exactly as true in development as in production;
 *   - under a test runner, install nothing, because Jest's own handler is what reports the throw
 *     against the test that caused it.
 */

import { asStub } from '@tests/stub';
import { auditLogger } from '@infrastructure/adapters/logger';
import { installErrorHandling } from '@app/error-handling';

/** Enough of an Express app for `app.use(handler)`. */
const appStub = () => asStub<Parameters<typeof installErrorHandling>[0]>({ use: jest.fn() });

/**
 * Install the handlers under a given `NODE_ENV` and hand back the ones this call added.
 *
 * Listeners are process-global and this file installs real ones, so every case removes exactly
 * what it registered — a leaked handler would silence the runner for the rest of the suite.
 */
const installUnder = (nodeEnv: string) => {
    const before = process.listeners('uncaughtException');
    const originalEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = nodeEnv;
    installErrorHandling(appStub());
    process.env.NODE_ENV = originalEnv;

    const added = process
        .listeners('uncaughtException')
        .filter((listener) => !before.includes(listener));
    const rejectionsAdded = process.listeners('unhandledRejection').at(-1)!;

    return {
        added,
        rejectionsAdded,
        remove: () => {
            for (const listener of added) process.off('uncaughtException', listener);
            process.off('unhandledRejection', rejectionsAdded);
        }
    };
};

describe('installErrorHandling — uncaughtException', () => {
    it('installs no handler under a test runner, leaving the reporting to it', () => {
        const { added, remove } = installUnder('test');

        expect(added).toHaveLength(0);

        remove();
    });

    it.each(['development', 'production'])('logs and exits under %s', (nodeEnv) => {
        const errorSpy = jest.spyOn(auditLogger, 'error').mockImplementation(() => auditLogger);
        // `process.exit` really does end the worker, so the one call under test is stubbed out.
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const { added, remove } = installUnder(nodeEnv);

        expect(added).toHaveLength(1);
        added[0](new Error('boom'), 'uncaughtException');

        // The order is the finding: the audit write happens BEFORE the exit, not behind it.
        expect(errorSpy).toHaveBeenCalledWith(
            'process.uncaughtException',
            expect.objectContaining({ message: 'boom', origin: 'uncaughtException' })
        );
        expect(exitSpy).toHaveBeenCalledWith(1);

        remove();
        errorSpy.mockRestore();
        exitSpy.mockRestore();
    });
});

describe('installErrorHandling — unhandledRejection', () => {
    it('is installed in every environment, including under a test runner', () => {
        const errorSpy = jest.spyOn(auditLogger, 'error').mockImplementation(() => auditLogger);
        const { rejectionsAdded, remove } = installUnder('test');

        // A rejection leaves the process in a defined state, so this one audits and continues —
        // the opposite call from the exception handler above, for the opposite reason.
        (rejectionsAdded as (reason: unknown) => void)(new Error('nobody caught me'));

        expect(errorSpy).toHaveBeenCalledWith(
            'process.unhandledRejection',
            expect.objectContaining({ reason: { name: 'Error', message: 'nobody caught me' } })
        );

        remove();
        errorSpy.mockRestore();
    });
});
