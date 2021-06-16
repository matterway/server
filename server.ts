import * as express from 'express';
import * as tldjs from 'tldjs';
import Debug from 'debug';
import * as http from 'http';
import {ClientManager} from './lib/ClientManager';
import {createTunnelAgentServer} from './lib/TunnelAgentServer';
import * as jwt from 'express-jwt';
import {expressJwtSecret} from 'jwks-rsa';
import {TUNNEL_PORT, TUNNEL_DOMAIN, AUTH_AUDIENCE, AUTH_JWKS_URI, AUTH_TOKEN_ISSUER} from './config';
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
        if (/(^|\.)localhost$/.test(hostname)) {
            // Workaround for "tldjs" to support localhost.
            hostname += '.me';
        }
        return myTldjs.getSubdomain(hostname);
    };
    const clientManager = new ClientManager({maxSockets});
    const tunnelServer = createTunnelAgentServer({clientManager});
    const app = express();

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
    app.get('/', ({}, response, next) => {
        // Important for health checking.
        response.status(200).send('All systems are operational.');
    });
    const apiRouter = express.Router();

    apiRouter.get('/status', ({}, response) => {
        const {tunnels} = clientManager.stats;
        response.json({
            tunnels,
            memoryUsage: process.memoryUsage()
        });
    });
    apiRouter.get('/tunnels/:clientId/status', ({params}, response) => {
        if (!clientManager.hasClient(params.clientId)) {
            response.sendStatus(404);
            return;
        }
        const client = clientManager.getClientById(params.clientId);
        response.json(client.stats());
    });
    apiRouter.use(express.json());
    apiRouter.post('/tunnels', async (request, response) => {
        const {body: {clientId}, hostname} = request;
        if (
            typeof clientId !== 'string' ||
            !/^[a-z0-9_\-]{4,63}$/.test(clientId)
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
            response.json({
                ...info,
                url,
                tunnel: {
                    hostname: TUNNEL_DOMAIN ?? hostname,
                    port: TUNNEL_PORT
                }
            });
        } catch (error) {
            response.status(500).send(String(error));
        }
    });
    app.use(jwt({
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
    app.use('/api', apiRouter);
    app.use(({}, response) => {
        response.status(404).send('Not found.');
    });
    app.use((error: any, {}, response: express.Response, {}) => {
        const status = error instanceof jwt.UnauthorizedError ? 401 : 500;
        response.status(status).send(String(error));
    });

    const apiServer = http.createServer(app);
    apiServer.on('upgrade', onUpgrade);

    return {apiServer, tunnelServer};
};
