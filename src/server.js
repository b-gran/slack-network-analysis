const http = require('http')
const path = require('path')
const express = require('express')
const mongoose = require('mongoose')

const Api = require('./api')

console.log('Starting up...')
process.once('SIGUSR2', () => {
  shutdown().then(() => {
    process.kill(process.pid, 'SIGUSR2')
  })
})

const SLACK_TOKEN = process.env.SLACK_TOKEN
if (!SLACK_TOKEN) {
  console.error('No slack token provided.')
  process.exit(3)
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('No database URL')
  process.exit(3)
}
console.log(`Connecting to mongodb at ${DATABASE_URL}`)

let server
const nextDirectory = path.join(__dirname, 'frontend')
const next = require('next')
const nextApp = next({
  dir: nextDirectory,
  dev: process.env.NODE_ENV !== 'production',
})
console.log(`Serving next from ${nextDirectory}`)

Promise.all([
  nextApp.prepare(),
  mongoose.connect(DATABASE_URL),
])
  .then(([nextInstance, mongooseConnection]) => {
    const handler = nextApp.getRequestHandler()

    const app = express()

    app.get('/messages', (req, res) => {
      console.log(`MESSAGES (${req.query.channel})`)
      Api.traverseMessages(req.query.channel, new Date(2018, 2, 18, 19))
        .then(result => {
          console.log('result')
          console.log(result)
        })
        .catch(err => {
          console.log('err')
          console.log(err)
        })
        .finally(() => res.end())
    })

    app.get('/users', (req, res) => {
      console.log(`USERS (${req.query.channel})`)
      Api.traverseUsers(req.query.channel)
        .then(result => {
          console.log('result')
          console.log(result)
        })
        .catch(err => {
          console.log('err')
          console.log(err)
        })
        .finally(() => res.end())
    })

    app.use((req, res) => {
      console.log('RENDER APP')
      return handler(req, res)
    })

    server = http.createServer(app).listen(process.env.PORT)
    console.log('Base server started')
  })

async function shutdown () {
  if (server) {
    await close(server)
  }

  await close(nextApp.hotReloader.webpackDevMiddleware)
  await nextApp.close()
}

function close (closeable) {
  return new Promise(resolve => closeable && closeable.close(
    err => {
      if (err) {
        console.log('Error closing')
        console.log(err)
      }
      return resolve()
    }
  ))
}
