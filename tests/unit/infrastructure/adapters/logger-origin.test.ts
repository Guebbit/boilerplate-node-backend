/**
 * Which copy wrote a log line: both loggers carry the host name next to the pid, under the
 * OpenTelemetry names, so one of N copies behind a load balancer is identifiable.
 *
 * @see docs/operate/winston.md#field-names-in-the-log-line
 */
import winston from 'winston';
import { hostname } from 'node:os';
import { logger, auditLogger } from '@infrastructure/adapters/logger';

describe('origin fields on the real loggers', () => {
    it.each([
        ['logger', logger],
        ['auditLogger', auditLogger]
    ])('%s writes host.name next to process.pid', async (_name, target) => {
        // The Console transport receives the finished line under winston's message symbol: what a collector reads.
        const consoleLog = jest
            .spyOn(winston.transports.Console.prototype, 'log')
            .mockImplementation(() => void 0);
        target.info('origin check');
        // winston hands the record to its transports on a later tick.
        await new Promise((resolve) => setImmediate(resolve));
        const info = consoleLog.mock.calls[0]?.[0] as Record<symbol, string>;
        consoleLog.mockRestore();
        const line = JSON.parse(info[Symbol.for('message')]) as Record<string, unknown>;
        expect(line).toMatchObject({ 'host.name': hostname(), 'process.pid': process.pid });
    });
});
