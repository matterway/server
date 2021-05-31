import {createServer} from 'http';

export class AgentConnectionManager {
  /**
   * @param {{clientManager: import("./ClientManager").ClientManager}}
   */
  constructor({clientManager}) {
    this.server = createServer(({headers, path, method}, response) => {
      if (method !== 'GET') {
        response.statusCode = 405;
        response.end('Only GET methods are supported.');
        return;
      }
      if (path === '/') {
        response.statusCode = 200;
        response.end('All systems are operational.');
        return;
      }
      if (path !== '/connect') {
        response.statusCode = 404;
        response.end('Not found.');
        return;
      }
      const clientSecret = headers['x-client-secret'];
      if (!clientSecret) {
        response.statusCode = 400;
        response.end('Client secret is missing.');
        return;
      }
      if (!clientManager.hasSecret(clientSecret)) {
        response.statusCode = 404;
        response.end('Client not found.');
        return;
      }
      try {
        const client = clientManager.getClientBySecret(clientSecret);
        response.shouldKeepAlive = true;
        response.statusCode = 200;
        response.end('Connection created.');
        response.socket.removeAllListeners();
        client.agent.onConnection(response.socket);
      } catch (error) {
        response.statusCode = 500;
        response.end(String(error));
      }
    });
    this.server.keepAliveTimeout = Date.now();
  }
}
