FROM node:14.15.0-alpine

WORKDIR /app

COPY package.json /app/
COPY yarn.lock /app/
RUN yarn install --production && yarn cache clean

COPY src /app/src
COPY tsconfig.json /app/
COPY tsconfig.production.json /app/
RUN yarn build:prod

COPY bin /app/bin

ENV NODE_ENV production
ENTRYPOINT ["./bin/server"]
