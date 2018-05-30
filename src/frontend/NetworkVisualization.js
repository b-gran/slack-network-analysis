import './rehydrate'

import React from 'react'
import PropTypes from 'prop-types'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

import * as MProps from './props'
import { important } from './utils'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'

import { css } from 'glamor'

import { inject } from 'mobx-react'
import * as Recompose from 'recompose'
import { hasDefinedProperties } from '../utils'
import K from 'fast-keys'

const componentFromStream = Recompose.componentFromStreamWithConfig({
  fromESObservable: Rx.from,
  toESObservable: R.identity,
})

const SettingsProp = PropTypes.shape({
  maxEdgeWeight: PropTypes.number.isRequired,
  edgeLength: PropTypes.number.isRequired,
  animation: PropTypes.bool,
})

const NodePrimaryColor = '#f50057'
const NodeSecondaryColor = '#999999'

class Network extends React.Component {
  static displayName = 'Network'

  static propTypes = {
    graph: MProps.Graph.isRequired,
    nodesById: PropTypes.objectOf(MProps.Node).isRequired,
    edgesById: PropTypes.objectOf(MProps.Edge).isRequired,
    usersById: PropTypes.objectOf(MProps.User).isRequired,

    settings: SettingsProp.isRequired,

    $selectUser: PropTypes.object.isRequired,
  }

  static settingsRenderWhitelist = new Set([ 'animation' ])

  graphContainer = null
  graphVisualisation = null
  layout = null
  subscription = null

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
          userId: this.props.usersById[node.user]._id,
        },
        id: node._id,
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
        id: edge._id,
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
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': NodePrimaryColor,
          },
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

    function animateElement (element, frames) {
      return frames.reduce(
        (state, frame) => {
          return state.then(() => new Promise(resolve => {
            element.animate({
              ...frame,
              complete: (...args) => {
                frame.complete && frame.complete(...args)
                return resolve()
              }
            })
          }))
        },
        Promise.resolve()
      )
    }

    const subscription = this.props.$selectUser
      .subscribe(selectedUser => {
        // Deselect anything that's currently selected
        cyGraph.nodes().unselect()

        // Center & select the user
        const user = cyGraph.nodes(`[userId='${selectedUser._id}']`)
        cyGraph.center(user)
        user.select()

        // Flash the selected user and reset the styles when the animation finishes
        animateElement(
          user,
          [
            {
              style: {
                backgroundColor: NodeSecondaryColor,
              },
              duration: 1000
            },
            {
              style: {
                backgroundColor: NodePrimaryColor,
              },
              duration: 1000
            },
            {
              style: {
                backgroundColor: NodeSecondaryColor,
              },
              duration: 1000
            },
            {
              style: {
                backgroundColor: NodePrimaryColor,
              },
              duration: 1000
            },
          ]
        ).then(() => user.removeStyle())
      })

    return [cyGraph, layout, subscription]
  }

  componentDidMount () {
    const [ graphVisualisation, layout, subscription ] = this.renderGraph()
    this.graphVisualisation = graphVisualisation
    this.layout = layout
    this.subscription = subscription
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
      this.subscription && this.subscription.unsubscribe()
      this.layout && this.layout.stop()
      this.graphVisualisation.destroy()

      this.graphVisualisation = null
      this.subscription = null
      this.layout = null
    }

    const [ graphVisualisation, layout, subscription ] = this.renderGraph()
    this.graphVisualisation = graphVisualisation
    this.layout = layout
    this.subscription = subscription
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

  // Stream that receives an event (the selected user) whenever a user is selected
  $selectUser: PropTypes.object.isRequired,
}

const graphContainer = css(important({
  height: '100vh',
  width: 'calc(100vw - 300px)'
}))

const ConnectedNetworkStream = inject(stores => ({ ...stores.state }))(NetworkStream)
ConnectedNetworkStream.propTypes = {
  // Stream that receives an event (the selected user) whenever a user is selected
  $selectUser: PropTypes.object.isRequired,
}

export default ConnectedNetworkStream

