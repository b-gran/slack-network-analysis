const path = require('path')
const withCSS = require('@zeit/next-css')

module.exports = withCSS({
  dir: path.join(__dirname, 'frontend'),
  dev: process.env.NODE_ENV !== 'production',
  publicRuntimeConfig: {
    SERVER_URL: `http://localhost:${process.env.PORT}`,
  },
  cssModules: true,
  cssLoaderOptions: {
    importLoaders: 1,
    localIdentName: "[local]",
  }
})