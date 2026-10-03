/**
 * The trust-proxy warning in `installSecurity`: `NODE_TRUST_PROXY_HOPS=0` on anything that is not a
 * developer's machine or CI reads as "reached directly", which is only correct with no reverse
 * proxy in front. Keyed off `isRelaxedEnvironment`, so an unset `NODE_ENV` warns too.
 */
import express from 'express';
import { installSecurity } from '@app/security';
import { logger } from '@infrastructure/adapters/logger';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

withoutEnvironmentInThisFile(['NODE_ENV', 'NODE_TRUST_PROXY_HOPS']);

/** Whether `installSecurity` warned about the proxy hop count for the environment as it stands. */
const warnsAboutProxy = (): boolean => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    installSecurity(express());
    const warned = warn.mock.calls.some(([entry]) => JSON.stringify(entry).includes('TRUST_PROXY'));
    warn.mockRestore();
    return warned;
};

it.each(['production', 'staging', undefined])('warns when NODE_ENV is %p', (value) => {
    setEnvironment({ NODE_ENV: value });

    expect(warnsAboutProxy()).toBe(true);
});

it.each(['development', 'test'])('stays quiet when NODE_ENV is %s', (value) => {
    setEnvironment({ NODE_ENV: value });

    expect(warnsAboutProxy()).toBe(false);
});
