import type {RequestHandler} from 'express';
import type {ClientManager} from './ClientManager';

export interface TunnelAgentMiddlewareOptions {
  clientManager: ClientManager;
}
export function createTunnelAgentMiddleware(
  {clientManager}: TunnelAgentMiddlewareOptions
): RequestHandler {
  return ({headers}, response) => {
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
    response.setTimeout(Math.pow(2, 31) - 1);
    response.status(200).send('Connection created.');
    socket.removeAllListeners('data');
    client.agent.onConnection(socket);
  };
}
