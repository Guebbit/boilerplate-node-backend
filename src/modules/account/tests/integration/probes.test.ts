/**
 * `probes.ts` — the requests `client-collections-bundle.ts` ships in every generated API client
 * collection precisely because the contract cannot describe them. A probe's own `name` states the
 * status it exists to demonstrate (`'Probe: 409 on a signup that already exists'` → 409); this
 * proves each one actually answers what it claims, against the real app rather than a human
 * pasting it into Bruno and trusting the description.
 *
 * Only the requests this module's probes can be reproduced with local fixtures — `{{seedToken}}`
 * placeholders that resolve against the full demo dataset (`scenarios/subjects.ts`) are substituted
 * by hand here with an equivalent seeded row, since standing up the whole scenario apply for one
 * assertion is not what this test is for.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { probes } from '@modules/account/probes';

setupTestDb();

/** The status a probe's own name claims — `'Probe: 409 on a signup that already exists'` → 409. */
const claimedStatus = (name: string): number => {
    const match = /\b(\d{3})\b/.exec(name);
    if (!match) throw new Error(`probe name "${name}" states no status to check it against`);
    return Number(match[1]);
};

const probeByName = (name: string) => {
    const probe = probes.find((candidate) => candidate.name === name);
    if (!probe) throw new Error(`no probe named "${name}" — has account/probes.ts been renamed?`);
    return probe;
};

describe('account probes — each answers the status its own name claims', () => {
    it('401 with a bogus token', async () => {
        const probe = probeByName('Probe: 401 with a bogus token');

        const response = await api()
            .get(probe.path)
            .set('Authorization', 'Bearer not.a.real.token');

        expect(response.status).toBe(claimedStatus(probe.name));
    });

    it('409 on a signup that already exists', async () => {
        const probe = probeByName('Probe: 409 on a signup that already exists');
        const admin = await createUser({ email: 'admin@example.com' });

        const response = await api()
            .post(probe.path)
            .send({
                ...(probe.body as Record<string, unknown>),
                email: admin.email,
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD
            });

        expect(response.status).toBe(claimedStatus(probe.name));
    });
});
