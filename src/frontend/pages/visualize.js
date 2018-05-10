import '../rehydrate'

import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Router from 'next/router'

import axios from 'axios'

import Typography from 'material-ui/Typography'
import Slider from 'rc-slider'
import style from 'rc-slider/dist/rc-slider.css'

import { Div, Input } from 'glamorous'
import { css } from 'glamor'

import { observable, action } from 'mobx'
import { PropTypes as MobxPropTypes, observer, inject, Provider } from 'mobx-react'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

import { mergeInitialState, SERVER_URL } from '../config'
import * as MProps from '../props'
import { important } from '../utils'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'
import * as Utils from '../utils'

import * as Recompose from 'recompose'

const componentFromStream = Recompose.componentFromStreamWithConfig({
  fromESObservable: Rx.from,
  toESObservable: R.identity,
})

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

  settings: {
    maxEdgeWeight: String(0.03),
    edgeLength: String(20000),
  },
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

const updateSettings = action(partialSettingsUpdate =>
  state.settings = R.merge(
    state.settings,
    partialSettingsUpdate
  )
)

class Network extends React.Component {
  static displayName = 'Network'

  static propTypes = {
    graph: MProps.Graph.isRequired,
    nodesById: PropTypes.objectOf(MProps.Node).isRequired,
    edgesById: PropTypes.objectOf(MProps.Edge).isRequired,
    usersById: PropTypes.objectOf(MProps.User).isRequired,

    settings: PropTypes.shape({
      maxEdgeWeight: PropTypes.number.isRequired,
      edgeLength: PropTypes.number.isRequired,
    }).isRequired,
  }

  graphContainer = null
  graphVisualisation = null

  renderGraph () {
    const edgeLengthVal = this.props.settings.edgeLength
    const layoutParams = {
      animate: true,
      avoidOverlap: true,

      // Edge length is linear in node weight.
      edgeLength: edge => edgeLengthVal * edge.data('weight'),

      // Constantly run physics, but don't readjust the viewport.
      name: 'cola',
      fit: false,
      infinite: true,
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
    }).filter(edge => edge.data.weight < this.props.settings.maxEdgeWeight)

    const data = [ ...nodes, ...edges ]

    // Just for doing calculations on the data.
    const dataOnly = cytoscape({
      elements: data,
    })

    // Generates a function to compute the degree centrality of nodes based on edge weight and
    // degree of the node.
    const getDegreeCentrality = dataOnly.$().dcn({
      alpha: 0.5,
      weight: edge => edge.data('weight'),
    }).degree

    // Compute degree centrality for every node and store as node.data.score
    dataOnly.nodes().forEach(node => {
      node.data('score', getDegreeCentrality(node))
    })

    const cyGraph = cytoscape({
      container: this.graphContainer,
      elements: [ ...nodes, ...edges ],
      style: [
        {
          selector: 'node',
          style: {
            "width": "mapData(score, 0, 1, 20, 60)",
            "height": "mapData(score, 0, 1, 20, 60)",
            content: node => `${node.data('name')} (${node.data('score')})`
          }
        }
      ]
    })

    // Prune the graph
    const nodesWithoutEdges = cyGraph.nodes().filter(node => {
      const edges = node.connectedEdges()
      return edges.length === 0
    })
    nodesWithoutEdges.remove()

    // Start the visualization and physics sim
    const layout = cyGraph.layout(layoutParams)
    layout.run()

    return cyGraph
  }

  componentDidMount () {
    this.graphVisualisation = this.renderGraph()
  }

  componentDidUpdate (prevProps) {
    if (prevProps === this.props) {
      return
    }

    if (this.graphVisualisation) {
      this.graphVisualisation.destroy()
      this.graphVisualisation = null
    }

    this.graphVisualisation = this.renderGraph()
  }

  render () {
    return <div
      className={graphContainer.toString()}
      ref={graphContainer => this.graphContainer = graphContainer}/>
  }
}

// Wrapper around the Network Viewer that debounces props changes and doesn't render until all
// of the graph data is available.
const NetworkStream = componentFromStream(
  $props => {
    const $needsUpdate = $props.pipe(
      operators.filter(Utils.hasDefinedProperties([ 'graph', 'nodesById', 'edgesById', 'usersById' ])),
      operators.filter(R.where({
        settings: R.where({
          maxEdgeWeight: isFinite,
          edgeLength: isFinite,
        })
      })),
      operators.map(R.evolve({
        settings: R.evolve({
          maxEdgeWeight: parseFloat,
          edgeLength: parseFloat,
        })
      })),
      operators.debounceTime(500)
    )

    return $needsUpdate.pipe(
      operators.map(props => <Network {...props} />)
    )
  }
)
NetworkStream.displayName = 'NetworkStream'
NetworkStream.propTypes = {
  graph: MProps.Graph,
  nodesById: PropTypes.objectOf(MProps.Node),
  edgesById: PropTypes.objectOf(MProps.Edge),
  usersById: PropTypes.objectOf(MProps.User),

  settings: PropTypes.shape({
    maxEdgeWeight: PropTypes.string.isRequired,
    edgeLength: PropTypes.string.isRequired,
  }).isRequired,
}

const Visualize = observer(class _Visualize extends React.Component {
  static displayName = 'Visualize'

  static propTypes = {
    graph: MProps.Graph,
    nodesById: PropTypes.objectOf(MProps.Node),
    edgesById: PropTypes.objectOf(MProps.Edge),
    usersById: PropTypes.objectOf(MProps.User),
    error: MProps.error,

    settings: PropTypes.shape({
      maxEdgeWeight: PropTypes.string.isRequired,
      edgeLength: PropTypes.string.isRequired,
    }).isRequired,
  }

  componentDidMount () {
    return loadInitialData(Router.query.graph)
  }

  render () {
    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis: Visualization</title>
        </Head>
        <Div display="flex" flexDirection="row" justifyContent="center" alignItems="center"
             height="100vh" position="relative">

          <NetworkStream
            graph={this.props.graph}
            nodesById={this.props.nodesById}
            edgesById={this.props.edgesById}
            usersById={this.props.usersById}
            settings={this.props.settings} />

          <Div
            height="100vh"
            width="300px"
            flexGrow="1"
            background="blue"
            padding="0 15px">
            <Div color="white" marginTop="15px">
              <Typography classes={{ root: whiteText.toString() }}>
                Maximum edge weight
              </Typography>
            </Div>

            <Div display="flex">
              <Div background="white" marginRight="15px">
                <Input
                  width="4em"
                  value={this.props.settings.maxEdgeWeight}
                  onChange={evt => updateSettings({ maxEdgeWeight: evt.target.value })} />
              </Div>

              <Slider
                className={style['rc-slider']}
                value={safeMax(this.props.settings.maxEdgeWeight, 0.01)}
                min={0.01}
                max={1}
                step={0.01}
                onChange={value => updateSettings({ maxEdgeWeight: value })}/>
            </Div>

            <Div color="white" marginTop="15px">
              <Typography classes={{ root: whiteText.toString() }}>
                Edge length
              </Typography>
            </Div>

            <Div display="flex">
              <Div background="white" marginRight="15px">
                <Input
                  width="4em"
                  value={this.props.settings.edgeLength}
                  onChange={evt => updateSettings({ edgeLength: evt.target.value })} />
              </Div>

              <Slider
                className={style['rc-slider']}
                value={safeMax(this.props.settings.edgeLength, 1000)}
                min={1000}
                max={40000}
                step={1000}
                onChange={value => updateSettings({ edgeLength: value })}/>
            </Div>
          </Div>
        </Div>
      </React.Fragment>
    )
  }
})

// TODO: clamp
const safeMax = (maybeInvalid, valid) => isFinite(maybeInvalid)
  ? Math.max(maybeInvalid, valid)
  : valid

const graphContainer = css(important({
  height: '100vh',
  width: 'calc(100vw - 300px)'
}))

const whiteText = css(important({
  color: '#ffffff',
}))

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
