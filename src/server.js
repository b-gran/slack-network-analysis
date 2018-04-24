const R = require('ramda')

const http = require('http')
const assert = require('assert')
const path = require('path')
const express = require('express')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const axios = require('axios')
const httpError = require('./error').httpError
const next = require('next')

const Api = require('./api')
const models = require('./models')

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
        .then(r => res.status(200).json(r.data))
        .catch(err => res.status(400).json(httpError(400, 'bad slack response', err)))
    })

    app.get('/teams/:teamId', (req, res, next) => {
      console.log('TEAM BY ID')
      Api.getTeamByTeamId(req.params.teamId)
        .then(result => {
          return res.json(result)
        })
        .catch(next)
    })

    app.get('/teams', (req, res, next) => {
      console.log('TEAMS')
      Api.getTeams()
        .then(result => {
          return res.json(result)
        })
        .catch(next)
    })

    app.post('/teams', (req, res, next) => {
      console.log(`CREATING TEAM`, req.body)
      Api.createTeam(req.body)
        .then(team => {
          return res.json(team)
        })
        .catch(next)
    })

    app.post('/users', job(
      teamId => remapError('error loading users')(Api.loadUsersForTeam(teamId)),
      models.Team,
      'user_data'
    ))

    app.post('/channels', job(
      teamId => remapError('error loading channels')(Api.loadChannelsForTeam(teamId)),
      models.Team,
      'channel_data'
    ))

    app.post('/messages', job(
      teamId => remapError('error loading messages')(Api.loadMessagesForTeam(teamId)),
      models.Team,
      'message_data'
    ))

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

// Returns an Express router that will run background jobs
// The router will automatically update the corresponding model, which must have a JobData field.
// The jobName must be the name of the model's JobData field.
function job (runJob, model, jobName) {
  assert(typeof jobName === 'string', 'missing job name')

  const prefix = `(job ${jobName})`
  assert(typeof runJob === 'function', `${prefix} invalid job runner`)
  assert(typeof model === 'function', `${prefix} invalid model`)

  const jobRouter = express.Router()

  jobRouter.use(q({ team_id: fieldExists }))

  jobRouter.use(h(async (req, res) => {
    console.log(`${prefix} starting job`)

    const { team_id } = req.query
    const team = await remapError(`${prefix} error accessing team`)(model.findOneAndUpdate(
      { team_id: team_id },
      {
        $set: {
          [`${jobName}.is_running`]: true,
        },
      }
    ))

    if (!team) {
      return errorHandler(res, `${prefix} no team found with id ${team_id}`, 400)()
    }

    // Start background processing job
    setImmediate(
      async () => {
        try {
          await runJob(team_id)
          console.log(`${prefix} Finished job`)
        } catch (err) {
          console.error(`${prefix} Error running job`)
          console.log(err)
        } finally {
          try {
            await model.findOneAndUpdate(
              { team_id: team_id },
              {
                $set: {
                 [`${jobName}.is_running`]: false,
                 [`${jobName}.ever_run`]: true,
                 [`${jobName}.last_run`]: new Date(),
                },
              }
            )
          } catch (updateErr) {
            console.warn(`${prefix} Failed to job data`)
            console.log(updateErr)
          }
        }
      }
    )

    // Return quickly
    return res.status(200).json({ ok: true })
  }))

  return jobRouter
}

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

function errorHandler (res, message, code = 500) {
  return err => res.status(code).json(httpError(code, message, err))
}

function errorToObject (err) {
  return {
    message: err.toString(),
    stack: err.stack,
  }
}

// Wrap an async function into a request handler that gracefully handles errors.
// If the async function rejects with an error that's been remapped via remapError(),
// h() will send a nicely formatted response with the correct status code.
function h (asyncRequestHandler) {
  return (req, res, next) => {
    asyncRequestHandler(req, res, next)
      .catch(err => {
        if (err._app) {
          const appError = err._app
          delete err._app

          return res.status(appError.code).json(httpError(appError.code, appError.message, errorToObject(err)))
        }

        return next(err)
      })
  }
}

function remapError (message, code = 500) {
  return promise => promise.catch(err => {
    err._app = {
      message: message,
      code: code,
    }
    return Promise.reject(err)
  })
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
