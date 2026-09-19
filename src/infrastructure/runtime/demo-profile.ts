/**
 * @module
 * Whether this process is running as the demo profile — read by the kernel's boot gate, the
 * mailer, `app.ts`, two of `account`'s own providers and `scenarios/run-server.ts`. One import
 * path only: `@infrastructure/runtime/demo-profile`, never re-exported from `app/demo.ts`.
 *
 * Gated on an in-process call, never on an env var: switching this on diverts mail, opens an
 * unauthenticated database wipe and skips the boot secrets gate, so no copied `.env` may be able
 * to do it. Nothing but `scenarios/run-server.ts` calls {@link enableDemoProfile}.
 */

import { logger } from '@infrastructure/adapters/logger';

/** Set only by {@link enableDemoProfile}. Module-level: a restart clears it. */
let demoProfileEnabled = false;

/**
 * Mark this process as the demo profile — the only way {@link isDemoMode} can return `true`.
 * Called once, in-process, by `scenarios/run-server.ts`, before `src/app.ts` (and
 * everything it wires) is even imported. A handful of tests call it directly to exercise the
 * demo surface without booting through that script; pass `false` to turn it back off, which
 * every such test must do in its own cleanup so the flag cannot leak into the next one.
 *
 * @param enabled - defaults to `true`; pass `false` to disable.
 */
export const enableDemoProfile = (enabled = true): void => {
    demoProfileEnabled = enabled;
};

/**
 * `NODE_ENV !== 'production'` stays a second gate even though nothing but
 * {@link enableDemoProfile} can request the demo profile now: `run-server.ts` only DEFAULTS
 * `NODE_ENV` to `development`, it does not override a shell's own `NODE_ENV=production`, so this
 * is what refuses that case rather than mounting anyway. Logs at `error` when it does — a fact
 * whoever owns that deployment needs to hear, not swallow.
 */
export const isDemoMode = (): boolean => {
    const isProduction = process.env.NODE_ENV === 'production';

    if (demoProfileEnabled && isProduction)
        logger.error({
            message:
                'enableDemoProfile() was called in a production environment. Refusing to mount the demo profile.'
        });

    return demoProfileEnabled && !isProduction;
};
