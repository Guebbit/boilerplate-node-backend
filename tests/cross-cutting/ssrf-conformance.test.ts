/**
 * The cases the PHP twin's outbound guard must answer identically: `shared/cases/ssrf.cases.yaml`,
 * run against `resolveSafeOutboundTarget`. Every host is a literal IP, so no case touches DNS.
 */

import { isIPv6 } from 'node:net';
import { z } from 'zod';
import { SsrfRefusedError, resolveSafeOutboundTarget } from '@infrastructure/adapters/ssrf-guard';
import { clearSsrfExemptOrigins } from '@infrastructure/adapters/ssrf-exemptions';
import { caseBase, describeCases } from '@tests/cases';

/** One case; `kind` says whether it names an address or a whole URL. */
const ssrfCase = z.discriminatedUnion('kind', [
    caseBase.extend({
        kind: z.literal('address'),
        address: z.string(),
        expect: z.enum(['allowed', 'refused'])
    }),
    caseBase.extend({ kind: z.literal('url'), url: z.string(), expect: z.string() })
]);

/** The refusal reason a URL earns, or `allowed` when it resolves to a target. */
const outcomeOf = (url: string): Promise<string> =>
    resolveSafeOutboundTarget(url).then(
        () => 'allowed',
        (error: unknown) => {
            if (error instanceof SsrfRefusedError) return error.reason;
            throw error;
        }
    );

describeCases('ssrf', ssrfCase, async (one) => {
    clearSsrfExemptOrigins();
    if (one.kind === 'url') {
        expect(await outcomeOf(one.url)).toBe(one.expect);
        return;
    }
    const host = isIPv6(one.address) ? `[${one.address}]` : one.address;
    const outcome = await outcomeOf(`https://${host}/`);
    expect(outcome === 'allowed' ? 'allowed' : 'refused').toBe(one.expect);
    // An address is refused for its range and nothing else: the URL itself is well formed.
    if (one.expect === 'refused') expect(outcome).toBe('unsafe-address');
});
