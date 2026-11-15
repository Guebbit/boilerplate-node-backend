/**
 * `src/main.ts`, the default process entry: environment first, tracing next, `serve` last.
 *
 * `serve` pulls in express and mongoose, which OTel must patch, so it has to load after
 * `startTracing()` runs. The development doubles load between the two: after tracing, before
 * `serve` builds anything. The test records the order the entry's collaborators are touched in.
 */
const order: string[] = [];

jest.mock('@infrastructure/runtime/otel-sdk', () => ({
    startTracing: () => order.push('tracing')
}));
jest.mock('@infrastructure/runtime/mongoose-boot', () => {
    order.push('mongoose-boot');
    return {};
});
jest.mock('../../../src/infrastructure/config/dotenv', () => {
    order.push('dotenv');
    return {};
});
jest.mock('../../../src/app/development-doubles', () => ({
    loadDevelopmentDoubles: () => {
        order.push('development-doubles');
        return Promise.resolve();
    }
}));
jest.mock('../../../src/serve', () => {
    order.push('serve');
    return {};
});

describe('src/main.ts', () => {
    it('loads the environment, starts tracing, loads the development doubles, then serves', async () => {
        await import('../../../src/main');
        // `serve` is a dynamic import: let its promise settle.
        await new Promise((resolve) => setImmediate(resolve));
        expect(order).toEqual([
            'dotenv',
            'mongoose-boot',
            'tracing',
            'development-doubles',
            'serve'
        ]);
    });
});
