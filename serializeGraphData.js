const axios = require('axios').default
const yargs = require('yargs')
const fs = require('fs')

const args = yargs
  .command('$0 <graphId>', 'serialize graph data for the specified graph')
  .option('server', {
    demandOption: true,
    describe: 'url of the server to fetch data from',
    type: 'string',
  })
  .option('output', {
    demandOption: true,
    describe: 'path to write serialized data',
    type: 'string',
  })
  .argv

console.log('===== Starting data serialization =====')
console.log('Fetching data...')

const graphAPIUrl = `${args.server}/graphs/${args.graphId}`

return axios.get(graphAPIUrl, {
  responseType: 'json',
})
  .then(res => {
    const {graph, nodes, edges, users} = res.data

    if (!graph || !nodes || !edges || !users) {
      console.error('Error fetching all data')
      console.log(res.data)
      return Promise.reject(new Error('failed to fetch all data'))
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Serializing data...')
        const data = JSON.stringify({
          graph, nodes, edges, users
        })

        console.log('Writing data to disk...')
        return fs.writeFile(args.output, data, err => {
          if (err) {
            console.error(`Failed to write data to ${args.output}`)
            console.log(err)
            return reject(err)
          }

          return resolve()
        })
      } catch (err) {
        console.error('Failed to serialize data')
        console.log(err)
        return reject(err)
      }
    })
  })
  .then(() => {
    console.log(`Wrote serialized data to disk at ${args.output}.`)
    return process.exit(0)
  })
  .catch(err => {
    console.log('Error serializing graph data')
    console.log(err)
    return process.exit(1)
  })
