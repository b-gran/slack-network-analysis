const R = require('ramda')

const http = require('http')
const path = require('path')
const express = require('express')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const axios = require('axios')
const httpError = require('./error').httpError

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

    app.use(bodyParser.json())

    app.get('/slack/getTeamData', q({ token: fieldExists }), (req, res, next) => {
      console.log('SLACK TEAM DATA')
      axios({
        url: 'https://slack.com/api/auth.test',
        params: {
          token: req.query.token,
        }
      })
        .then(res => res.status(200).json(res.data))
        .catch(err => res.status(400).json(httpError(400, 'bad slack response', err)))
    })

    app.get('/teams/:teamId', (req, res, next) => {
      console.log('TEAM BY ID')
      Api.getTeamByTeamId(req.params.teamId)
        .then(result => {
          console.log('result')
          console.log(result)
          return res.json(result)
        })
        .catch(next)
    })

    app.get('/teams', (req, res, next) => {
      console.log('TEAMS')
      Api.getTeams()
        .then(result => {
          console.log('result')
          console.log(result)
          return res.json(result)
        })
        .catch(next)
    })

    app.post('/teams', (req, res, next) => {
      console.log(`CREATING TEAM ${req.body}`)
      Api.createTeam(req.body)
        .then(team => {
          console.log('team')
          console.log(team)
          return res.json(team)
        })
        .catch(next)
    })

    app.get('/messages', q({ channel: fieldExists, team_id: fieldExists }), (req, res) => {
      console.log(`MESSAGES (${req.query.channel}) TEAM(${req.query.team_id})`)
      Api.loadChannelMessagesForTeam(req.query.team_id, req.query.channel, new Date(2018, 2, 18, 19))
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

    app.get('/users', q({ team_id: fieldExists }), (req, res) => {
      console.log(`USERS (${req.query.team_id})`)
      Api.loadUsersForTeam(req.query.team_id)
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

    // Everything else gets passed through to Next
    app.use((req, res) => handler(req, res))

    app.use((err, req, res, next) => {
      console.log('ERROR')
      console.log(err)
      return res.status(500).json(err)
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

const fieldExists = {
  check: Boolean,
  message: 'must be provided',
}

// Validate query strings
// Usage:
// q({
//   foo: {
//     check: s => s.length === 3,
//     message: 'must have length 3',
//   },
// })
function q (validator) {
  if (!validator || R.type(validator) !== 'Object') {
    throw new Error('request query validators require a validation object')
  }

  const keys = Object.keys(validator)
  if (keys.length === 0) {
    return (req, res, next) => next()
  }

  return (req, res, next) => {
    const queryStringErrors = keys.reduce((failures, key) => {
      const { check, message } = validator[key]
      return check(req.query[key])
        ? failures
        : { ...failures, [key]: message }
    }, {})

    if (Object.keys(queryStringErrors).length === 0) {
      return next()
    }

    return res.status(400).json(httpError(400, 'invalid query', queryStringErrors))
  }
}
