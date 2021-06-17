import {describe, it, expect, jest} from '@jest/globals';
import * as request from 'supertest';
import * as WebSocket from 'ws';
import * as net from 'net';
import {createAppServer} from './AppServer';
import {connectToAgent} from './__assets__/test-helpers';

let bypassAuth = true;
function getActualExpressJWT() {
    return jest.requireActual('express-jwt') as typeof import('express-jwt');
}
const {UnauthorizedError} = getActualExpressJWT();
jest.mock('express-jwt', () => Object.assign(
    () => ({}, {}, next: (error: Error | null) => void) => {
        next(bypassAuth ? null : new UnauthorizedError('credentials_required', {
            message: 'Credentials required.'
        }));
    },
    {UnauthorizedError: getActualExpressJWT().UnauthorizedError}
));
const defaultOptions = {domain: undefined, maxSockets: 1};

describe('Server', () => {
    it('server starts and stops', async () => {
        const server = createAppServer(defaultOptions);
        await new Promise((resolve) => server.listen(resolve));
        await new Promise((resolve) => server.close(resolve));
    });
    it('should redirect root requests to landing page', async () => {
        const server = createAppServer(defaultOptions);
        const {statusCode, text} = await request(server).get('/');
        expect([statusCode, text]).toEqual([200, 'All systems are operational.']);
    });
    it('should support custom base domains', async () => {
        const server = createAppServer({
            ...defaultOptions,
            domain: 'domain.example.com'
        });
        const {statusCode, text} = await request(server).get('/');
        expect([statusCode, text]).toEqual([200, 'All systems are operational.']);
    });
    it('reject long domain name requests', async () => {
        const server = createAppServer(defaultOptions);
        const {statusCode, text} = await request(server)
            .post('/api/tunnels')
            .send({clientId: 'thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters'});
        expect([statusCode, text]).toEqual([
            400,
            'Invalid subdomain. ' +
            'Subdomains must be lowercase and between 4 and 63 alphanumeric characters.'
        ]);
    });
    it('fails to create a tunnel if not authenticated', async () => {
        try {
            bypassAuth = false;
            const server = createAppServer(defaultOptions);
            const {statusCode, text} = await request(server)
                .post('/api/tunnels')
                .send({clientId: 'somedomain'});
            expect([statusCode, text]).toEqual(
                [401, 'UnauthorizedError: Credentials required.']
            );
        } finally {
            bypassAuth = true;
        }
    });
    it('should upgrade websocket requests', async () => {
        const hostname = 'websocket-test';
        const server = createAppServer({
            ...defaultOptions,
            domain: 'example.com'
        });
        await new Promise((resolve) => server.listen(resolve));
        const {statusCode, text, body: {secret}} = await request(server)
            .post('/api/tunnels')
            .send({clientId: hostname});
        expect([statusCode, text]).toEqual([200, text]);
        expect(typeof secret === 'string' && secret.length).toBe(64);
        const wss = await new Promise<WebSocket.Server>((resolve) => {
            const wsServer = new WebSocket.Server({ port: 0 }, () => {
                resolve(wsServer);
            });
        });
        const ltSocket = await connectToAgent({
            port: (server.address() as net.AddressInfo).port,
            secret
        });
        const wsSocket = net.createConnection({
            port: (wss.address() as net.AddressInfo).port
        });
        ltSocket.pipe(wsSocket).pipe(ltSocket);

        wss.once('connection', (ws) => {
            ws.once('message', (message) => {
                ws.send(message);
            });
        });
        const ws = new WebSocket(
            'http://localhost:' + (server.address() as net.AddressInfo).port,
            {
                headers: {
                    host: hostname + '.example.com',
                }
            }
        );
        ws.on('open', () => {
            ws.send('something');
        });

        await expect(new Promise<String>((resolve) => {
            ws.once('message', resolve);
        })).resolves.toBe('something');

        wss.close();
        await new Promise((resolve) => server.close(resolve));
    });
    it('should support the /api/tunnels/:id/status endpoint', async () => {
        const server = createAppServer(defaultOptions);
        await new Promise((resolve) => server.listen(resolve));

        const response = await request(server).get('/api/tunnels/foobar-test/status');
        expect(response.statusCode).toBe(404);

        await request(server)
            .post('/api/tunnels')
            .send({clientId: 'foobar-test'});
        const {statusCode, text, body} = await request(server)
            .get('/api/tunnels/foobar-test/status');
        expect([statusCode, text]).toEqual([200, text]);
        expect(body).toEqual({connectedSockets: 0});
        await new Promise((resolve) => server.close(resolve));
    });
});