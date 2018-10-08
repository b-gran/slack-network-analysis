/*
 * Provides a consistent API for graph data.
 * The data can come from a running server or anything else.
 */

import axios from 'axios'
import getConfig from 'next/config'
import { SERVER_URL } from './config'

export const STATIC_DATA = getConfig().publicRuntimeConfig.STATIC_DATA

class DataSource {
  // Returns a promise that resolves to the graph data.
  //    { graph, nodes, edges, users }
  load (graphId) {
    return Promise.reject(new Error('unimplemented method'))
  }
}

class GraphAPIDataSource extends DataSource {
  constructor (serverUrl) {
    super()
    this.serverUrl = serverUrl
  }

  load (graphId) {
    return axios.get(`${this.serverUrl}/graphs/${graphId}`)
      .then(res => {
        const {graph, nodes, edges, users } = res.data
        return { graph, nodes, edges, users }
      })
  }
}

class StaticDataSource extends DataSource {
  constructor (graphData) {
    super()
    this.graphData = graphData
  }

  load (graphId) {
    return Promise.resolve(this.graphData)
  }
}

const dataSource = STATIC_DATA
  ? new StaticDataSource(STATIC_DATA)
  : new GraphAPIDataSource(SERVER_URL)
export default dataSource


