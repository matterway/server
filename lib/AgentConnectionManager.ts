import {createServer} from 'http';
import type {ClientManager} from './ClientManager';

export class AgentConnectionManager {
  readonly server;
  constructor({clientManager}: {clientManager: ClientManager}) {
    this.server = createServer(({headers, url, method}, response) => {
      const respond = (statusCode: number, message: string) => {
        response.statusCode = statusCode;
        response.end(message);
      };
      if (method !== 'GET') {
        respond(405, 'Only GET methods are supported.');
        return;
      }
      if (url === '/') {
        respond(200, 'All systems are operational.');
        return;
      }
      if (url !== '/connect') {
        respond(404, 'Not found.');
        return;
      }
      const clientSecret = headers['x-client-secret'];
      if (!clientSecret) {
        respond(400, 'Client secret is missing.');
        return;
      }
      if (typeof clientSecret !== 'string') {
        respond(400, 'Client secret is invalid.');
        return;
      }
      if (!clientManager.hasSecret(clientSecret)) {
        respond(404, 'Client not found.');
        return;
      }
      const {socket} = response;
      if (socket === null) {
        respond(500, 'Socket was not created.');
        return;
      }
      try {
        const client = clientManager.getClientBySecret(clientSecret);
        if (!client.agent.canConnect()) {
          respond(403, 'Too many connections.');
          return;
        }
        response.shouldKeepAlive = true;
        respond(200, 'Connection created.');
        socket.removeAllListeners('data');
        client.agent.onConnection(socket);
      } catch (error) {
        respond(500, String(error));
      }
    });
    this.server.keepAliveTimeout = Math.pow(2, 31) - 1;
  }
}
