import './rehydrate'

import React from 'react'
import PropTypes from 'prop-types'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

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

import CyTooltipStream, { SELECT, UNSELECT } from './CyTooltipStream'
import { Div, Li, Span, Ul } from 'glamorous'
import Popover from 'react-popover'
import Typography from 'material-ui/Typography'

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
          content: node => node.data('name'),
          'font-size': '20px',
          'text-background-color': '#fff',
          'text-background-opacity': '0.5',
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
    // TODO: this might be leaking memory on every render
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

const PUserDataPopover = ({ node }) => {
  const name = node.data('name')

  const connections = node.neighborhood().edges().map(edge => {
    const targetNode = edge.target().data('id') === node.data('id')
      ? edge.source()
      : edge.target()

    return [ targetNode, edge ]
  })

  const sortedConnections = R.sortBy(([, edge]) => parseFloat(edge.data('weight')), connections)
  const minWeight = parseFloat(sortedConnections[0][1].data('weight'))

  const getBarWidthString = edge => `${(minWeight / parseFloat(edge.data('weight'))) * 100}%`

  return (
    <Div
      padding="10px" background="#FFF" borderRadius="4px"
      boxShadow="rgba(0, 0, 0, 0.1) 0px 4px 8px 4px, rgba(0, 0, 0, 0.5) 0px 1px 4px 0px">
      <Div textAlign="center" paddingBottom="10px">
        <Typography variant="headline">{name}</Typography>
      </Div>
      <Div border="1px solid #aaa">
        <Div borderBottom="1px solid #aaa" padding="3px 6px">
          <Typography variant="subheading">Connections ({connections.length})</Typography>
        </Div>

        <Div maxHeight="200px" overflow="scroll">
          <Ul listStyle="none" padding="0" margin="0" display="table">
            {sortedConnections.map(([ targetNode, edge ]) => (
              <Li key={targetNode.data('name')} display="table-row">
                <Div display="table-cell" padding="5px 0">
                  <Typography><Span padding="0 6px">{ targetNode.data('name') }</Span></Typography>
                </Div>
                <Div minWidth="150px" display="table-cell" paddingRight="6px">
                  <Div width={getBarWidthString(edge)} height="0.5rem" background="#3f9eff" />
                </Div>
              </Li>
            ))}
          </Ul>
        </Div>
      </Div>
    </Div>
  )
}
PUserDataPopover.displayName = 'PUserDataPopover'
PUserDataPopover.propTypes = {
  node: PropTypes.object.isRequired,
}

const UserDataPopover = PUserDataPopover

const safeTooltipX = R.path([ 'position', 'x' ])
const safeTooltipY = R.path([ 'position', 'y' ])
const emptyContent = { position: null }

const NetworkTooltip = componentFromStream(
  $props => {
    const $content = $props.pipe(
      // Flatten the latest $tooltip stream from the props.
      operators.map(R.prop('$tooltip')),
      operators.mergeAll(),

      // Keep track of the 2 most recent events.
      operators.scan(([grandparentContent, parentContent], currentEvent) => {
        if (R.prop('type', currentEvent) === SELECT) {
          return [ parentContent, {
            event: currentEvent,
            position: <Div
              position="absolute"
              top={safeTooltipY(currentEvent)}
              left={safeTooltipX(currentEvent)}
              width="1px"
              height="1px"/>,
          }]
        }

        return [ parentContent, {
          event: currentEvent,
          position: <Div
            position="absolute"
            top={0}
            left={0}
            width="1px"
            height="1px"/>,
        }]
      }, [emptyContent, emptyContent])
    )

    return $content.pipe(
      operators.map(([lastEvent, currentEvent]) => {
        const isEmptyEvent = R.pipe(
          R.path(['event', 'type']),
          R.anyPass([ R.isNil, R.equals(UNSELECT) ])
        )
        const isEmptyClick = isEmptyEvent(currentEvent) && isEmptyEvent(lastEvent)
        if (isEmptyClick) {
          return Rx.of(null)
        }

        // If we need to close the popover, we use the content from the previous event
        // so that the close animation looks right.
        const open = currentEvent.event.type === SELECT
        const node = open ? currentEvent.event.node : lastEvent.event.node

        const popover = <Popover
          isOpen={open}
          place="below"
          body={<UserDataPopover node={node} />}>
          {currentEvent.position}
        </Popover>

        // If we're moving the tooltip between nodes, we need to hide it first to trigger
        // the animations for the new tooltip.
        // Otherwise there's a really ugly flash during the content change.
        const isCurrentlyRendered = (
          R.path(['event', 'type'], lastEvent) === SELECT &&
          R.path(['event', 'type'], currentEvent) === SELECT
        )
        if (isCurrentlyRendered) {
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

