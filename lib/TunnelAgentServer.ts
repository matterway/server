import {createServer} from 'http';
import type {ClientManager} from './ClientManager';

export function createTunnelAgentServer(
  {clientManager}: {clientManager: ClientManager}
) {
  const server = createServer(({headers, url, method}, response) => {
    const respond = (statusCode: number, message: string) => {
      response.statusCode = statusCode;
      response.end(message);
    };
    if (method !== 'GET') {
      return respond(405, 'Only GET methods are supported.');
    }
    if (url === '/') {
      return respond(200, 'All systems are operational.');
    }
    if (url !== '/connect') {
      return respond(404, 'Not found.');
    }
    const clientSecret = headers['x-client-secret'];
    if (!clientSecret) {
      return respond(400, 'Client secret is missing.');
    }
    if (typeof clientSecret !== 'string') {
      return respond(400, 'Client secret is invalid.');
    }
    if (!clientManager.hasSecret(clientSecret)) {
      return respond(404, 'Client not found.');
    }
    const {socket} = response;
    if (socket === null) {
      return respond(500, 'Socket was not created.');
    }
    try {
      const client = clientManager.getClientBySecret(clientSecret);
      if (!client.agent.canConnect()) {
        return respond(403, 'Too many connections.');
      }
      response.shouldKeepAlive = true;
      respond(200, 'Connection created.');
      socket.removeAllListeners('data');
      client.agent.onConnection(socket);
    } catch (error) {
      respond(500, String(error));
    }
  });
  server.keepAliveTimeout = Math.pow(2, 31) - 1;
  return server;
}
