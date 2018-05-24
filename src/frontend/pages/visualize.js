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

import glamorous, { Div } from 'glamorous'
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
import K from 'fast-keys'

import NetworkVisualization from '../NetworkVisualization'

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
        <Div display="flex" flexDirection="row" justifyContent="center" alignItems="center"
             height="100vh" position="relative">
          <NetworkVisualization />

          <Sidebar onSelectUser={() => console.log('select user')} />
        </Div>
      </React.Fragment>
    )
  }
}

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
          return user.name.toLowerCase().indexOf(userSearchTerm) !== -1
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

        <UserSearchBar
          onSelectUser={this.props.onSelectUser}
          onChangeUserSearchTerm={this.props.onChangeUserSearchTerm}
          matchingUsers={this.props.matchingUsers}
          userSearchTerm={this.props.userSearchTerm} />
      </Div>
    )
  }
}

const UserSelect = props => (
  <Div
    onMouseEnter={props.onMouseEnter}
    onMouseLeave={props.onMouseLeave}
    padding="10px" background="#FFF" borderRadius="4px">
    {props.children}
  </Div>
)
UserSelect.displayName = 'UserSelect'
UserSelect.propTypes = {
  children: PropTypes.node.isRequired,
  onMouseEnter: PropTypes.func.isRequired,
  onMouseLeave: PropTypes.func.isRequired,
}

class PUserSearchBar extends React.Component {
  render () {
    return <div>
      <SidebarTextInput
        value={this.props.userSearchTerm}
        onChange={evt => this.props.onChangeUserSearchTerm(evt.target.value)}
        onFocus={this.props.onFocusInput}
        onBlur={this.props.onBlurInput}/>

      {this.props.showUserSelect && (
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
                  css={{
                    ':hover': {
                      background: '#CCC'
                    }
                  }}>
                  {user.name}
                </Div>
              ))
          }
        </UserSelect>
      )}
    </div>
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

// TODO: clamp
const safeMax = (maybeInvalid, valid) => isFinite(maybeInvalid)
  ? Math.max(maybeInvalid, valid)
  : valid

const whiteText = css(important({
  color: '#ffffff',
}))

export default () => (
  <Provider state={state}>
    <Visualize />
  </Provider>
)

// Keep track of state between module reloads
if (module.hot) {
  module.hot.dispose(data => {
    data.state = state
    return data
  })
}
