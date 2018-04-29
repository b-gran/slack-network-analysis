import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Link from 'next/link'
import Router from 'next/router'

import axios from 'axios'

import Card, { CardContent } from 'material-ui/Card'
import Typography from 'material-ui/Typography'
import Button from 'material-ui/Button'
import List, { ListItem, ListItemText } from 'material-ui/List'
import Divider from 'material-ui/Divider'
import Modal from 'material-ui/Modal'
import TextField from 'material-ui/TextField'
import { FormControl, FormLabel } from 'material-ui/Form'

import { Div } from 'glamorous'
import { css } from 'glamor'

import { observable, action } from 'mobx'
import { PropTypes as MobxPropTypes, observer, inject, Provider } from 'mobx-react'
import * as R from 'ramda'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

import { mergeInitialState, SERVER_URL } from '../config'
import * as MProps from '../props'

// Graph physics plugin
cytoscape.use(cola)

// Resets
css.global('body', { margin: 0 })

const initialState = observable({
  error: undefined,
  graph: undefined,
  nodesById: undefined,
  edgesById: undefined,
  usersById: undefined,
})

const state = (module.hot && module.hot.data && module.hot.data.state) ?
  mergeInitialState(initialState, module.hot.data.state) :
  initialState

const loadInitialData = action(graphId => axios.get(`${SERVER_URL}/graphs/${graphId}`)
  .then(res => {
    const { graph, nodes, edges, users } = res.data
    state.graph = graph
    state.nodesById = nodes
    state.edgesById = edges
    state.usersById = users
  })
  .catch(err => state.error = err)
)


const Visualize = observer(class _Visualize extends React.Component {
  static displayName = 'Visualize'

  static propTypes = {
    graph: MProps.Graph,
    nodesById: PropTypes.objectOf(MProps.Node),
    edgesById: PropTypes.objectOf(MProps.Edge),
    usersById: PropTypes.objectOf(MProps.User),
    error: MProps.error,
  }

  graphContainer = null
  graphVisualisation = null

  componentDidMount () {
    return loadInitialData(Router.query.graph)
  }

  isLoaded () {
    return Boolean(
      this.props.graph &&
      this.props.nodesById &&
      this.props.edgesById &&
      this.props.usersById
    )
  }

  renderGraph () {
    const edgeLengthVal = 45
    const layoutParams = {
      name: 'cola',
      nodeSpacing: 20,
      edgeLengthVal,
      animate: true,
      randomize: true,
      maxSimulationTime: 30000,
      edgeLength: edge => edgeLengthVal / edge.data('weight'),
    };

    const nodes = Object.keys(this.props.nodesById).map(nodeId => {
      const node = this.props.nodesById[nodeId]
      return ({
        group: 'nodes',
        data: {
          id: node._id,
          name: this.props.usersById[node.user].name,
        },
      })
    })

    const edges = Object.keys(this.props.edgesById).map(edgeId => {
      const edge = this.props.edgesById[edgeId]
      return ({
        group: 'edges',
        data: {
          id: edge._id,
          source: edge.vertices[0],
          target: edge.vertices[1],
          weight: edge.weight,
        },
      })
    }).filter(edge => edge.data.weight < 0.1)

    const cyGraph = cytoscape({
      container: this.graphContainer,
      elements: [ ...nodes, ...edges ],
    })

    const layout = cyGraph.layout(layoutParams)
    layout.run()

    return cyGraph
  }

  componentDidUpdate (prevProps) {
    const shouldUpdateGraph = this.isLoaded() && ((
      prevProps.graph !== this.props.graph ||
      prevProps.nodesById !== this.props.nodesById ||
      prevProps.edgesById !== this.props.edgesById ||
      prevProps.usersById !== this.props.usersById
    ) || !this.graphVisualisation)

    if (shouldUpdateGraph && this.graphVisualisation) {
      this.graphVisualisation.destroy()
      this.graphVisualisation = null
    }

    if (shouldUpdateGraph) {
      this.graphVisualisation = this.renderGraph()
    }
  }

  render () {
    const isLoaded = this.isLoaded()

    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis: Visualization</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="center" alignItems="center"
             height="100vh">

          <div
            style={{ height: '100vh;', width: '100vw;' }}
            ref={graphContainer => this.graphContainer = graphContainer} />

        </Div>
      </React.Fragment>
    )
  }
})

const WVisualize = inject(stores => ({ ...stores.state }))(Visualize)

export default () => (
  <Provider state={state}>
    <WVisualize />
  </Provider>
)

// Keep track of state between module reloads
if (module.hot) {
  module.hot.dispose(data => {
    data.state = state
    return data
  })
}
