FROM node:9.11-alpine

WORKDIR /usr/src/app

# Core deps
RUN apk add --no-cache make g++ python2 libsodium-dev curl coreutils

# Dev tools
RUN apk add --no-cache mongodb-tools mongodb

RUN npm install -g node-gyp @b-gran/nodemon@1.1.0

# Set up volume for npm cache
VOLUME /home/.npm/_cacache/

USER node