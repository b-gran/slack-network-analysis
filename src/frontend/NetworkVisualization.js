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
import { propagateLabels } from '../labelPropagation'

import CyTooltipStream, { SELECT } from './CyTooltipStream'
import { Div } from 'glamorous'
import Popover from 'react-popover'

const componentFromStream = Recompose.componentFromStreamWithConfig({
  fromESObservable: Rx.from,
  toESObservable: R.identity,
})

const SettingsProp = PropTypes.shape({
  maxEdgeWeight: PropTypes.number.isRequired,
  edgeLength: PropTypes.number.isRequired,
  animation: PropTypes.bool,
})

function toHex (n) {
  const string = n.toString(16)
  return Array(6 - string.length).fill('0').join('') + string
}

function gradient (x) {
  return (0xFFFFFF * x) | 0
}

function getGradientGenerator () {
  const offset = Math.random()
  return i => toHex(gradient(( (offset + (0.618033988749895 * i)) % 1)))
}

function getColorsForLabels (labelsByNodeId) {
  const getColor = getGradientGenerator()

  const colorsByLabel = new Map()
  const labelValues = Array.from(labelsByNodeId.values())
  for (let i = 0; i < labelValues.length; i++) {
    const label = labelValues[i]
    colorsByLabel.set(label, getColor(i))
  }

  return colorsByLabel
}

const NodePrimaryColor = '#f50057'
const NodeSecondaryColor = '#999999'

const CygraphNode = PropTypes.shape({
  group: PropTypes.oneOf(['nodes']).isRequired,
  data: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    userId: PropTypes.string.isRequired,
  }).isRequired,
})

const CygraphEdge = PropTypes.shape({
  group: PropTypes.oneOf(['edges']).isRequired,
  data: PropTypes.shape({
    id: PropTypes.string.isRequired,
    source: PropTypes.string.isRequired,
    target: PropTypes.string.isRequired,
    weight: PropTypes.number.isRequired,
  }).isRequired,
})

class Network extends React.Component {
  static displayName = 'Network'

  static propTypes = {
    nodes: PropTypes.arrayOf(CygraphNode).isRequired,
    edges: PropTypes.arrayOf(CygraphEdge).isRequired,

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

    // Just for doing calculations on the data.
    const data = [...this.props.nodes, ...this.props.edges]
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
      elements: [ ...this.props.nodes, ...this.props.edges ],
    })

    // Prune the graph
    const nodesWithoutEdges = cyGraph.nodes().filter(node => {
      const edges = node.connectedEdges()
      return edges.length === 0
    })
    nodesWithoutEdges.remove()

    // NEIGHBORHOOD DETECTION

    // Generate labels and colors
    const labels = propagateLabels(cyGraph)
    const colorsByLabel = getColorsForLabels(labels)

    // Generate selectors for each label
    const selectors = Array.from(colorsByLabel.entries()).map(([label, color]) => ({
      selector: `node[label = "${label}"]`,
      style: {
        'background-color': `#${color}`,
      },
    }))

    // Assign labels
    cyGraph.nodes().forEach(node => {
      const label = labels.get(node.id())
      node.data('label', label)
    })

    // Apply generated style with label selectors
    cyGraph.style([
      {
        selector: 'node',
        style: {
          "width": "mapData(score, 0, 1, 20, 60)",
          "height": "mapData(score, 0, 1, 20, 60)",
          content: node => `${node.data('name')} (${node.data('score')})`,
          'font-size': '20px',
        },
      },
      ...selectors,
      {
        selector: 'node:selected',
        style: {
          'background-color': NodePrimaryColor,
        },
      },
    ])

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
        const nodeBaseColor = `#${colorsByLabel.get(user.data('label'))}`
        animateElement(
          user,
          [
            {
              style: {
                backgroundColor: nodeBaseColor,
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
                backgroundColor: nodeBaseColor,
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
    this.forceUpdate()
  }

  doesGraphNeedUpdate (prevProps) {
    return (
      this.props.nodes !== prevProps.nodes ||
      this.props.edges !== prevProps.edges ||
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
    this.forceUpdate()
  }

  render () {
    const tooltipStream = this.graphVisualisation
      ? CyTooltipStream(this.graphVisualisation)
      : Rx.EMPTY
    return <React.Fragment>
      <div
        className={graphContainer.toString()}
        ref={graphContainer => this.graphContainer = graphContainer}/>

      <NetworkTooltip $tooltip={tooltipStream} />
    </React.Fragment>
  }
}

const UserDataPopover = props => (
  <Div
    padding="10px" background="#FFF" borderRadius="4px"
    boxShadow="rgba(0, 0, 0, 0.1) 0px 4px 8px 4px, rgba(0, 0, 0, 0.5) 0px 1px 4px 0px">
    {props.children}
  </Div>
)
UserDataPopover.displayName = 'UserDataPopover'
UserDataPopover.propTypes = {
  children: PropTypes.node,
}

const safeTooltipX = R.path([ 'position', 'x' ])
const safeTooltipY = R.path([ 'position', 'y' ])

const firstDefined = (...maybeDefined) => maybeDefined.reduce(
  (definedEl, el) => (R.isNil(definedEl) && !R.isNil(el))
    ? el
    : definedEl,
  undefined
)

const NetworkTooltip = componentFromStream(
  $props => {
    return $props.pipe(
      // Flatten the latest $tooltip stream from the props.
      operators.map(R.prop('$tooltip')),
      operators.mergeAll(1),

      // Keep track of the 2 most recent events.
      operators.scan(([grandparent, parent], currentEvent) => [parent, currentEvent], [null, null]),

      operators.map(([lastEvent, tooltipEvent]) => {
        if (!tooltipEvent) {
          return null
        }

        const open = tooltipEvent.type === SELECT

        const top = firstDefined(
          safeTooltipY(tooltipEvent),
          safeTooltipY(lastEvent),
          0
        )

        const left = firstDefined(
          safeTooltipX(tooltipEvent),
          safeTooltipX(lastEvent),
          0
        )

        const lastData = (lastEvent && lastEvent.node.data) && lastEvent.node.data('name')

        const content = open
          ? <div>{ tooltipEvent.node.data('name') }</div>
          : <div>{ lastData }</div>

        const popover = <Popover
          isOpen={open}
          place="below"
          body={<UserDataPopover>{ content }</UserDataPopover>}>
          <Div
            position="absolute"
            top={top}
            left={left}
            width="1px"
            height="1px"/>
        </Popover>

        const reposition = (
          R.prop('type', lastEvent) === SELECT &&
          R.prop('type', tooltipEvent) === SELECT
        )

        // If we're moving the tooltip between nodes, we need to hide it first to trigger
        // the animations for the new and current tooltip.
        // Otherwise there's a really ugly flash of content change.
        if (reposition) {
          return Rx.concat(
            Rx.of(null),
            Rx.of(popover)
          )
        }

        return Rx.of(popover)
      }),
      operators.mergeAll()
    )
  }
)
NetworkTooltip.propTypes = {
  // Stream of tooltip events from a CyTooltipStream
  $tooltip: PropTypes.object.isRequired,
}

const NetworkEmpty = () => (
  <div className={graphContainer.toString()} />
)

// Wrapper around the Network Viewer that debounces props changes and doesn't render until all
// of the graph data is available.
const NetworkStream = componentFromStream(
  $props => {
    const $needsUpdate = $props.pipe(
      // Only update the graph when we have nodes and edges
      operators.filter(hasDefinedProperties([ 'nodes', 'edges' ])),

      // Only update the graph when we have valid settings
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
  nodes: PropTypes.arrayOf(CygraphNode),
  edges: PropTypes.arrayOf(CygraphEdge),

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

const ConnectedNetworkStream = inject(stores => ({
  ...stores.state,

  // Derived values need to be explicitly accessed
  nodes: stores.state.nodes,
  edges: stores.state.edges,
}))(NetworkStream)
ConnectedNetworkStream.propTypes = {
  // Stream that receives an event (the selected user) whenever a user is selected
  $selectUser: PropTypes.object.isRequired,
}

export default ConnectedNetworkStream

