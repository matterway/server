import {expect, it, describe} from '@jest/globals';
import * as http from 'http';
import {Duplex, DuplexOptions} from 'stream';
import {Socket, AddressInfo, createConnection} from 'net';
import {Client} from './Client';
import {EventEmitter} from 'events';
import {TunnelAgent} from './TunnelAgent';

class DummySocket extends Duplex {
    _write(_chunk: Buffer, _encoding: string, callback: () => void) {
        callback();
    }
    _read(_size?: number) {
        this.push('HTTP/1.1 304 Not Modified\r\nX-Powered-By: dummy\r\n\r\n\r\n');
        this.push(null);
    }
}
class DummyAgent extends http.Agent {
    readonly events = new EventEmitter();
    createConnection({}, callback: Function) {
        callback(null, new DummySocket());
    }
}
class DummyWebsocket extends Duplex {
    readonly sentHeader;
    constructor(options: DuplexOptions) {
        super(options);
        this.sentHeader = false;
    }
    _write(chunk: Buffer, _encoding: string, callback: () => void) {
        const str = chunk.toString();
        // if chunk contains `GET / HTTP/1.1` -> queue headers
        // otherwise echo back received data
        if (str.indexOf('GET / HTTP/1.1') === 0) {
            const arr = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
            ];
            this.push(arr.join('\r\n'));
            this.push('\r\n\r\n');
        }
        else {
            this.push(str);
        }
        callback();
    }
    _read(_size?: number) {
        // nothing to implement
    }
}
class DummyWebsocketAgent extends http.Agent {
    readonly events = new EventEmitter();
    createConnection({}, callback: Function) {
        callback(null, new DummyWebsocket({}));
    }
}

describe('Client', () => {
    it('should handle request', async () => {
        const agent = new DummyAgent() as TunnelAgent;
        const client = new Client({agent, id: 'any', secret: 'some'});
        const server = http.createServer((request, response) => {
            client.handleRequest(request, response);
        });
        await new Promise(resolve => server.listen(resolve));

        const {headers} = await new Promise<http.IncomingMessage>((resolve) => {
            const request = http.get({
                host: 'localhost',
                port: (server.address() as AddressInfo).port,
                path: '/',
            }, resolve);
            request.end();
        });
        expect(headers['x-powered-by']).toBe('dummy');
        server.close();
    });

    it('should handle upgrade', async () => {
        const agent = new DummyWebsocketAgent() as TunnelAgent;
        const client = new Client({agent, id: 'any', secret: 'some'});
        const server = http.createServer();
        server.on('upgrade', (req, socket, head) => {
            client.handleUpgrade(req, socket);
        });
        await new Promise(resolve => server.listen(resolve));

        const netClient = await new Promise<Socket>((resolve) => {
            const newClient = createConnection({
                port: (server.address() as AddressInfo).port
            }, () => {
                resolve(newClient);
            });
        });
        const out = [
            'GET / HTTP/1.1',
            'Connection: Upgrade',
            'Upgrade: websocket'
        ];
        netClient.write(out.join('\r\n') + '\r\n\r\n');

        {
            const data = await new Promise((resolve) => {
                netClient.once('data', (chunk) => {
                    resolve(chunk.toString());
                });
            });
            const exp = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
            ];
            expect(data).toBe(exp.join('\r\n') + '\r\n\r\n');
        }
        {
            netClient.write('foobar');
            const data = await new Promise((resolve) => {
                netClient.once('data', (chunk) => {
                    resolve(chunk.toString());
                });
            });
            expect(data).toBe('foobar');
        }

        netClient.destroy();
        server.close();
    });
});
