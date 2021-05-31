export const MAIN_PORT = +process.env.MAIN_PORT;
export const AGENT_PORT = +process.env.AGENT_PORT;
export const {
  DOMAIN,
  AUTH_JWKS_URI,
  AUTH_AUDIENCE,
  AUTH_TOKEN_ISSUER
} = process.env;

const invalidEnv = [
  ...Object.entries({MAIN_PORT, AGENT_PORT})
    .filter(([, value]) => !(
      Number.isInteger(value) &&
      value >= 80 && value < Math.pow(2, 16)
    )),
  ...Object.entries({/* AUTH_JWKS_URI, AUTH_AUDIENCE, AUTH_TOKEN_ISSUER */})
    .filter(([, value]) => !value)
];
if (invalidEnv.length > 0) {
  throw new Error(
    `Environment variables "${invalidEnv.map(([key]) => key).join('", "')}" ` +
    `have invalid values: ${invalidEnv.map(([, value]) => value).join(', ')}.`
  );
}
