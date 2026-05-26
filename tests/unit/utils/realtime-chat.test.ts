import { WebSocket, type RawData } from 'ws';
import {
    clearRealtimeChatState,
    getActiveWebSocketConnections,
    onChatConnected,
    onChatDisconnected,
    onChatMessage
} from '@utils/realtime-chat';

interface IMockSocket {
    readyState: number;
    send: jest.Mock<void, [string]>;
}

const asMessage = (value: unknown): RawData => Buffer.from(JSON.stringify(value), 'utf8');

const getSentEvents = (socket: IMockSocket) =>
    socket.send.mock.calls.map(([payload]) => JSON.parse(payload) as { type: string });

const createMockSocket = (): IMockSocket => ({
    readyState: WebSocket.OPEN,
    send: jest.fn()
});

describe('realtime chat', () => {
    beforeEach(() => {
        clearRealtimeChatState();
    });

    it('requires join before sending messages', () => {
        const socket = createMockSocket();
        onChatConnected(socket as unknown as WebSocket);

        onChatMessage(
            socket as unknown as WebSocket,
            asMessage({
                type: 'chat:message:send',
                payload: { message: 'hello' }
            })
        );

        const events = getSentEvents(socket);
        expect(events.at(-1)?.type).toBe('chat:error');
    });

    it('joins the default room and broadcasts messages', () => {
        const socket = createMockSocket();
        onChatConnected(socket as unknown as WebSocket);

        onChatMessage(
            socket as unknown as WebSocket,
            asMessage({
                type: 'chat:join',
                payload: { username: 'alice' }
            })
        );

        onChatMessage(
            socket as unknown as WebSocket,
            asMessage({
                type: 'chat:message:send',
                payload: { message: 'Hello room' }
            })
        );

        const events = getSentEvents(socket);
        expect(events.map((event) => event.type)).toEqual(
            expect.arrayContaining(['chat:joined', 'chat:system', 'chat:presence', 'chat:message'])
        );
    });

    it('tracks connection lifecycle and emits leave events', () => {
        const alice = createMockSocket();
        const bob = createMockSocket();
        onChatConnected(alice as unknown as WebSocket);
        onChatConnected(bob as unknown as WebSocket);

        onChatMessage(
            alice as unknown as WebSocket,
            asMessage({
                type: 'chat:join',
                payload: { username: 'alice' }
            })
        );
        onChatMessage(
            bob as unknown as WebSocket,
            asMessage({
                type: 'chat:join',
                payload: { username: 'bob' }
            })
        );

        expect(getActiveWebSocketConnections()).toBe(2);
        onChatDisconnected(alice as unknown as WebSocket);
        expect(getActiveWebSocketConnections()).toBe(1);

        const bobEvents = getSentEvents(bob);
        expect(bobEvents.map((event) => event.type)).toEqual(
            expect.arrayContaining(['chat:system', 'chat:presence'])
        );
    });
});
