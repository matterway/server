const optimist = require('optimist');
import Debug from 'debug';
import type {AddressInfo} from 'net';
import {createAppServer} from './AppServer';
import {PORT, DOMAIN, MAX_TUNNEL_CONNECTIONS} from './config';

const debug = Debug('localtunnel');
const argv = optimist
    .usage('Usage: $0 --port [num]')
    .options('port', {
        default: PORT,
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
        default: MAX_TUNNEL_CONNECTIONS,
        describe: 'maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)'
    })
    .argv;

if (argv.help) {
    optimist.showHelp();
    process.exit();
}

const server = createAppServer({
    maxSockets: +argv['max-sockets'],
    domain: argv.domain,
});
server.listen(argv.port, argv.address, () => {
    debug(
        'api server listening on port: %d',
        (server.address() as AddressInfo).port
    );
});

process.on('SIGINT', () => {
    process.exit();
});
process.on('SIGTERM', () => {
    process.exit();
});

// vim: ft=javascript
