/**
 * `tests/support/expect-warning.ts`: the watcher that fails a case on an undeclared warning.
 *
 * Each case drives a watcher against a fake console and a private emitter, never the real ones the
 * setup file already watches, so a failure here is the watcher's and not a leak from the harness.
 */
import { createWarningWatcher, expectWarning } from '@tests/expect-warning';

/** A console of spies, a private emitter, and the watcher around them, already started. */
const watched = () => {
    const original = { warn: jest.fn(), error: jest.fn() };
    const target = { ...original };
    const listeners = new Set<(warning: Error) => void>();
    const emitter = {
        on: (_event: 'warning', listener: (warning: Error) => void) => listeners.add(listener),
        off: (_event: 'warning', listener: (warning: Error) => void) => listeners.delete(listener),
        /** Delivers a process warning to whoever is listening. */
        emit: (_event: 'warning', warning: Error) => {
            for (const listener of listeners) listener(warning);
        }
    };
    const watcher = createWarningWatcher(target, emitter);
    watcher.start();
    return { target, original, emitter, listeners, watcher };
};

describe('createWarningWatcher', () => {
    it('fails on a console.warn nobody declared, and names it', () => {
        const { target, watcher } = watched();

        target.warn('pool is draining');

        expect(() => watcher.finish()).toThrow(
            'Unexpected warning: console.warn: pool is draining'
        );
    });

    it('fails on a console.error, reading an Error argument by its message', () => {
        const { target, watcher } = watched();

        target.error('driver', new Error('socket closed'));

        expect(() => watcher.finish()).toThrow('console.error: driver socket closed');
    });

    it('fails on a process warning, such as a deprecation', () => {
        const { emitter, watcher } = watched();
        const warning = new Error('Buffer() is deprecated');
        warning.name = 'DeprecationWarning';

        emitter.emit('warning', warning);

        expect(() => watcher.finish()).toThrow(
            'Unexpected warning: DeprecationWarning: Buffer() is deprecated'
        );
    });

    it('accepts a declared warning, by substring or by pattern', () => {
        const { target, watcher } = watched();
        watcher.expect('draining');
        watcher.expect(/socket/);

        target.warn('pool is draining');
        target.error('socket closed');

        expect(() => watcher.finish()).not.toThrow();
    });

    it('fails a declaration that never fired, so a stale one cannot linger', () => {
        const { watcher } = watched();
        watcher.expect('draining');

        expect(() => watcher.finish()).toThrow('Declared warning never fired: draining');
    });

    it('still prints: the call reaches the console it wrapped', () => {
        const { target, original, watcher } = watched();

        target.warn('visible');
        watcher.expect('visible');
        watcher.finish();

        expect(original.warn).toHaveBeenCalledWith('visible');
    });

    it('puts the console back and stops listening at the end', () => {
        const { target, original, listeners, watcher } = watched();

        watcher.finish();

        expect(target.warn).toBe(original.warn);
        expect(target.error).toBe(original.error);
        expect(listeners.size).toBe(0);
    });

    it('starts each case empty: a warning from the last one is not carried over', () => {
        const { target, watcher } = watched();
        target.warn('old');
        expect(() => watcher.finish()).toThrow();

        watcher.start();

        expect(() => watcher.finish()).not.toThrow();
    });
});

describe('expectWarning', () => {
    it('declares a warning on the watcher the setup file runs, so the case that provokes one passes', () => {
        expectWarning('made on purpose');

        // eslint-disable-next-line no-console -- the case provokes a real console warning on purpose
        console.warn('made on purpose');
    });
});
