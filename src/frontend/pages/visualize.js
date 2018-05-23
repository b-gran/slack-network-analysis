import '../rehydrate'

import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Router from 'next/router'

import axios from 'axios'

import Typography from 'material-ui/Typography'
import Switch from 'material-ui/Switch'
import Slider from 'rc-slider'
import style from 'rc-slider/dist/rc-slider.css'

import glamorous, { Div, Input } from 'glamorous'
import { css } from 'glamor'

import { action, observable } from 'mobx'
import { inject, observer, Provider } from 'mobx-react'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

import { mergeInitialState, SERVER_URL } from '../config'
import * as MProps from '../props'
import { important} from '../utils'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'

import * as Recompose from 'recompose'
import { hasDefinedProperties } from '../../utils'
import K from 'fast-keys'

const componentFromStream = Recompose.componentFromStreamWithConfig({
  fromESObservable: Rx.from,
  toESObservable: R.identity,
})

// Graph physics plugin
cytoscape.use(cola)

// Resets
css.global('body', { margin: 0 })

const SettingsProp = PropTypes.shape({
  maxEdgeWeight: PropTypes.number.isRequired,
  edgeLength: PropTypes.number.isRequired,
  animation: PropTypes.bool,
})

const initialState = observable({
  error: undefined,
  graph: undefined,
  nodesById: undefined,
  edgesById: undefined,
  usersById: undefined,

  settings: {
    maxEdgeWeight: String(0.03),
    edgeLength: String(20000),
    animation: true,
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

    settings: SettingsProp.isRequired,
  }

  static settingsRenderWhitelist = new Set([ 'animation' ])

  graphContainer = null
  graphVisualisation = null
  layout = null

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

    const nodes = K(this.props.nodesById).map(nodeId => {
      const node = this.props.nodesById[nodeId]
      return ({
        group: 'nodes',
        data: {
          id: node._id,
          name: this.props.usersById[node.user].name,
        },
      })
    })

    const edges = K(this.props.edgesById).map(edgeId => {
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

    if (this.props.settings.animation) {
      layout.run()
    }

    return [cyGraph, layout]
  }

  componentDidMount () {
    const [ graphVisualisation, layout ] = this.renderGraph()
    this.graphVisualisation = graphVisualisation
    this.layout = layout
  }

  doesGraphNeedUpdate (prevProps) {
    return (
      this.props.edgesById !== prevProps.edgesById ||
      this.props.nodesById !== prevProps.nodesById ||
      this.props.usersById !== prevProps.usersById ||
      this.props.graph !== prevProps.graph ||
      K(this.props.settings)
        .filter(key => !Network.settingsRenderWhitelist.has(key))
        .some(key => prevProps.settings[key] !== this.props.settings[key])
    )
  }

  componentDidUpdate (prevProps) {
    if (prevProps === this.props) {
      return
    }

    // If we've only toggled the animation, we don't need to recreate the graph.
    const needsUpdate = this.doesGraphNeedUpdate(prevProps)
    const animationToggled = this.props.settings.animation !== prevProps.settings.animation
    if (!needsUpdate && animationToggled && this.graphVisualisation && this.layout) {
      return this.props.settings.animation
        ? this.layout.start()
        : this.layout.stop()
    }

    // If we didn't change any data or toggle the animation, we don't need to do anything.
    if (!needsUpdate) {
      return
    }

    if (this.graphVisualisation) {
      this.layout && this.layout.stop()
      this.graphVisualisation.destroy()
      this.graphVisualisation = null
      this.layout = null
    }

    const [ graphVisualisation, layout ] = this.renderGraph()
    this.graphVisualisation = graphVisualisation
    this.layout = layout
  }

  render () {
    return <div
      className={graphContainer.toString()}
      ref={graphContainer => this.graphContainer = graphContainer}/>
  }
}

const NetworkEmpty = () => (
  <div className={graphContainer.toString()} />
)

// Wrapper around the Network Viewer that debounces props changes and doesn't render until all
// of the graph data is available.
const NetworkStream = componentFromStream(
  $props => {
    const $needsUpdate = $props.pipe(
      operators.filter(hasDefinedProperties([ 'graph', 'nodesById', 'edgesById', 'usersById' ])),
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

    return Rx.concat(
      Rx.of(<NetworkEmpty/>),
      $needsUpdate.pipe(
        operators.map(props => <Network {...props} />)
      )
    )
  }
)
NetworkStream.displayName = 'NetworkStream'
NetworkStream.propTypes = {
  graph: MProps.Graph,
  nodesById: PropTypes.objectOf(MProps.Node),
  edgesById: PropTypes.objectOf(MProps.Edge),
  usersById: PropTypes.objectOf(MProps.User),

  // These props come as raw inputs, so they are strings instead of numbers.
  settings: PropTypes.shape({
    maxEdgeWeight: PropTypes.string.isRequired,
    edgeLength: PropTypes.string.isRequired,
    animation: PropTypes.bool,
  }).isRequired,
}

const INetworkStream = inject(stores => ({ ...stores.state }))(NetworkStream)

const Visualize = observer(class _Visualize extends React.Component {
  static displayName = 'Visualize'

  static propTypes = {
    // The the raw settings inputs (could be invalid).
    settings: PropTypes.shape({
      maxEdgeWeight: PropTypes.string.isRequired,
      edgeLength: PropTypes.string.isRequired,
      animation: PropTypes.bool,
    })
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

          <INetworkStream />

          <Sidebar onSelectUser={() => console.log('select user')} />
        </Div>
      </React.Fragment>
    )
  }
})

const Sidebar = R.pipe(
  observer,
  inject(stores => ({
    usersById: stores.state.usersById,
    settings: stores.state.settings,
  })),
)(componentFromStream(
  $props => {
    const userSearchHandler = Recompose.createEventHandler()

    return Rx.combineLatest(
      Rx.concat(
        Rx.of(''),
        userSearchHandler.stream,
      ),
      $props
    ).pipe(
      operators.map(([userSearchTerm, props]) => {
        const usersById = props.usersById || {}
        const matchingUsers = K(usersById).filter(userId => {
          const user = usersById[userId]
          return user.name.indexOf(userSearchTerm) !== -1
        }).map(userId => usersById[userId])

        const sidebarProps = {
          userSearchTerm,
          matchingUsers,
          onChangeUserSearchTerm: userSearchHandler.handler,

          ...props,
        }

        return <PSidebar {...sidebarProps} />
      })
    )
  }
))
Sidebar.displayName = 'Sidebar'
Sidebar.propTypes = {
  onSelectUser: PropTypes.func.isRequired,
}

class PSidebar extends React.Component {
  static displayName = 'PSidebar'

  static propTypes = {
    // (selectedUserId: UserId) => void
    onSelectUser: PropTypes.func.isRequired,

    userSearchTerm: PropTypes.string,
    matchingUsers: PropTypes.arrayOf(MProps.User),

    // (searchTerm: string) => void
    onChangeUserSearchTerm: PropTypes.func.isRequired,

    // These props come as raw inputs, so they are strings instead of numbers.
    settings: PropTypes.shape({
      maxEdgeWeight: PropTypes.string.isRequired,
      edgeLength: PropTypes.string.isRequired,
      animation: PropTypes.bool,
    }).isRequired,
  }

  render () {
    return (
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

        <Div display="flex" alignItems="center">
          <Div marginRight="15px">
            <SidebarTextInput
              width="4em"
              value={this.props.settings.maxEdgeWeight}
              onChange={evt => updateSettings({ maxEdgeWeight: evt.target.value })}/>
          </Div>

          <Slider
            className={style['rc-slider']}
            value={safeMax(this.props.settings.maxEdgeWeight, 0.01)}
            min={0.01}
            max={1}
            step={0.01}
            onChange={value => updateSettings({ maxEdgeWeight: String(value) })}/>
        </Div>

        <Div color="white" marginTop="15px">
          <Typography classes={{ root: whiteText.toString() }}>
            Edge length
          </Typography>
        </Div>

        <Div display="flex" alignItems="center">
          <Div marginRight="15px">
            <SidebarTextInput
              width="4em"
              value={this.props.settings.edgeLength}
              onChange={evt => updateSettings({ edgeLength: evt.target.value })}/>
          </Div>

          <Slider
            className={style['rc-slider']}
            value={safeMax(this.props.settings.edgeLength, 1000)}
            min={1000}
            max={40000}
            step={1000}
            onChange={value => updateSettings({ edgeLength: String(value) })}/>
        </Div>

        <Div display="flex">
          <Div color="white" marginTop="15px">
            <Typography classes={{ root: whiteText.toString() }}>
              Animation
            </Typography>
          </Div>

          <Switch checked={this.props.settings.animation}
                  onChange={evt => updateSettings({ animation: evt.target.checked })}/>
        </Div>

        <Div color="white" marginTop="15px">
          <Typography classes={{ root: whiteText.toString() }}>
            Users
          </Typography>
        </Div>

        <SidebarTextInput
          width="4em"
          value={this.props.userSearchTerm}
          onChange={evt => this.props.onChangeUserSearchTerm(evt.target.value)}/>
      </Div>
    )
  }
}

const SidebarTextInput = glamorous.input({
  outline: 'none',
  borderRadius: '4px',
  border: '1px solid #777',
  padding: '10px',
  ':hover': {
    border: '1px solid #333',
  },
  ':focus': {
    border: '1px solid #333',
  },
}, ({ width }) => ({ width }))

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

const WVisualize = inject(stores => ({ settings: stores.state.settings }))(Visualize)

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
