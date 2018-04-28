const path = require('path')

module.exports = {
  dir: path.join(__dirname, 'frontend'),
  dev: process.env.NODE_ENV !== 'production',
  publicRuntimeConfig: {
    SERVER_URL: `http://localhost:${process.env.PORT}`,
  }
}