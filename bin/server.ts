require('localenv');
const optimist = require('optimist');
const log = require('book');
import Debug from 'debug';
import type {AddressInfo} from 'net';
import {createServers} from '../server';
import {API_PORT, DOMAIN, TUNNEL_PORT} from '../config';

const debug = Debug('localtunnel');
const argv = optimist
    .usage('Usage: $0 --port [num]')
    .options('port', {
        default: API_PORT,
        describe: 'listen on this port for outside requests'
    })
    .options('address', {
        default: '0.0.0.0',
        describe: 'IP address to bind to'
    })
    .options('domain', {
        default: DOMAIN,
        describe: 'Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)',
    })
    .options('max-sockets', {
        default: 1,
        describe: 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)'
    })
    .argv;

if (argv.help) {
    optimist.showHelp();
    process.exit();
}

const {apiServer, tunnelServer} = createServers({
    maxSockets: +argv['max-sockets'],
    domain: argv.domain,
});
apiServer.listen(argv.port, argv.address, () => {
    debug(
        'api server listening on port: %d',
        (apiServer.address() as AddressInfo).port
    );
});
tunnelServer.listen(TUNNEL_PORT, argv.address, () => {
    debug(
        'agent server listening on port: %d',
        (tunnelServer.address() as AddressInfo).port
    );
});

process.on('SIGINT', () => {
    process.exit();
});
process.on('SIGTERM', () => {
    process.exit();
});
process.on('uncaughtException', (err) => {
    log.error(err);
});
process.on('unhandledRejection', (reason, promise) => {
    log.error(reason);
});

// vim: ft=javascript
