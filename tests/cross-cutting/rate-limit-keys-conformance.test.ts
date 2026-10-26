/**
 * The cases the PHP twin's rate-limit keys must answer identically:
 * `shared/cases/rate-limit-keys.cases.yaml`, run against `addressBlockOf`, `identityOf` and the
 * library's default address key.
 */

import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { addressBlockOf, identityOf } from '@infrastructure/http/middlewares/rate-limit';
import { setEnvironment } from '@tests/environment';
import { asStub } from '@tests/stub';
import { caseBase, describeCases } from '@tests/cases';

/** One case; `kind` picks the key under test. */
const keyCase = z.discriminatedUnion('kind', [
    caseBase.extend({ kind: z.literal('address'), ip: z.string(), key: z.string() }),
    caseBase.extend({ kind: z.literal('block'), ip: z.string().optional(), key: z.string() }),
    caseBase.extend({
        kind: z.literal('identity'),
        root: z.string(),
        ip: z.string(),
        body: z.record(z.string(), z.unknown()).optional(),
        key: z.string()
    })
]);

describeCases('rate-limit-keys', keyCase, 20, (one) => {
    switch (one.kind) {
        case 'address': {
            // The default key of every "address" budget: express-rate-limit's own IPv6 /56 mask.
            expect(ipKeyGenerator(one.ip)).toBe(one.key);
            break;
        }
        case 'block': {
            expect(addressBlockOf(asStub<Request>({ ip: one.ip }))).toBe(one.key);
            break;
        }
        case 'identity': {
            setEnvironment({ NODE_PSEUDONYM_KEY: one.root });
            expect(identityOf(asStub<Request>({ ip: one.ip, body: one.body }))).toBe(one.key);
            break;
        }
    }
});
