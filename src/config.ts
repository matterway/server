let {
  PORT: port = 80,
  MAX_TUNNEL_CONNECTIONS: maxTunnelConnections = 10
} = process.env;
export const [PORT, MAX_TUNNEL_CONNECTIONS] = [+port, +maxTunnelConnections];
export const {
  DOMAIN,
  AUTH_JWKS_URI = '',
  AUTH_AUDIENCE = '',
  AUTH_TOKEN_ISSUER = ''
} = process.env;

const invalidEnv = [
  ...Object.entries({PORT})
    .filter(([, value]) => !(
      Number.isInteger(value) &&
      value >= 80 && value < Math.pow(2, 16)
    )),
  ...Object.entries({MAX_TUNNEL_CONNECTIONS})
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
