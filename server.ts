import * as express from 'express';
import * as tldjs from 'tldjs';
import Debug from 'debug';
import * as http from 'http';
import {ClientManager} from './lib/ClientManager';
import {AgentConnectionManager} from './lib/AgentConnectionManager';
import * as jwt from 'express-jwt';
import {expressJwtSecret} from 'jwks-rsa';
import {AUTH_AUDIENCE, AUTH_JWKS_URI, AUTH_TOKEN_ISSUER} from './config';
import {randomBytes} from 'crypto';
import {promisify} from 'util';

const randomBytesAsync = promisify(randomBytes);
const debug = Debug('localtunnel:server');

export function createServers(
    {domain, maxSockets}: {domain?: string, maxSockets: number}
) {
    if (!Number.isInteger(maxSockets)) {
        throw new Error(`Invalid "maxSockets" option value: ${maxSockets}.`);
    }
    const myTldjs = tldjs.fromUserSettings({
        validHosts: domain ? [domain] : undefined
    });
    const getClientIdFromHostname = (hostname: string) => {
        if (hostname === 'localhost') {
            // Workaround for "tldjs" to support localhost.
            hostname += '.me';
        }
        return myTldjs.getSubdomain(hostname);
    };
    const clientManager = new ClientManager({maxSockets});
    const agentConnectionManager = new AgentConnectionManager({
        clientManager
    });
    const app = express();

    app.get('/', ({hostname}, response, next) => {
        if (hostname && getClientIdFromHostname(hostname)) {
            next();
            return;
        }
        response.status(200).send('All systems are operational.');
    });
    0 && app.use(jwt({
        secret: expressJwtSecret({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 5,
            jwksUri: AUTH_JWKS_URI
        }),
        credentialsRequired: true,
        audience: AUTH_AUDIENCE,
        issuer: AUTH_TOKEN_ISSUER,
        algorithms: ['RS256']
    }));
    app.use((request, response, next) => {
        const {hostname} = request;
        const clientId = hostname && getClientIdFromHostname(hostname);
        if (!clientId) {
            next();
            return;
        }
        if (!clientManager.hasClient(clientId)) {
            response.status(404).send(`Client "${clientId}" not found.`);
            return;
        }
        const client = clientManager.getClientById(clientId);
        client.handleRequest(request, response);
    });
    const onUpgrade = (request: http.IncomingMessage, socket: import('net').Socket) => {
        const hostname = request.headers.host;
        const clientId = hostname && getClientIdFromHostname(hostname);
        if (!clientId || !clientManager.hasClient(clientId)) {
            socket.destroy();
            return;
        }
        const client = clientManager.getClientById(clientId);
        client.handleUpgrade(request, socket);
    };
    const apiRouter = express.Router();

    apiRouter.get('/status', ({}, response) => {
        const {tunnels} = clientManager.stats;
        response.json({
            tunnels,
            memoryUsage: process.memoryUsage()
        });
    });
    apiRouter.get('/tunnels/:clientId/status', ({params}, response) => {
        const client = clientManager.getClientById(params.clientId);
        if (!client) {
            response.sendStatus(404);
            return;
        }
        const {connectedSockets} = client.stats();
        response.json({connectedSockets});
    });
    apiRouter.post('/tunnels', async (request, response) => {
        const {query: {clientId}, hostname} = request;
        if (
            typeof clientId !== 'string' ||
            !/^[a-z0-9_]{4,63}$/.test(clientId)
        ) {
            response.status(400).send(
                'Invalid subdomain. Subdomains must be lowercase and ' +
                'between 4 and 63 alphanumeric characters.'
            );
            return;
        }
        if (clientManager.hasClient(clientId)) {
            response.status(403).send(`Client "${clientId}" already exists.`);
            return;
        }
        try {
            const secret = (await randomBytesAsync(32)).toString('hex');
            debug('making new client with id %s', clientId);
            const info = clientManager.newClient({id: clientId, secret});
            const url = info.id + '.' + hostname;
            response.json({...info, url});
        } catch (error) {
            response.status(500).send(String(error));
        }
    });
    app.use('/api', apiRouter);
    app.use(({}, response) => {
        response.status(404).send('Not found.');
    });
    app.use((error: any, {}, response: express.Response, {}) => {
        response.status(500).send(String(error));
    });

    const appServer = http.createServer(app);
    appServer.on('upgrade', onUpgrade);

    return {appServer, agentServer: agentConnectionManager.server};
};