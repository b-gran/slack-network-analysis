const http = require('http')
const server = http.createServer((req, res) => {
  console.log('ok')
  res.end()
})
server.listen(process.env.PORT)