const R = require('ramda')

const http = require('http')
const path = require('path')
const express = require('express')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const axios = require('axios')
const httpError = require('./error').httpError

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
      console.log(`CREATING TEAM ${req.body}`)
      Api.createTeam(req.body)
        .then(team => {
          return res.json(team)
        })
        .catch(next)
    })

    app.post('/messages', q({ team_id: fieldExists }), h(async (req, res) => {
      const { team_id } = req.query
      console.log(`MESSAGES TEAM(${team_id})`)

      const team = await remapError('error accessing team')(models.Team.findOneAndUpdate(
        { team_id: team_id },
        {
          $set: {
            'message_data.is_fetching': true,
          },
        }
      ))

      if (!team) {
        return errorHandler(res, `no team found with id ${team_id}`, 400)()
      }

      // Start background processing job
      setImmediate(
        async () => {
          try {
            await Api.loadMessagesForTeam(team_id)
            console.log(`Finished loading messages for team ${team.team}`)
          } catch (err) {
            console.error('Error loading messages')
            console.log(err)
          } finally {
            try {
              await models.Team.findOneAndUpdate(
                { team_id: team_id },
                {
                  $set: {
                    'message_data.is_fetching': false,
                    'message_data.has_message_data': true,
                    'message_data.last_fetched': new Date(),
                  },
                }
              )
            } catch (updateErr) {
              console.warn('Failed to update message_data')
            }
          }
        }
      )

      // Return quickly
      return res.status(200).json({ ok: true })
    }))

    app.post('/users', q({ team_id: fieldExists }), h(async (req, res) => {
      const { team_id } = req.query
      console.log(`USERS (${team_id})`)

      const team = await remapError('error accessing team')(models.Team.findOneAndUpdate(
          { team_id: team_id },
          {
            $set: {
              'user_data.is_fetching': true,
            },
          }
        ))

      if (!team) {
        return errorHandler(res, `no team found with id ${team_id}`, 400)()
      }

      try {
        const result = await remapError('error loading users')(Api.loadUsersForTeam(req.query.team_id))
        return res.status(200).json({ ok: true, userCount: result.matchedCount })
      } finally {
        try {
          await models.Team.findOneAndUpdate(
            { team_id: team_id },
            {
              $set: {
                'user_data.is_fetching': false,
                'user_data.has_user_data': true,
                'user_data.last_fetched': new Date(),
              },
            }
          )
        } catch (updateErr) {
          console.warn('Failed to update user_data')
        }
      }
    }))

    app.post('/channels', q({ team_id: fieldExists }), h(async (req, res) => {
      const { team_id } = req.query
      console.log(`CHANNELS (${team_id})`)

      const team = await remapError('error accessing team')(models.Team.findOneAndUpdate(
        { team_id: team_id },
        {
          $set: {
            'channel_data.is_fetching': true,
          },
        }
      ))

      if (!team) {
        return errorHandler(res, `no team found with id ${team_id}`, 400)()
      }

      // Start background processing job
      setImmediate(
        async () => {
          try {
            const result = await Api.loadChannelsForTeam(team_id)
            console.log(`Loaded ${result.matchedCount} channels`)
          } catch (err) {
            console.error('Error loading channels')
            console.log(err)
          } finally {
            try {
              await models.Team.findOneAndUpdate(
                { team_id: team_id },
                {
                  $set: {
                    'channel_data.is_fetching': false,
                    'channel_data.has_channel_data': true,
                    'channel_data.last_fetched': new Date(),
                  },
                }
              )
            } catch (updateErr) {
              console.warn('Failed to update channel_data')
            }
          }

        }
      )

      // Return quickly
      return res.status(200).json({ ok: true })
    }))

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
