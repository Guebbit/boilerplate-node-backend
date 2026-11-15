/**
 * `requireProvider` — what an unknown selector value says. Built over a fresh registry on purpose:
 * jest registers `log` and `outbox` in the process-wide mail registry, so the "development name
 * that is not registered" branch can only be reached through one of our own.
 */
import { createProviderRegistry, requireProvider } from '@infrastructure/runtime/provider-registry';

const DEVELOPMENT = { noun: 'transport', names: ['log', 'outbox'] } as const;

describe('requireProvider', () => {
    it('names a development transport as one when this registry lacks it', () => {
        const registry = createProviderRegistry({ smtp: 'real' });

        expect(() => requireProvider(registry, 'NODE_MAIL_TRANSPORT', 'log', DEVELOPMENT)).toThrow(
            'Unknown NODE_MAIL_TRANSPORT: "log" — `log` is a development transport; it is loaded only when NODE_ENV=development.'
        );
    });

    it('still lists what is allowed for any other unknown name', () => {
        const registry = createProviderRegistry({ smtp: 'real' });

        expect(() =>
            requireProvider(registry, 'NODE_MAIL_TRANSPORT', 'bogus', DEVELOPMENT)
        ).toThrow('Unknown NODE_MAIL_TRANSPORT: "bogus". Allowed: smtp.');
    });

    it('lists what is allowed when the caller names no development names', () => {
        const registry = createProviderRegistry({ smtp: 'real' });

        expect(() => requireProvider(registry, 'NODE_MAIL_TRANSPORT', 'log')).toThrow(
            'Unknown NODE_MAIL_TRANSPORT: "log". Allowed: smtp.'
        );
    });

    it('resolves a development name that is registered', () => {
        const registry = createProviderRegistry({ smtp: 'real', log: 'double' });

        expect(requireProvider(registry, 'NODE_MAIL_TRANSPORT', 'log', DEVELOPMENT)).toBe('double');
    });
});
