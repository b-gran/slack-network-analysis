import './rehydrate'

import React from 'react'
import PropTypes from 'prop-types'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

import { componentFromStream, important } from './utils'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'

import { css } from 'glamor'

import { inject } from 'mobx-react'
import { hasDefinedProperties } from '../utils'
import K from 'fast-keys'
import { getHumanReadableLabels, propagateLabels } from '../labelPropagation'
import * as MProps from './props'

import CyTooltipStream, { SELECT, UNSELECT } from './CyTooltipStream'
import { A, B, Div, Li, Ul } from 'glamorous'
import Popover from 'react-popover'
import Typography from '@material-ui/core/Typography'
import ZoomOutMap from '@material-ui/icons/ZoomOutMapOutlined'

import { NodePrimaryColor, NodeSecondaryColor } from './NetworkColoring'
import GraphColorerByMode from './NetworkColoring'
import { tsne } from '../vector'

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
    usersById: PropTypes.objectOf(MProps.User),

    settings: MProps.SettingsProp.isRequired,

    $resize: PropTypes.object.isRequired,
    $selectUser: PropTypes.object.isRequired,
  }

  static settingsRenderWhitelist = new Set([ 'animation' ])

  graphContainer = null
  graphVisualisation = null
  layout = null
  subscription = null
  $tooltip = Rx.EMPTY

  resizeSubscription = null

  resizeGraph () {
    this.graphVisualisation && this.graphVisualisation.resize()
  }

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

    // Generates a function to compute the degree centrality (normalized) of nodes based on edge
    // weight and degree of the node.
    const getDegreeCentrality = dataOnly.$().dcn({
      alpha: 0.5,
      weight: edge => edge.data('weight'),
    }).degree

    // Compute degree centrality for every node and store as node.data.score
    dataOnly.nodes().forEach(node => {
      const normalizedDegreeCentrality = getDegreeCentrality(node)

      // Used for sizing the node
      node.data('score', normalizedDegreeCentrality)

      node.data('normalizedDegreeCentrality', normalizedDegreeCentrality)
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

    // Assign labels (neighborhoods) to nodes
    const labels = getHumanReadableLabels(propagateLabels(cyGraph))
    cyGraph.nodes().forEach(node => {
      const label = labels.get(node.id())
      node.data('label', label)
    })

    // Apply coloring based on the current mode
    GraphColorerByMode[this.props.settings.mode]({
      labels: labels,
      cy: cyGraph,
    })

    // Start the visualization and physics sim
    const layout = cyGraph.layout(layoutParams)

    if (this.props.settings.animation) {
      layout.run()
    } else {
      tsne(cyGraph.nodes(), 50, [0, 0])
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

        const user = cyGraph.nodes(`[userId='${selectedUser._id}']`)
        const nodeBaseColor = user.style('background-color')

        // Center the viewport around the user
        cyGraph.center(user)
        user.select()

        // Trigger a tap event to show the tooltip.
        // Why not show the tooltip on select events? It's possible for the tooltip to be hidden
        // by a viewport event like zoom, but the element will still be selected.
        user.emit('tap')

        // Flash the selected user and reset the styles when the animation finishes
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

    return [cyGraph, layout, subscription, CyTooltipStream(cyGraph)]
  }

  fitGraphToCollection (collection) {
    if (!this.graphContainer || !this.graphVisualisation) {
      return
    }

    // Get the width of the container so we can zoom sensibly
    const graphContainerSize = this.graphContainer.getBoundingClientRect()
    const minSpace = Math.min(
      graphContainerSize.width,
      graphContainerSize.height
    )

    this.graphVisualisation.fit(collection, minSpace / 2.1)
  }

  componentDidMount () {
    const [ graphVisualisation, layout, subscription, $tooltip ] = this.renderGraph()
    this.graphVisualisation = graphVisualisation
    this.layout = layout
    this.subscription = subscription
    this.$tooltip = $tooltip
    this.forceUpdate()

    // The resize stream isn't dependent on a particular graph instance so doesn't
    // need to be updated when props change.
    this.resizeSubscription = this.props.$resize.subscribe(() => this.resizeGraph())
  }

  componentWillUnmount () {
    this.resizeSubscription && this.resizeSubscription.unsubscribe()
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

    const [ graphVisualisation, layout, subscription, $tooltip ] = this.renderGraph()
    this.graphVisualisation = graphVisualisation
    this.layout = layout
    this.subscription = subscription
    this.$tooltip = $tooltip
    this.forceUpdate()
  }

  render () {
    return <React.Fragment>
      <div
        className={graphContainer.toString()}
        ref={graphContainer => this.graphContainer = graphContainer}/>

      <NetworkTooltip
        $tooltip={this.$tooltip}
        onFitCollection={collection => this.fitGraphToCollection(collection)} />
    </React.Fragment>
  }
}

const PUserDataPopover = ({ node, onSelectUser, onFitCollection }) => {
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

  // We need to compute this during render because it's extremely expensive, so we can't batch
  // them all up during graph initialization.
  // TODO: memoize
  const getClosenessCentrality = node.cy().$().ccn({
    weight: edge => edge.data('weight'),
  }).closeness
  const closeness = getClosenessCentrality(node)

  return (
    <Div
      padding="10px" background="#FFF" borderRadius="4px"
      boxShadow="rgba(0, 0, 0, 0.1) 0px 4px 8px 4px, rgba(0, 0, 0, 0.5) 0px 1px 4px 0px">
      <Div display="flex" alignItems="center" justifyContent="space-between" paddingBottom="10px">
        <Typography variant="headline">
          {name}
        </Typography>
        <Div cursor="pointer" lineHeight="0">
          <ZoomOutMap onClick={() => onFitCollection(node)} />
        </Div>
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
                  <Typography>
                    <A onClick={() => onSelectUser(targetNode.data('userId'))}
                       padding="0 6px"
                       cursor="pointer"
                       textDecoration="underline">
                      { targetNode.data('name') }
                    </A>
                  </Typography>
                </Div>
                <Div minWidth="150px" display="table-cell" paddingRight="6px">
                  <Div width={getBarWidthString(edge)} height="0.5rem" background="#3f9eff" />
                </Div>
              </Li>
            ))}
          </Ul>
        </Div>
      </Div>

      <Div marginTop="10px" display="flex">
        <NetworkDataField label="Degree centrality">
          <FloatText data={node.data('normalizedDegreeCentrality')} precision={4} />
        </NetworkDataField>

        <NetworkDataField label="Closeness centrality">
          <FloatText data={closeness} precision={4} />
        </NetworkDataField>
      </Div>

      <NetworkDataField label="Label">
        <b>{ node.data('label') }</b>
      </NetworkDataField>
    </Div>
  )
}
PUserDataPopover.displayName = 'PUserDataPopover'
PUserDataPopover.propTypes = {
  node: PropTypes.object.isRequired,
  onSelectUser: PropTypes.func.isRequired,
  onFitCollection: PropTypes.func.isRequired,
}

const UserDataPopover = inject(stores => {
  const { usersById, $selectUser } = stores.state
  return {
    onSelectUser: userId => $selectUser.next(usersById[userId])
  }
})(PUserDataPopover)
UserDataPopover.displayName = 'UserDataPopover'
UserDataPopover.propTypes = {
  node: PropTypes.object.isRequired,
  onFitCollection: PropTypes.func.isRequired,
}

const NetworkDataField = ({ label, children }) => (
  <Div border="1px solid #aaa" padding="3px 6px" flexGrow="1">
    <Typography variant="subheading">{ label }</Typography>
    <Typography>{ children }</Typography>
  </Div>
)
NetworkDataField.displayName = 'NetworkDataField'
NetworkDataField.propTypes = {
  label: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired,
}

const FloatText = ({ data, precision }) => !R.isNil(precision) ?
  <B title={data} borderBottom="1px dashed #aaa">
    { data.toFixed(precision) }
  </B> :
  <B>{ data }</B>
FloatText.displayName = 'FloatText'
FloatText.propTypes = {
  data: PropTypes.number.isRequired,

  // Optional: number of digits of float precision
  precision: PropTypes.number,
}

const safeTooltipX = R.path([ 'position', 'x' ])
const safeTooltipY = R.path([ 'position', 'y' ])
const emptyContent = { position: null }

const NetworkTooltip = componentFromStream(
  $props => {
    const $content = $props.pipe(
      // Flatten the latest $tooltip stream from the props.
      operators.map(R.prop('$tooltip')),
      operators.switchAll(),

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

    return Rx.combineLatest($content, $props).pipe(
      operators.map(([[lastEvent, currentEvent], { onFitCollection }]) => {
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
          body={<UserDataPopover node={node} onFitCollection={onFitCollection} />}>
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
  onFitCollection: PropTypes.func.isRequired,
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
      operators.debounceTime(500)
    )

    const $resize = $props.pipe(
      operators.map(props => props.bottomBarHeightPx),
      operators.distinctUntilChanged()
    )

    return Rx.concat(
      Rx.of(<NetworkEmpty/>),
      $needsUpdate.pipe(
        operators.map(props => <Network {...props} $resize={$resize} />)
      )
    )
  }
)
NetworkStream.displayName = 'NetworkStream'
NetworkStream.propTypes = {
  nodes: PropTypes.arrayOf(CygraphNode),
  edges: PropTypes.arrayOf(CygraphEdge),
  usersById: PropTypes.objectOf(MProps.User),
  settings: MProps.SettingsProp.isRequired,
  bottomBarHeightPx: PropTypes.number.isRequired,

  // Stream that receives an event (the selected user) whenever a user is selected
  $selectUser: PropTypes.object.isRequired,
}

const graphContainer = css(important({
  width: 'calc(100vw - 300px)'
}))

const ConnectedNetworkStream = inject(stores => ({
  ...stores.state,

  // Derived values need to be explicitly accessed
  nodes: stores.state.nodes,
  edges: stores.state.edges,
}))(NetworkStream)
ConnectedNetworkStream.displayName = 'ConnectedNetworkStream'

export default ConnectedNetworkStream

