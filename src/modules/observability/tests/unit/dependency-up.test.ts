/**
 * `dependency_up`, with every dependency's state controlled: the mapping from the readiness
 * vocabulary to 1 / 0 / unset is what the `DependencyUnavailable` alert stands on.
 */

import { getPrometheusMetrics } from '@infrastructure/observability/metrics-registry';
import { dependencyHealth, type DependencyHealth } from '../../services/dependency-health';
import '../../metrics';

jest.mock('../../services/dependency-health', () => ({ dependencyHealth: jest.fn() }));

const mockedDependencyHealth = jest.mocked(dependencyHealth);

/** A reading with every dependency ready, overridden per case. */
const reading = (overrides: Partial<DependencyHealth>): DependencyHealth => ({
    database: 'ready',
    cache: 'ready',
    queue: 'ready',
    ...overrides
});

describe('dependency_up', () => {
    it('reports 1 for a serving dependency', async () => {
        mockedDependencyHealth.mockReturnValue(reading({}));

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('dependency_up{dependency="database"} 1');
        expect(metrics).toContain('dependency_up{dependency="cache"} 1');
        expect(metrics).toContain('dependency_up{dependency="queue"} 1');
    });

    it('reports 0 for an unavailable dependency, which is what the alert fires on', async () => {
        mockedDependencyHealth.mockReturnValue(reading({ database: 'unavailable' }));

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('dependency_up{dependency="database"} 0');
    });

    it('reports 0 for a dependency still connecting: not serving yet', async () => {
        mockedDependencyHealth.mockReturnValue(reading({ cache: 'connecting' }));

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('dependency_up{dependency="cache"} 0');
    });

    it('leaves a disabled dependency out: not configured is a supported deployment', async () => {
        mockedDependencyHealth.mockReturnValue(reading({ queue: 'disabled' }));

        const metrics = await getPrometheusMetrics();

        expect(metrics).not.toContain('dependency="queue"');
        expect(metrics).toContain('dependency_up{dependency="database"} 1');
    });
});
