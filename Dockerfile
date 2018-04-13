FROM node:9.11-alpine

WORKDIR /usr/src/app

# Core deps
RUN apk add --no-cache make g++ python2 libsodium-dev curl coreutils
RUN npm install -g node-gyp nodemon

# Dev tools
RUN apk add --no-cache mongodb-tools mongodb

# Set up volume for npm cache
VOLUME /home/.npm/_cacache/

USER node