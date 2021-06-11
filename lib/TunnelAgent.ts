import type {Socket} from 'net';
import {Agent} from 'http';
import Debug from 'debug';
import * as EventEmitter from 'events';

type ConnectionCallback = (error: null | Error, connection?: Socket) => void;
/**
 * Implements an http.Agent interface to a pool of tunnel sockets
 * A tunnel socket is a connection _from_ a client that will
 * service http requests. This agent is usable wherever one can use an http.Agent.
 */
export class TunnelAgent extends Agent {
    /**
     * Sockets we can hand out via createConnection.
     */
    readonly #availableSockets: Socket[] = [];
    /**
     * When a createConnection cannot return a socket, it goes into a queue
     * once a socket is available it is handed out to the next callback.
     */
    readonly #waitingCreateConnection: ConnectionCallback[] = [];
    readonly events = new EventEmitter();
    readonly #debug;
    readonly maxSockets;
    #closed = false;
    #connectedSockets = 0

    constructor({maxSockets, clientId}: {maxSockets: number, clientId: string}) {
        super({
            keepAlive: true,
            // only allow keepalive to hold on to one socket
            // this prevents it from holding on to all the sockets so they can be used for upgrades
            maxFreeSockets: 1
        });
        this.#debug = Debug(`lt:TunnelAgent[${clientId}]`);
        this.maxSockets = maxSockets;
    }
    isClosed() {
        return this.#closed;
    }
    stats() {
        return {
            connectedSockets: this.#connectedSockets,
        };
    }
    canConnect() {
        return this.#connectedSockets < this.maxSockets;
    }
    /**
     * new socket connection from client for tunneling requests to client
     */
    onConnection(socket: Socket) {
        // no more socket connections allowed
        if (!this.canConnect()) {
            this.#debug('no more sockets allowed');
            socket.destroy();
            return;
        }
        socket.once('close', (hadError) => {
            this.#debug('closed socket (error: %s)', hadError);
            this.#connectedSockets -= 1;
            // remove the socket from available list
            const idx = this.#availableSockets.indexOf(socket);
            if (idx >= 0) {
                this.#availableSockets.splice(idx, 1);
            }

            this.#debug('connected sockets: %s', this.#connectedSockets);
            if (this.#connectedSockets <= 0) {
                this.#debug('all sockets disconnected');
                this.events.emit('offline');
            }
        });
        // close will be emitted after this
        socket.once('error', (error) => {
            this.#debug('socket error', error);
            // we do not log these errors, sessions can drop from clients for many reasons
            // these are not actionable errors for our server
            socket.destroy();
        });

        if (this.#connectedSockets === 0) {
            this.events.emit('online');
        }
        this.#connectedSockets += 1;
        this.#debug('new connection from: %s', socket.address());

        // if there are queued callbacks, give this socket now and don't queue into available
        const callback = this.#waitingCreateConnection.shift();
        if (callback) {
            this.#debug('giving socket to queued conn request');
            setTimeout(() => {
                callback(null, socket);
            }, 0);
            return;
        }
        // make socket available for those waiting on sockets
        this.#availableSockets.push(socket);
    }
    /**
     * Fetch a socket from the available socket pool for the agent
     * if no socket is available, queue `callback(error, socket)`.
     */
    createConnection(_info: {}, callback: ConnectionCallback) {
        if (this.#closed) {
            callback(new Error('Agent is closed.'));
            return;
        }
        this.#debug('create connection');

        // socket is a tcp connection back to the user hosting the site
        const sockect = this.#availableSockets.shift();

        // no available sockets
        // wait until we have one
        if (!sockect) {
            this.#waitingCreateConnection.push(callback);
            this.#debug('waiting connected: %s', this.#connectedSockets);
            this.#debug('waiting available: %s', this.#availableSockets.length);
            return;
        }
        this.#debug('socket given');
        callback(null, sockect);
    }
    destroy() {
        super.destroy();
        this.#closed = true;
        this.#debug('closed tcp socket');
        // flush any waiting connections
        for (const callback of this.#waitingCreateConnection) {
            callback(new Error('closed'));
        }
        this.#waitingCreateConnection.splice(0);
        this.events.emit('end');
    }
}
