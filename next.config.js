const path = require('path')
const fs = require('fs')
const withCSS = require('@zeit/next-css')
const withTypescript = require('@zeit/next-typescript')
const { pipe } = require('ramda')

const staticData = (() => {
  const staticDataSource = process.env.STATIC_DATA_SOURCE
  if (!staticDataSource) {
    console.log('Using remote data')
    return undefined
  }

  try {
    const staticData = JSON.parse(fs.readFileSync(staticDataSource))
    console.log('Using static data')
    return staticData
  } catch (err) {
    console.error(`Failed to load static data from ${staticDataSource}`)
    console.log(err)
    console.log('Falling back to remote data')
    return undefined
  }
})()


module.exports = pipe(withTypescript, withCSS)({
  dir: path.join(__dirname, 'frontend'),
  dev: process.env.NODE_ENV !== 'production',
  publicRuntimeConfig: {
    SERVER_URL: `http://localhost:${process.env.PORT}`,
    STATIC_DATA: staticData,
  },
  cssModules: true,
  cssLoaderOptions: {
    importLoaders: 1,
    localIdentName: "[local]",
  }
})