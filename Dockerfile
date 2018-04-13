FROM node:9.11-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache make g++ python2 libsodium-dev curl coreutils && \
  npm install -g node-gyp nodemon

# Set up volume for npm cache
VOLUME /home/.npm/_cacache/

USER node