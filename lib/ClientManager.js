import Debug from 'debug';
import {Client} from './Client';
import {TunnelAgent} from './TunnelAgent';

export class ClientManager {
    /**
     * @param {{maxSockets: number}}
     */
    constructor({maxSockets}) {
        this.maxSockets = maxSockets;
        /**
         * @type {Map<string, Client>}
         */
        this.clientsBySecrect = new Map();
        /**
         * @type {Map<string, Client>}
         */
        this.clientsById = new Map();
        this.stats = {tunnels: 0};
        this.debug = Debug('lt:ClientManager');
    }
    /**
     * @param {{id: string, secret: string}} options
     */
    newClient({id, secret}) {
        if (this.clientsById.has(id)) {
            throw new Error(`Client with id "${id}" already exists.`);
        }
        if (this.clientsBySecrect.has(secret)) {
            throw new Error('Duplicate secret.');
        }
        const {maxSockets} = this;
        const agent = new TunnelAgent({clientId: id, maxSockets});
        const client = new Client({id, secret, agent});
        this.clientsById.set(id, client);
        this.clientsBySecrect.set(secret, client);
        this.stats.tunnels++;
        client.once('close', () => this.removeClient(id));
        return {id, secret, maxSockets};
    }
    /**
     * @param {string} id
     */
    removeClient(id) {
        const client = this.clientsById.get(id);
        if (!client) {
            return;
        }
        this.debug('removing client: %s', id);
        const client = this.clientsById.get(id);
        this.clientsById.delete(id);
        this.clientsBySecrect.delete(client.secret);
        this.stats.tunnels--;
        client.close();
    }
    /**
     * @param {string} id
     */
    hasClient(id) {
        return this.clientsById.has(id);
    }
    /**
     * @param {string} secret
     */
    hasSecret(secret) {
        return this.clientsBySecrect.has(secret);
    }
    /**
     * @param {string} id
     */
    getClientById(id) {
        const client = this.clientsById.get(id);
        if (!client) {
            throw new Error(`Client with id "${id}" does not exist.`);
        }
        return client;
    }
    /**
     * @param {string} secret
     */
    getClientBySecret(secret) {
        const client = this.clientsBySecrect.get(secret);
        if (!client) {
            throw new Error('Client not found.');
        }
        return client;
    }
}
