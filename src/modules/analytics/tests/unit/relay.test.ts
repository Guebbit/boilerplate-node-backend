/**
 * The relay knows no event by name: it looks the body's `event` up among what registered modules
 * declared, and hands the analytics port what that module's own `toReport` built.
 */
import type { AnalyticsEventRequest, CallerContext } from '@types';
import { asStub } from '@tests/stub';

const mockEmit = jest.fn();

jest.mock('@infrastructure/observability/analytics', () => ({
    buildAnalyticsBase: () => ({ distinctId: 'anonymous' }),
    emitAnalyticsEvent: (event: unknown) => mockEmit(event)
}));

import { registerBrowserEvents, relayEvent } from '../../services/relay';

/** A caller the stubbed base builder ignores. */
const CONTEXT = asStub<CallerContext>({});

/** A body of a shape only the test's own target reads. */
const body = (event: string) => asStub<AnalyticsEventRequest>({ event, extra: 1 });

afterEach(() => {
    registerBrowserEvents({});
    mockEmit.mockReset();
});

describe('relayEvent', () => {
    it('emits what the owning module built from the body', () => {
        const toReport = jest.fn().mockReturnValue({ event: 'page_opened', properties: { a: 1 } });
        registerBrowserEvents({ page_opened: { toReport } });

        relayEvent(body('page_opened'), CONTEXT);

        expect(toReport).toHaveBeenCalledWith({ event: 'page_opened', extra: 1 });
        expect(mockEmit).toHaveBeenCalledWith({
            distinctId: 'anonymous',
            event: 'page_opened',
            properties: { a: 1 }
        });
    });

    it('drops an event no registered module owns', () => {
        registerBrowserEvents({});

        relayEvent(body('page_opened'), CONTEXT);

        expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does not resolve an inherited property as an event', () => {
        registerBrowserEvents({});

        relayEvent(body('constructor'), CONTEXT);

        expect(mockEmit).not.toHaveBeenCalled();
    });
});
