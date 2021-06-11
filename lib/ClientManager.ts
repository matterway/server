import Debug from 'debug';
import {Client} from './Client';
import {TunnelAgent} from './TunnelAgent';

export class ClientManager {
    readonly #maxSockets;
    readonly #clientsBySecrect = new Map<string, Client>();
    readonly #clientsById = new Map<string, Client>();
    readonly #debug = Debug('lt:ClientManager');
    readonly stats = {tunnels: 0}

    constructor({maxSockets}: {maxSockets: number}) {
        this.#maxSockets = maxSockets;
    }
    newClient({id, secret, graceTimeout}: {
        id: string,
        secret: string,
        graceTimeout?: number | null}
    ) {
        if (this.#clientsById.has(id)) {
            throw new Error(`Client with id "${id}" already exists.`);
        }
        if (this.#clientsBySecrect.has(secret)) {
            throw new Error('Duplicate secret.');
        }
        const maxSockets = this.#maxSockets;
        const agent = new TunnelAgent({clientId: id, maxSockets});
        const client = new Client({id, secret, agent, graceTimeout});
        this.#clientsById.set(id, client);
        this.#clientsBySecrect.set(secret, client);
        this.stats.tunnels++;
        client.once('close', () => this.removeClient(id));
        return {id, secret, maxSockets};
    }
    removeClient(id: string) {
        const client = this.#clientsById.get(id);
        if (!client) {
            return;
        }
        this.#debug('removing client: %s', id);
        this.#clientsById.delete(id);
        this.#clientsBySecrect.delete(client.secret);
        this.stats.tunnels--;
        client.close();
    }
    hasClient(id: string) {
        return this.#clientsById.has(id);
    }
    hasSecret(secret: string) {
        return this.#clientsBySecrect.has(secret);
    }
    getClientById(id: string) {
        const client = this.#clientsById.get(id);
        if (!client) {
            throw new Error(`Client with id "${id}" does not exist.`);
        }
        return client;
    }
    getClientBySecret(secret: string) {
        const client = this.#clientsBySecrect.get(secret);
        if (!client) {
            throw new Error('Client not found.');
        }
        return client;
    }
}
