FROM node:14.15.0-alpine

WORKDIR /app
COPY . /app

RUN yarn install
RUN yarn build

ENV NODE_ENV production
ENTRYPOINT ["node", "./dist/bin/server.js"]
