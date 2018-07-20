import '../rehydrate'

import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Router from 'next/router'

import axios from 'axios'

import Typography from '@material-ui/core/Typography'
import Switch from '@material-ui/core/Switch'
import Popover from 'react-popover'
import Slider from 'rc-slider'
import style from 'rc-slider/dist/rc-slider.css'
import Select from '@material-ui/core/Select'
import MenuItem from '@material-ui/core/MenuItem'
import GPSFixed from '@material-ui/icons/GpsFixed'

import glamorous, { Div } from 'glamorous'
import { css } from 'glamor'

import { action, reaction, observe } from 'mobx'
import { inject, observer, Provider } from 'mobx-react'

import cytoscape from 'cytoscape'
import cola from 'cytoscape-cola'

import { mobxHmrObservable, SERVER_URL } from '../config'
import * as MProps from '../props'
import { important, componentFromStream } from '../utils'
import { ColorMode, SizeMode, ViewMode } from '../NetworkSettings'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'

import * as Recompose from 'recompose'
import K from 'fast-keys'

import NetworkVisualization from '../NetworkVisualization'
import NodeView from '../NodeView'

// Graph physics plugin
cytoscape.use(cola)

// Resets
css.global('body', { margin: 0 })

// Style tooltips (have a static css class)
css.global('.Popover-tipShape', {
  fill: '#FFFFFF'
})

const DEFAULT_BOTTOM_BAR_HEIGHT_PX = typeof window === 'object' && window.innerHeight
  ? ((window.innerHeight * 0.1) | 0)
  : 200

const DEFAULT_SETTINGS = {
  maxEdgeWeight: 0.6,
  edgeLength: 2000,
  animation: false,

  mode: ViewMode.label,

  color: ColorMode.label,
  size: SizeMode.degreeCentrality,
}
const validateSettingsAgainstDefault = R.where(
  R.map(R.always(R.complement(R.isNil)), DEFAULT_SETTINGS),
)

const loadInitialData = action(graphId => {
  // Load settings in here so that the server and client both do an initial render
  // with the default settings.
  state.settings = loadSettingsFromLocalStorage() || state.settings
  return axios.get(`${SERVER_URL}/graphs/${graphId}`)
    .then(res => {
      const { graph, nodes, edges, users } = res.data
      state.graph = graph
      state.nodesById = nodes
      state.edgesById = edges
      state.usersById = users
    }).catch(err => state.error = err)
})

const updateSettings = action(partialSettingsUpdate =>
  state.settings = R.merge(
    state.settings,
    partialSettingsUpdate
  )
)

function getSettingsStream (mobxState) {
  return new Rx.Observable(observer => {
    reaction(
      () => mobxState.settings,
      settings => observer.next(settings),
    )
    return () => {}
  })
}

// Given a mobx observable, return an Rx.Observable that emits an event each time the
// mobx observable is changed.
// The event values are the current value of the observable
function getMobxUpdateStream (mobxObservable, property) {
  return new Rx.Observable(observer => {
    const dispose = R.isNil(property)
      ? observe(mobxObservable, update => observer.next(update.object))
      : observe(mobxObservable, property, update => observer.next(update.object))
    return () => dispose()
  })
}

const LOCAL_STORAGE_ENABLED = typeof localStorage === 'object'
const LOCAL_STORAGE_SETTINGS_KEY = 'LOCAL_STORAGE_SETTINGS_KEY'
function Effect_SerialiseSettingsToLocalStorage ($settings) {
  if (!LOCAL_STORAGE_ENABLED) {
    return
  }

  return $settings.subscribe(settings => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings))
    } catch (err) {
      console.warn('Unable to serialise settings', settings)
    }
  })
}

function loadSettingsFromLocalStorage (isValidSettings = validateSettingsAgainstDefault) {
  if (!LOCAL_STORAGE_ENABLED) {
    return undefined
  }

  const storedSettings = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY)
  if (storedSettings === null) {
    return undefined
  }

  try {
    const settings = JSON.parse(storedSettings)
    return isValidSettings(settings) ? settings : undefined
  } catch (err) {
    console.warn('Unable to load settings from local storage', err)
    return undefined
  }
}

// TODO: fucks up navigation because the module gets cached and this variable isn't re-evaluated
// on subsequent page loads.
const state = mobxHmrObservable(module)({
  error: undefined,
  graph: undefined,
  nodesById: undefined,
  edgesById: undefined,
  usersById: undefined,

  settings: DEFAULT_SETTINGS,
  bottomBarHeightPx: DEFAULT_BOTTOM_BAR_HEIGHT_PX,

  $selectUser: new Rx.Subject(),

  get nodes () {
    if (!this.nodesById || !this.usersById) {
      return undefined
    }

    return K(this.nodesById).map(nodeId => {
      const node = this.nodesById[nodeId]
      return ({
        group: 'nodes',
        data: {
          id: node._id,
          name: this.usersById[node.user].name,
          userId: this.usersById[node.user]._id,
        },
        id: node._id,
      })
    })
  },

  // Just a wrapper around settings.maxEdgeWeight so that changes to settings
  // don't trigger a re-render for edges & its dependents
  get maxEdgeWeight () {
    return this.settings.maxEdgeWeight
  },

  get edges () {
    if (!this.edgesById) {
      return undefined
    }

    const parsedMaxEdgeWeight = parseFloat(this.maxEdgeWeight)
    const filterEdge = isNaN(parsedMaxEdgeWeight) ?
      // Don't filter edges if we don't have a real edge weight
      R.T :

      // Only allow edges less than the edge weight in settings
      R.pipe(
        R.path([ 'data', 'weight' ]),
        R.gt(parsedMaxEdgeWeight)
      )

    return K(this.edgesById).map(edgeId => {
      const edge = this.edgesById[edgeId]
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
    }).filter(filterEdge)
  },

  // TODO: attach the node to the user
  get visibleUsers () {
    if (!this.usersById || !this.visibleNodes) {
      return undefined
    }

    return this.visibleNodes.map(node => this.usersById[node.data('userId')])
  },

  // TODO: attach the node to the user
  get visibleNodes () {
    if (!this.usersById || !this.nodes || !this.edges) {
      return undefined
    }

    const cy = cytoscape({
      headless: true,
      elements: [ ...this.nodes, ...this.edges ]
    })

    // Remove nodes without edges.
    // Why do this? If the cardinality of the graph is large, the normalized centrality
    // algorithms are _extremely_ slow. Since we don't care about these nodes anyway if we're
    // working with the visible nodes, we can substantially improve the performance by just
    // removing them to reduce the cardinality.
    cy.nodes().filter(node => {
      const edges = node.connectedEdges()
      return edges.length === 0
    }).remove()

    return cy.nodes().toArray()
  },
})

const $settings = getMobxUpdateStream(state, 'settings')
Effect_SerialiseSettingsToLocalStorage($settings)

class Visualize extends React.Component {
  static displayName = 'Visualize'

  componentDidMount () {
    return loadInitialData(Router.query.graph)
  }

  render () {
    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis: Visualization</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="stretch" alignItems="center"
             height="100vh" position="relative">
          <Div display="flex" flexDirection="row" justifyContent="center" alignItems="stretch"
               flexGrow="1" position="relative">
            <NetworkVisualization />
            <Sidebar />
          </Div>
          <NodeView />
        </Div>
      </React.Fragment>
    )
  }
}

const op_toString = operators.map(String)
const op_isNonEmptyFloatString = operators.filter(R.allPass([ isFinite, R.complement(R.isEmpty) ]))

// Given a canonical numeric value and a possibly non-numeric input value, returns the
// most recent value of either stream. Prefers the input value to the canonical value
// if the input is numeric and equal to the canonical value.
function latestNumericInput ($canonicalNumericValue, $inputValue) {
  const $initialNumericValue = $canonicalNumericValue.pipe(operators.take(1))
  const $safeInput = Rx.concat($initialNumericValue, $inputValue)
  const $distinctNumericValue = $canonicalNumericValue.pipe(operators.distinctUntilChanged())
  return Rx.merge($distinctNumericValue, $safeInput).pipe(
    operators.withLatestFrom($distinctNumericValue, $safeInput),
    operators.map(([latest, latestSetting, latestInput]) =>
      isFinite(latestInput) && (parseFloat(latestInput) === latestSetting)
        ? latestInput
        : latest
    )
  )
}

const Sidebar = R.pipe(
  observer,
  inject(stores => ({
    usersById: stores.state.usersById,
    visibleUsers: stores.state.visibleUsers,
    settings: stores.state.settings,
    onSelectUser: user => stores.state.$selectUser.next(user),
  })),
)(componentFromStream(
  $props => {
    const userSearchHandler = Recompose.createEventHandler()
    const maxEdgeWeightHandler = Recompose.createEventHandler()
    const edgeLengthHandler = Recompose.createEventHandler()

    const $maxEdgeWeight = $props.pipe(operators.map(R.path(['settings', 'maxEdgeWeight'])))
    const $edgeLength = $props.pipe(operators.map(R.path(['settings', 'edgeLength'])))

    const $setValidFloatEdgeWeight = Rx.from(maxEdgeWeightHandler.stream).pipe(op_isNonEmptyFloatString)
    const $setValidFloatEdgeLength = Rx.from(edgeLengthHandler.stream).pipe(op_isNonEmptyFloatString)

    const $latestEdgeWeight = latestNumericInput($maxEdgeWeight, maxEdgeWeightHandler.stream)
    const $latestEdgeLength = latestNumericInput($edgeLength, edgeLengthHandler.stream)

    //= Effects ==================
    $setValidFloatEdgeWeight.subscribe(edgeWeight => updateSettings({
      maxEdgeWeight: parseFloat(edgeWeight)
    }))

    $setValidFloatEdgeLength.subscribe(edgeLength => updateSettings({
      edgeLength: parseFloat(edgeLength)
    }))
    //============================

    return Rx.combineLatest(
      $props,
      Rx.concat(Rx.of(''), userSearchHandler.stream),
      $latestEdgeWeight.pipe(op_toString),
      $latestEdgeLength.pipe(op_toString),
    ).pipe(
      operators.map(([props, userSearchTerm, maxEdgeWeight, edgeLength]) => {
        const visibleUsers = props.visibleUsers || []
        const matchingUsers = visibleUsers.filter(user => {
          return user.name.toLowerCase().indexOf(userSearchTerm) !== -1
        })

        return <PSidebar
          {...props}
          userSearchTerm={userSearchTerm}
          matchingUsers={matchingUsers}
          onChangeUserSearchTerm={userSearchHandler.handler}
          inputs={{
            maxEdgeWeight: maxEdgeWeight,
            edgeLength: edgeLength,
          }}
          onChangeMaxEdgeWeight={maxEdgeWeightHandler.handler}
          onChangeEdgeLength={edgeLengthHandler.handler} />
      })
    )
  }
))
Sidebar.displayName = 'Sidebar'

const SidebarLabel = ({ children }) => (
  <Typography classes={{ root: sidebarLabel.toString() }}>
    { children }
  </Typography>
)
SidebarLabel.displayName = 'SidebarLabel'
SidebarLabel.propTypes = {
  children: PropTypes.node,
}

const sidebarLabel = css(important({
  color: '#ffffff',
  padding: '0.5rem 0',
  display: 'flex',
  alignItems: 'center',
}))

class PSidebar extends React.Component {
  static displayName = 'PSidebar'

  static propTypes = {
    // (selectedUserId: UserId) => void
    onSelectUser: PropTypes.func.isRequired,

    userSearchTerm: PropTypes.string,
    matchingUsers: PropTypes.arrayOf(MProps.User),

    // (searchTerm: string) => void
    onChangeUserSearchTerm: PropTypes.func.isRequired,

    inputs: PropTypes.shape({
      maxEdgeWeight: PropTypes.string.isRequired,
      edgeLength: PropTypes.string.isRequired,
    }).isRequired,

    onChangeMaxEdgeWeight: PropTypes.func.isRequired,
    onChangeEdgeLength: PropTypes.func.isRequired,

    settings: MProps.SettingsProp.isRequired,
  }

  render () {
    return (
      <Div
        width="300px"
        flexGrow="1"
        background="linear-gradient(0deg, rgba(64,73,166,1) 0%, rgba(82,95,218,1) 100%)"
        boxShadow="4px 0px 20px 1px">
        <Div padding="0 15px">
          <Div marginTop="15px">
            <SidebarLabel>Maximum edge weight</SidebarLabel>
            <Div display="flex" alignItems="center">
              <Div marginRight="15px">
                <SidebarTextInput
                  width="4em"
                  value={this.props.inputs.maxEdgeWeight}
                  onChange={evt => this.props.onChangeMaxEdgeWeight(evt.target.value)}/>
              </Div>

              <Slider
                className={style['rc-slider']}
                value={R.clamp(0.01, 1, this.props.settings.maxEdgeWeight)}
                min={0.01}
                max={1}
                step={0.01}
                onChange={this.props.onChangeMaxEdgeWeight}/>
            </Div>
          </Div>

          <Div marginTop="15px">
            <SidebarLabel>Edge length</SidebarLabel>
            <Div display="flex" alignItems="center">
              <Div marginRight="15px">
                <SidebarTextInput
                  width="4em"
                  value={this.props.inputs.edgeLength}
                  onChange={evt => this.props.onChangeEdgeLength(evt.target.value)}/>
              </Div>

              <Slider
                className={style['rc-slider']}
                value={R.clamp(1000, 40000, this.props.settings.edgeLength)}
                min={1000}
                max={40000}
                step={1000}
                onChange={this.props.onChangeEdgeLength}/>
            </Div>
          </Div>

          <Div marginTop="15px">
            <Div display="flex" alignItems="center">
              <SidebarLabel>Animation</SidebarLabel>
              <Switch checked={this.props.settings.animation}
                      onChange={evt => updateSettings({ animation: evt.target.checked })}/>
            </Div>
          </Div>

          <Div marginTop="15px">
            <SidebarLabel>
              <GPSFixed />
              People
            </SidebarLabel>
            <UserSearchBar
              onSelectUser={this.props.onSelectUser}
              onChangeUserSearchTerm={this.props.onChangeUserSearchTerm}
              matchingUsers={this.props.matchingUsers}
              userSearchTerm={this.props.userSearchTerm} />
          </Div>

          <Div marginTop="15px">
            <SidebarLabel>Mode</SidebarLabel>
            <Div background="#ffffff" padding="10px" borderRadius="4px" display="inline">
              <Select
                value={this.props.settings.mode}
                onChange={evt => updateSettings({ mode: evt.target.value })}>
                <MenuItem value={ViewMode.label}>Label</MenuItem>
                <MenuItem value={ViewMode.center}>Center</MenuItem>
                <MenuItem value={ViewMode.periphery}>Periphery</MenuItem>
              </Select>
            </Div>
          </Div>
        </Div>
      </Div>
    )
  }
}

const UserSelect = props => (
  <Div
    onMouseEnter={props.onMouseEnter}
    onMouseLeave={props.onMouseLeave}
    padding="10px" background="#FFF" borderRadius="4px"
    width="15em"
    maxHeight="200px"
    overflow="scroll"
    boxShadow="rgba(0, 0, 0, 0.1) 0px 4px 8px 4px, rgba(0, 0, 0, 0.5) 0px 1px 4px 0px">
    {props.children}
  </Div>
)
UserSelect.displayName = 'UserSelect'
UserSelect.propTypes = {
  children: PropTypes.node.isRequired,
  onMouseEnter: PropTypes.func.isRequired,
  onMouseLeave: PropTypes.func.isRequired,
}

// Needed to avoid rendering components for the initial client side render.
class Mounted extends React.Component {
  static displayName = 'Mounted'
  static propTypes = {
    children: PropTypes.node,
    initial: PropTypes.node,
  }

  state = {
    mounted: false
  }

  componentDidMount () {
    this.setState({ mounted: true })
  }

  render () {
    if (!this.state.mounted) {
      return this.props.initial
    }

    return this.props.children
  }
}

class PUserSearchBar extends React.Component {
  render () {
    const userSelectPopover =  (
      <UserSelect
        onMouseEnter={this.props.onEnterUserSelect}
        onMouseLeave={this.props.onLeaveUserSelect}>
        {
          R.isEmpty(this.props.matchingUsers) ?
            <div>No matching users</div> :
            this.props.matchingUsers.map(user => (
              <Div
                key={user.user_id}
                padding="3px 6px"
                cursor="pointer"
                css={{
                  ':hover': {
                    background: '#CCC'
                  }
                }}
                onClick={() => this.props.onSelectUser(user)} >
                {user.name}
              </Div>
            ))
        }
      </UserSelect>
    )

    const textInput = <SidebarTextInput
      width="12em"
      value={this.props.userSearchTerm}
      onChange={evt => this.props.onChangeUserSearchTerm(evt.target.value)}
      onFocus={this.props.onFocusInput}
      onBlur={this.props.onBlurInput}/>

    return <Mounted initial={textInput}>
      <Popover
        isOpen={this.props.showUserSelect}
        onOuterAction={this.props.onLeaveUserSelect}
        place="below"
        body={userSelectPopover}>
        { textInput }
      </Popover>
    </Mounted>
  }
}

PUserSearchBar.displayName = 'PUserSearchBar'
PUserSearchBar.propTypes = {
  // (selectedUserId: UserId) => void
  onSelectUser: PropTypes.func.isRequired,

  userSearchTerm: PropTypes.string,
  matchingUsers: PropTypes.arrayOf(MProps.User),
  onChangeUserSearchTerm: PropTypes.func.isRequired,

  onFocusInput: PropTypes.func.isRequired,
  onBlurInput: PropTypes.func.isRequired,

  onEnterUserSelect: PropTypes.func.isRequired,
  onLeaveUserSelect: PropTypes.func.isRequired,

  showUserSelect: PropTypes.bool,
}

// Given a "true" stream and a "false" stream, returns a new stream whose latest
// value is a boolean with the result of the most recent input stream.
function mergeBooleanStreams (trueStream, falseStream, initialValue = false) {
  return Rx.concat(
    Rx.of(initialValue),
    Rx.merge(
      Rx.from(trueStream).pipe(operators.mapTo(true)),
      Rx.from(falseStream).pipe(operators.mapTo(false)),
    )
  )
}

const UserSearchBar = componentFromStream(
  $props => {
    const focusHandler = Recompose.createEventHandler()
    const blurHandler = Recompose.createEventHandler()

    const userSelectEnterHandler = Recompose.createEventHandler()
    const userSelectLeaveHandler = Recompose.createEventHandler()

    return Rx.combineLatest(
      mergeBooleanStreams(focusHandler.stream, blurHandler.stream),
      mergeBooleanStreams(userSelectEnterHandler.stream, userSelectLeaveHandler.stream),
      $props
    ).pipe(operators.map(([ isInputFocused, isSelectHovered, props ]) => {
      return (
        <PUserSearchBar
          {...props}
          showUserSelect={isInputFocused || isSelectHovered}
          onFocusInput={focusHandler.handler}
          onBlurInput={blurHandler.handler}
          onEnterUserSelect={userSelectEnterHandler.handler}
          onLeaveUserSelect={userSelectLeaveHandler.handler} />
      )
    }))
  }
)
UserSearchBar.displayName = 'UserSearchBar'
UserSearchBar.propTypes = {
  // (selectedUserId: UserId) => void
  onSelectUser: PropTypes.func.isRequired,

  userSearchTerm: PropTypes.string,
  matchingUsers: PropTypes.arrayOf(MProps.User),
  onChangeUserSearchTerm: PropTypes.func.isRequired,
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

export default () => (
  <Provider state={state}>
    <Visualize />
  </Provider>
)
