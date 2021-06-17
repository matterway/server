import {describe, it, expect} from '@jest/globals';
import * as request from 'supertest';
import type {AddressInfo} from 'net';
import {ClientManager} from './ClientManager';
import {createTunnelAgentTestServer, connectToAgent, wait} from '../__assets__/test-helpers';
import {createTunnelAgentMiddleware} from './TunnelAgentMiddleware';

describe('Server', () => {
    it('fails if secret is missing in request', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        const server = createTunnelAgentTestServer({
            tunnelMiddleware: createTunnelAgentMiddleware({clientManager})
        });
        const {statusCode, text} = await request(server).post('/connect');
        expect([statusCode, text]).toEqual([400, 'Client secret is missing.']);
    });
    it('fails if client with this secret not found', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        clientManager.newClient({id: 'some', secret: 'foo'});
        const server = createTunnelAgentTestServer({
            tunnelMiddleware: createTunnelAgentMiddleware({clientManager})
        });
        const {statusCode, text} = await request(server)
            .post('/connect')
            .set('x-client-secret', 'bar');
        expect([statusCode, text]).toEqual([404, 'Client not found.']);
    });
    it('establishes only 1 connection per client', async () => {
        const clientManager = new ClientManager({maxSockets: 1});
        clientManager.newClient({id: 'some', secret: 'foo'});
        const client = clientManager.getClientById('some');
        const server = createTunnelAgentTestServer({
            tunnelMiddleware: createTunnelAgentMiddleware({clientManager})
        });
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
