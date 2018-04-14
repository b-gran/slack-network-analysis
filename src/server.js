const http = require('http')
const path = require('path')

console.log('Starting up...')

process.once('SIGUSR2', () => {
  shutdown().then(() => {
    process.kill(process.pid, 'SIGUSR2')
  })
})

let server
const next = require('next')
const nextApp = next({
  dir: path.join(__dirname, 'frontend'),
  dev: process.env.NODE_ENV !== 'production',
})

nextApp.prepare()
  .then(() => {
    const handler = nextApp.getRequestHandler()
    server = http.createServer((req, res) => {
      console.log('req here')
      return handler(req, res)
    })

    server.listen(process.env.PORT)
  })

async function shutdown () {
  if (server) {
    await close(server)
  }

  await close(nextApp.hotReloader.webpackDevMiddleware)
  await nextApp.close()
}

function close (closeable) {
  return new Promise(resolve => closeable.close(
    err => {
      if (err) {
        console.log('Error closing')
        console.log(err)
      }
      return resolve()
    }
  ))
}
