import {createServer} from 'http';
import * as express from 'express';
import type {ClientManager} from './ClientManager';

export function createTunnelAgentServer(
  {clientManager}: {clientManager: ClientManager}
) {
  const app = express();
  app.get('/', ({}, response) => {
    // Important for health checking.
    response.status(200).send('All systems are operational.');
  });
  app.post('/connect', ({headers}, response) => {
    const clientSecret = headers['x-client-secret'];
    if (!clientSecret) {
      response.status(400).send('Client secret is missing.');
      return;
    }
    if (typeof clientSecret !== 'string') {
      response.status(400).send('Client secret is invalid.');
      return;
    }
    if (!clientManager.hasSecret(clientSecret)) {
      response.status(404).send('Client not found.');
      return;
    }
    const client = clientManager.getClientBySecret(clientSecret);
    if (!client.agent.canConnect()) {
      return response.status(403).send('Too many connections.');
    }
    const {socket} = response;
    if (socket === null) {
      response.status(500).send('Socket was not created.');
      return;
    }
    response.shouldKeepAlive = true;
    response.status(200).send('Connection created.');
    socket.removeAllListeners('data');
    client.agent.onConnection(socket);
  });
  app.use(({}, response) => {
    response.status(404).send('Not found.');
  });
  app.use((error: any, {}, response: express.Response, {}) => {
    response.status(500).send(String(error));
  });

  const server = createServer(app);
  server.keepAliveTimeout = Math.pow(2, 31) - 1;
  return server;
}
