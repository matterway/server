import {describe, it, expect} from '@jest/globals';
import type {Socket} from 'net';
import {ClientManager} from './ClientManager';
import {connectToAgent, setupTunnelAgentTestServer, wait} from '../__assets__/test-helpers';

async function createAgent({
    maxSockets = 10,
    clientId = 'any'
} = {}) {
    const clientManager = new ClientManager({maxSockets});
    const secret = Math.random().toString(16).slice(2);
    clientManager.newClient({
        id: clientId,
        secret,
        graceTimeout: null
    });
    const client = clientManager.getClientById(clientId)!;
    const {port, teardown} = await setupTunnelAgentTestServer({
        tunnelMiddlewareOptions: {clientManager}
    });
    return {
        port,
        secret,
        agent: client.agent,
        teardown: () => {
            client.close();
            return teardown();
        }
    };
}
function isSocketConnected(socket: Socket) {
    return !socket.connecting && !socket.destroyed;
}

describe('TunnelAgent', () => {
    let agentTeardown: (() => Promise<void>) | null = null;
    afterEach(async () => {
        await agentTeardown?.();
        agentTeardown = null;
    });
    it('should create an empty agent', async () => {
        const {agent, teardown} = await createAgent();
        expect(agent.isClosed()).toBe(false);
        await teardown();
        expect(agent.isClosed()).toBe(true);
    });
    it('should create a new server and accept connections', async () => {
        const {agent, teardown, port, secret} = await createAgent();
        agentTeardown = teardown;
        const socket = await connectToAgent({port, secret});
        expect(isSocketConnected(socket)).toBe(true);
        const agentSocket = await new Promise<Socket>((resolve, reject) => {
            agent.createConnection({}, (error, connection) => {
                if (error || connection === undefined) {
                    reject(error);
                } else {
                    resolve(connection);
                }
            });
        });
        agentSocket.write('foo');
        await new Promise((resolve) => socket.once('readable', resolve));
        expect(socket.read().toString()).toBe('foo');
        socket.destroy();
        await teardown();
        expect(socket.destroyed).toBe(true);
    });
    it('should reject connections over the max', async () => {
        const {teardown, port, secret} = await createAgent({maxSockets: 2});
        agentTeardown = teardown;
        const sock1 = await connectToAgent({port, secret});
        const sock2 = await connectToAgent({port, secret});
        expect(isSocketConnected(sock1)).toBe(true);
        expect(isSocketConnected(sock2)).toBe(true);
        await expect(connectToAgent({port, secret})).rejects.toEqual(
            new Error('403: "Too many connections.".')
        );
        sock1.destroy();
        sock2.destroy();
    });
    it('should queue createConnection requests', async () => {
        const {agent, teardown, port, secret} = await createAgent();
        agentTeardown = teardown;
        let connected = false;
        const connectionPromise = new Promise<Socket>((resolve, reject) => {
            agent.createConnection({}, (error, connection) => {
                if (error || !connection) {
                    reject(error);
                } else {
                    resolve(connection);
                }
            });
        }).then(() => {
            connected = true;
        });
        await wait();
        expect(connected).toBe(false);

        const socket = await connectToAgent({port, secret});
        expect(isSocketConnected(socket)).toBe(true);
        await connectionPromise;
        expect(connected).toBe(true);
        socket.destroy();
    });
    it('should should emit online event when a socket connects', async () => {
        const {agent, port, secret, teardown} = await createAgent();
        agentTeardown = teardown;
        let onlineEmitted = false;
        const onlinePromise = new Promise((resolve) => {
            agent.events.once('online', resolve);
        }).then(() => {
            onlineEmitted = true;
        });
        await wait();
        expect(onlineEmitted).toBe(false);
        const socket = await connectToAgent({port, secret});
        await onlinePromise;
        expect(onlineEmitted).toBe(true);
        socket.destroy();
    });
    it('should emit offline event when socket disconnects', async () => {
        const {agent, port, secret, teardown} = await createAgent();
        agentTeardown = teardown;
        let offlineEmitted = false;
        const offlinePromise = new Promise((resolve) => {
            agent.events.once('offline', resolve);
        }).then(() => {
            offlineEmitted = true;
        });
        await wait();
        const socket = await connectToAgent({port, secret});
        expect(offlineEmitted).toBe(false);
        socket.end();
        await offlinePromise;
        expect(offlineEmitted).toBe(true);
        socket.destroy();
    });
    it('should emit offline event only when last socket disconnects', async () => {
        const {agent, port, secret, teardown} = await createAgent();
        agentTeardown = teardown;
        let offlineEmitted = false;
        const offlinePromise = new Promise<void>((resolve) => {
            agent.events.once('offline', resolve);
        }).then(() => {
            offlineEmitted = true;
        });
        const sockA = await connectToAgent({port, secret});
        const sockB = await connectToAgent({port, secret});
        expect(isSocketConnected(sockA)).toBe(true);
        expect(isSocketConnected(sockB)).toBe(true);
        sockA.end();

        await wait();
        expect(offlineEmitted).toBe(false);
        sockB.end();
        await offlinePromise;
        expect(offlineEmitted).toBe(true);
    });
    it('should return stats', async () => {
        const {agent, teardown} = await createAgent();
        agentTeardown = teardown;
        expect(agent.stats()).toEqual({
            connectedSockets: 0
        });
    });
});
