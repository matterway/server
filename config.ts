let {
  API_PORT: apiPort = 80,
  TUNNEL_PORT: tunnelPort = 3030,
  MAX_SOCKETS: maxSockets = 10
} = process.env;
export const [API_PORT, TUNNEL_PORT, MAX_SOCKETS] = [+apiPort, +tunnelPort, +maxSockets];
export const {
  DOMAIN,
  TUNNEL_DOMAIN,
  AUTH_JWKS_URI = '',
  AUTH_AUDIENCE = '',
  AUTH_TOKEN_ISSUER = ''
} = process.env;

const invalidEnv = [
  ...Object.entries({API_PORT, TUNNEL_PORT})
    .filter(([, value]) => !(
      Number.isInteger(value) &&
      value >= 80 && value < Math.pow(2, 16)
    )),
  ...Object.entries({MAX_SOCKETS})
    .filter(([, value]) => !Number.isInteger(value)),
  ...Object.entries({AUTH_JWKS_URI, AUTH_AUDIENCE, AUTH_TOKEN_ISSUER})
    .filter(([, value]) => !value)
];
if (invalidEnv.length > 0) {
  throw new Error(
    `Environment variables "${invalidEnv.map(([key]) => key).join('", "')}" ` +
    `have invalid values: ${invalidEnv.map(([, value]) => value).join(', ')}.`
  );
}
