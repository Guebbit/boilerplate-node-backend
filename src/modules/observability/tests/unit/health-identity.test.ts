/**
 * The two fields `GET /observability/health` uses to say which process answered: `environment`
 * and `service`.
 *
 * `jobHealth` and `queueHealth` are mocked: what they read belongs to their own suites, and this
 * file is about how the payload names the process.
 */
jest.mock('../../services/job-health', () => ({ jobHealth: () => Promise.resolve([]) }));
jest.mock('../../services/parked-jobs', () => ({ queueHealth: () => Promise.resolve([]) }));

import { resetEnvironment, setEnvironment } from '@tests/environment';
import { buildObservabilityHealth } from '../../services/health';

afterEach(resetEnvironment);

describe('buildObservabilityHealth identity', () => {
    it('reports an unset NODE_ENV as unset, because an unset one is a deployment, not development', async () => {
        setEnvironment({ NODE_ENV: undefined });

        await expect(buildObservabilityHealth()).resolves.toMatchObject({ environment: 'unset' });
    });

    it('reports the configured NODE_ENV as written', async () => {
        setEnvironment({ NODE_ENV: 'staging' });

        await expect(buildObservabilityHealth()).resolves.toMatchObject({
            environment: 'staging'
        });
    });

    it('names the service the way logs and traces do, `api` when NODE_SERVICE_NAME is unset', async () => {
        setEnvironment({ NODE_SERVICE_NAME: undefined });

        await expect(buildObservabilityHealth()).resolves.toMatchObject({ service: 'api' });
    });

    it('names the service by NODE_SERVICE_NAME when it is set', async () => {
        setEnvironment({ NODE_SERVICE_NAME: 'shop-api' });

        await expect(buildObservabilityHealth()).resolves.toMatchObject({ service: 'shop-api' });
    });
});
