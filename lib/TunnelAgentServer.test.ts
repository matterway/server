import {describe, it, expect} from '@jest/globals';
import * as request from 'supertest';
import type {AddressInfo} from 'net';
import {ClientManager} from './ClientManager';
import {createTunnelAgentServer} from './TunnelAgentServer';
import {connectToAgent, wait} from '../__assets__/test-helpers';

describe('Server', () => {
    it('creates tunnel agent server', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        const server = createTunnelAgentServer({clientManager});
        const {statusCode, text} = await request(server).get('/');
        expect([statusCode, text]).toEqual(
            [200, 'All systems are operational.']
        );
    });
    it('supports only "/" and "/connect" endpoints', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        const server = createTunnelAgentServer({clientManager});
        for (const [method, path] of (
            [['get', '/some/random'], ['post', '/'], ['get', '/connect']] as const
        )) {
            const {statusCode, text} = await request(server)[method](path);
            expect([statusCode, text, {method, path}]).toEqual(
                [404, 'Not found.', {method, path}]
            );
        }
    });
    it('fails if secret is missing in request', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        const server = createTunnelAgentServer({clientManager});
        const {statusCode, text} = await request(server).post('/connect');
        expect([statusCode, text]).toEqual([400, 'Client secret is missing.']);
    });
    it('fails if client with this secret not found', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        clientManager.newClient({id: 'some', secret: 'foo'});
        const server = createTunnelAgentServer({clientManager});
        const {statusCode, text} = await request(server)
            .post('/connect')
            .set('x-client-secret', 'bar');
        expect([statusCode, text]).toEqual([404, 'Client not found.']);
    });
    it('establishes only 1 connection per client', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        clientManager.newClient({id: 'some', secret: 'foo'});
        const client = clientManager.getClientById('some');
        const server = createTunnelAgentServer({clientManager});
        await new Promise((resolve) => server.listen(resolve));
        const onlinePromise = new Promise((resolve) => {
            client.agent.events.on('online', resolve);
        });
        const socket = await connectToAgent({
            port: (server.address() as AddressInfo).port,
            secret: 'foo'
        });
        await onlinePromise;
        expect(client.agent.stats().connectedSockets).toBe(1);
        expect(client.agent.canConnect()).toBe(false);
        await expect(
            connectToAgent({
                port: (server.address() as AddressInfo).port,
                secret: 'foo'
            })
        ).rejects.toEqual(new Error('403: "Too many connections.".'));
        socket.end();
        await wait();
        expect(client.agent.stats().connectedSockets).toBe(0);
        await new Promise<unknown>((resolve) => server.close(resolve));
    });
});
