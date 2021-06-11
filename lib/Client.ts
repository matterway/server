import type {Socket} from 'net';
import * as http from 'http';
import Debug from 'debug';
import * as pump from 'pump';
import * as EventEmitter from 'events';
import type {TunnelAgent} from './TunnelAgent';

const defaultGraceTimeout = 3000;
type Public<T> = {[key in keyof T]: T[key]};

// A client encapsulates request/response handling using an agent
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
export class Client extends EventEmitter {
    #unscheduleClose: (() => void) | null = null;
    readonly agent;
    readonly secret;
    readonly id;
    readonly #graceTimeout;
    readonly #debug;
    constructor({
        id,
        secret,
        agent,
        graceTimeout = defaultGraceTimeout
    }: {
        id: string,
        secret: string,
        agent: Public<TunnelAgent>,
        graceTimeout?: number | null
    }) {
        super();
        this.agent = agent;
        this.secret = secret;
        this.id = id;
        this.#graceTimeout = graceTimeout;
        this.#debug = Debug(`lt:Client[${this.id}]`);
        this.scheduleCloseWhenOffline();

        agent.events.on('online', () => {
            this.#debug('client online %s', id);
            this.#unscheduleClose?.();
        });
        agent.events.on('offline', () => {
            this.#debug('client offline %s', id);
            this.scheduleCloseWhenOffline();
        });
        // TODO(roman): an agent error removes the client, the user needs to re-connect?
        // how does a user realize they need to re-connect vs some random client being assigned same port?
        agent.events.once('error', () => {
            this.close();
        });
    }
    scheduleCloseWhenOffline() {
        this.#unscheduleClose?.();
        if (this.#graceTimeout === null) {
            return;
        }
        const timerId = setTimeout(() => this.close(), this.#graceTimeout)
            .unref();
        this.#unscheduleClose = () => {
            this.#unscheduleClose = null;
            clearTimeout(timerId);
        };
    }
    stats() {
        return this.agent.stats();
    }
    close() {
        this.#unscheduleClose?.();
        this.agent.destroy();
        this.emit('close');
    }
    handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
        this.#debug('> %s', request.url);
        const clientRequest = http.request({
            path: request.url,
            agent: this.agent,
            method: request.method,
            headers: request.headers
        }, (clientResponse) => {
            this.#debug('< %s', request.url);
            // write response code and headers
            response.writeHead(clientResponse.statusCode!, clientResponse.headers);

            // using pump is deliberate - see the pump docs for why
            pump(clientResponse, response);
        });

        // this can happen when underlying agent produces an error
        // in our case we 504 gateway error this?
        // if we have already sent headers?
        clientRequest.once('error', () => {
            // TODO(roman): if headers not sent - respond with gateway unavailable
        });

        // using pump is deliberate - see the pump docs for why
        pump(request, clientRequest);
    }
    /**
     * @param {http.IncomingMessage} request
     * @param {import('net').Socket} socket
     */
    handleUpgrade(request: http.IncomingMessage, socket: Socket) {
        this.#debug('> [up] %s', request.url);
        socket.once('error', (error: any) => {
            // These client side errors can happen if the client dies while we are reading
            // We don't need to surface these in our logs.
            if (error.code == 'ECONNRESET' || error.code == 'ETIMEDOUT') {
                return;
            }
            console.error(error);
        });

        this.agent.createConnection({}, (error, connection) => {
            this.#debug('< [up] %s', request.url);
            // any errors getting a connection mean we cannot service this request
            if (error || connection === undefined) {
                socket.end();
                return;
            }

            // socket met have disconnected while we waiting for a socket
            if (!socket.readable || !socket.writable) {
                connection.destroy();
                socket.end();
                return;
            }

            // websocket requests are special in that we simply re-create the header info
            // then directly pipe the socket data
            // avoids having to rebuild the request and handle upgrades via the http client
            const headers = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
            for (let i=0 ; i < (request.rawHeaders.length-1) ; i+=2) {
                headers.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i+1]}`);
            }
            headers.push('');
            headers.push('');

            // using pump is deliberate - see the pump docs for why
            pump(connection, socket);
            pump(socket, connection);
            connection.write(headers.join('\r\n'));
        });
    }
}
