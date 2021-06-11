import * as http from 'http';
import type {Socket, AddressInfo} from 'net';
import type {ClientManager} from './ClientManager';
import {AgentConnectionManager} from './AgentConnectionManager';

export function wait(timeout = 500) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}
export async function createAgentServer(clientManager: ClientManager) {
  const {server} = new AgentConnectionManager({clientManager});
  await new Promise((resolve, reject) => {
    server.listen(resolve);
    server.once('close', () => {
      reject(new Error('Failed to start agent server.'));
    });
  });
  const teardown = () => {
    return new Promise<void>((resolve, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error('Agent server did not close after 500ms.'));
      }, 500);
      server.once('close', () => {
        clearTimeout(timerId);
        resolve();
      });
      server.close();
    });
  };
  return {
    teardown,
    port: (server.address() as AddressInfo).port
  };
}
export function connectToAgent({port, secret}: {port: number, secret: string}) {
  const request = http.get({
    port,
    path: '/connect',
    headers: {'x-client-secret': secret}
  });
  request.end();
  return new Promise<Socket>((resolve, reject) => {
    request.once('response', (response) => {
      if (response.statusCode === 200) {
        resolve(response.socket);
        return;
      }
      response.once('data', (data) => {
        const message = String(data);
        reject(new Error(`${response.statusCode}: "${message}".`));
      });
    });
    request.once('error', reject);
  });
}
