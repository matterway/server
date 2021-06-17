import {ClientManager} from './ClientManager';
import {connectToAgent, setupTunnelAgentTestServer, wait} from '../__assets__/test-helpers';

const defaultOptions = {maxSockets: 1};
const defaultClientOptions = {
    id: 'any',
    secret: 'some',
    graceTimeout: 500
};

describe('ClientManager', () => {
    let agentTeardown: (() => Promise<void>) | null = null;
    afterEach(async () => {
        await agentTeardown?.();
        agentTeardown = null;
    });
    it('should construct with no tunnels', () => {
        const manager = new ClientManager(defaultOptions);
        expect(manager.stats.tunnels).toBe(0);
    });
    it('should create a new client with id', async () => {
        const manager = new ClientManager(defaultOptions);
        manager.newClient(defaultClientOptions);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(true);
        manager.removeClient(defaultClientOptions.id);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(false);
    });
    it('should fail to create a new client if already exists', async () => {
        const manager = new ClientManager(defaultOptions);
        const client = manager.newClient(defaultClientOptions);
        expect(client.id).toBe(defaultClientOptions.id);
        expect(() => {
            manager.newClient(defaultClientOptions);
        }).toThrowError(
            new Error(`Client with id "${client.id}" already exists.`)
        );
        manager.removeClient(client.id);
    });
    it('should remove client once it goes offline', async () => {
        const manager = new ClientManager(defaultOptions);
        manager.newClient(defaultClientOptions);
        const {port, teardown} = await setupTunnelAgentTestServer({
            tunnelMiddlewareOptions: {clientManager: manager}
        });
        agentTeardown = teardown;
        const socket = await connectToAgent({
            port,
            secret: defaultClientOptions.secret
        });
        await new Promise((resolve) => {
            socket.once('close', resolve);
            socket.end();
        });
        expect(manager.hasClient(defaultClientOptions.id)).toBe(true);
        await wait(defaultClientOptions.graceTimeout);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(false);
    });
    it('should remove correct client once it goes offline', async () => {
        const otherClientOptions = {secret: 'other-secret', id: 'other'};
        const manager = new ClientManager(defaultOptions);
        manager.newClient(defaultClientOptions);
        manager.newClient({...defaultClientOptions, ...otherClientOptions});
        const {port, teardown} = await setupTunnelAgentTestServer({
            tunnelMiddlewareOptions: {clientManager: manager}
        });
        agentTeardown = teardown;
        const socket = await connectToAgent({
            port,
            secret: defaultClientOptions.secret
        });
        expect(manager.hasClient(defaultClientOptions.id)).toBe(true);
        expect(manager.hasClient(otherClientOptions.id)).toBe(true);
        await wait(defaultClientOptions.graceTimeout);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(true);
        expect(manager.hasClient(otherClientOptions.id)).toBe(false);
        await new Promise((resolve) => {
            socket.once('close', resolve);
            socket.end();
        });
        await wait(defaultClientOptions.graceTimeout);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(false);
        expect(manager.hasClient(otherClientOptions.id)).toBe(false);
    });
    it('should remove clients if they do not connect within the given timeout', async () => {
        const manager = new ClientManager(defaultOptions);
        manager.newClient(defaultClientOptions);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(true);
        await wait(defaultClientOptions.graceTimeout);
        expect(manager.hasClient(defaultClientOptions.id)).toBe(false);
    });
});
