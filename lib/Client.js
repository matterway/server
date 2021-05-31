import http from 'http';
import Debug from 'debug';
import pump from 'pump';
import EventEmitter from 'events';

const defaultGraceTimeout = 3000;

// A client encapsulates request/response handling using an agent
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
export class Client extends EventEmitter {
    /**
     * @type {(() => void) | null}
     */
    unscheduleClose = null;
    /**
     * @param {{id: string, secret: string, agent: import('./TunnelAgent').TunnelAgent, graceTimeout?: number}} options
     */
    constructor({id, secret, agent, graceTimeout = defaultGraceTimeout}) {
        super();
        this.agent = agent;
        this.secret = secret;
        this.id = id;
        this.graceTimeout = graceTimeout;
        this.debug = Debug(`lt:Client[${this.id}]`);
        this.scheduleCloseWhenOffline();

        agent.on('online', () => {
            this.debug('client online %s', id);
            this.unscheduleClose?.();
        });
        agent.on('offline', () => {
            this.debug('client offline %s', id);
            this.scheduleCloseWhenOffline();
        });
        // TODO(roman): an agent error removes the client, the user needs to re-connect?
        // how does a user realize they need to re-connect vs some random client being assigned same port?
        agent.once('error', () => {
            this.close();
        });
    }
    scheduleCloseWhenOffline() {
        this.unscheduleClose?.();
        const timerId = setTimeout(() => {
            this.close();
        }, this.graceTimeout).unref();
        this.unscheduleClose = () => {
            this.unscheduleClose = null;
            clearTimeout(timerId);
        };
    }
    stats() {
        return this.agent.stats();
    }
    close() {
        this.unscheduleClose?.();
        this.agent.destroy();
        this.emit('close');
    }
    /**
     * @param {http.IncomingMessage} request
     * @param {http.ServerResponse} response
     */
    handleRequest(request, response) {
        this.debug('> %s', request.url);
        const clientRequest = http.request({
            path: request.url,
            agent: this.agent,
            method: request.method,
            headers: request.headers
        }, (clientResponse) => {
            this.debug('< %s', request.url);
            // write response code and headers
            response.writeHead(clientResponse.statusCode, clientResponse.headers);

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
    handleUpgrade(request, socket) {
        this.debug('> [up] %s', request.url);
        socket.once('error', (error) => {
            // These client side errors can happen if the client dies while we are reading
            // We don't need to surface these in our logs.
            if (error.code == 'ECONNRESET' || error.code == 'ETIMEDOUT') {
                return;
            }
            console.error(error);
        });

        this.agent.createConnection((error, connection) => {
            this.debug('< [up] %s', request.url);
            // any errors getting a connection mean we cannot service this request
            if (error) {
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
