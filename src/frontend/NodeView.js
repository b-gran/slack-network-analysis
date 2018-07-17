import React from 'react'
import PropTypes from 'prop-types'

import { action } from 'mobx'
import { inject } from 'mobx-react'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'
import * as Recompose from 'recompose'

import { css } from 'glamor'
import glamorous, { Div } from 'glamorous'

import Typography from 'material-ui/Typography'
import Sort from '@material-ui/icons/Sort'

import * as MProps from './props'
import { componentFromStream, important } from './utils'
import { hasDefinedProperties } from '../utils'
import { centralityFactory } from './centrality'

// HACK: temporary until the state is refactored into a separate module
const getBottomBarHeightSetterAction = store => action(
  bottomBarHeightPx => store.bottomBarHeightPx = bottomBarHeightPx
)

function getDOMElementHeight (dom) {
  return dom.getBoundingClientRect().height
}

const SortMode = {
  name: 'name',
  weightedCentrality: 'weightedCentrality',
}

class NodeView extends React.Component {
  static propTypes = {
    visibleUsers: PropTypes.arrayOf(MProps.User).isRequired,
    visibleNodes: PropTypes.arrayOf(MProps.Node).isRequired,
    settings: MProps.SettingsProp.isRequired,
    bottomBarHeightPx: PropTypes.number.isRequired,

    onSetBottomBarHeightPx: PropTypes.func.isRequired,

    onChangeSortMode: PropTypes.func.isRequired,
    sortMode: PropTypes.oneOf(Object.keys(SortMode)).isRequired,

    onSelectUser: PropTypes.func.isRequired,

    userSearchTerm: PropTypes.string.isRequired,
    onChangeUserSearchTerm: PropTypes.func.isRequired,
  }

  clickResize = Recompose.createEventHandler()
  subscription = null

  dom = {
    titleBar: null,
    content: null,
  }

  componentDidMount () {
    const $mouseYPosition = Rx.fromEvent(document.body, 'mousemove')
      .pipe(
        operators.throttleTime(100),
        operators.map(evt => evt.pageY),
        operators.distinctUntilChanged(),
      )

    const $stopResize = Rx.fromEvent(document.body, 'mouseup').pipe(operators.mapTo([false]))
    const $startResize = Rx.from(this.clickResize.stream).pipe(
      operators.filter(evt => evt.button === 0), // Left clicks only

      // Effect: stop the click event from selecting text
      operators.tap(event => event.preventDefault()),

      operators.map(event => [true, event.pageY, this.props.bottomBarHeightPx]),
    )

    const $barHeight = $mouseYPosition.pipe(
      operators.withLatestFrom($startResize),
      operators.map(([latestY, [, initialY, initialHeight]]) => initialHeight + (initialY - latestY)),
    )

    const $isResizing = Rx.merge($stopResize, $startResize).pipe(
      operators.map(R.nth(0)),
      operators.startWith(false)
    )

    const $resize = $barHeight.pipe(
      operators.withLatestFrom($isResizing),
      operators.filter(([barHeight, isResizing]) => isResizing),
      operators.map(([height]) => Math.max(
        height,
        getDOMElementHeight(this.dom.titleBar) + 1
      )),
      operators.distinctUntilChanged(),
    )

    this.subscription = $resize.subscribe(barHeight =>
      this.props.onSetBottomBarHeightPx(barHeight)
    )
  }

  componentWillUnmount () {
    this.subscription && this.subscription.unsubscribe()
  }

  render () {
    return <Div display="flex" flexDirection="column" justifyContent="flex-start" flexShrink="0"
                transition="height 0.05s ease"
                background="#FFFFFF"
                alignItems="stretch" width="100vw" zIndex="1" height={this.props.bottomBarHeightPx}>
      <div
        ref={ref => this.dom.titleBar = ref}
        className={titleBar.toString()}
        onMouseDown={this.clickResize.handler}>
        <Div padding="3px 6px"><Typography>People</Typography></Div>

        <TitleDivider />

        <Div display="flex" alignItems="center" padding="0 10px">
          <Sort className={titleIcon.toString()} />
          <select
            onMouseDown={evt => evt.stopPropagation()}
            onChange={evt => this.props.onChangeSortMode(evt.target.value)}
            value={this.props.sortMode}>
            <option value={SortMode.name}>By name</option>
            <option value={SortMode.weightedCentrality}>By weighted centrality</option>
          </select>
        </Div>

        <Div display="flex" alignItems="center" padding="0 10px">
          <input
            type="text"
            value={this.props.userSearchTerm}
            onChange={evt => this.props.onChangeUserSearchTerm(evt.target.value)}
            placeholder="Filter (name)"
            onMouseDown={evt => evt.stopPropagation()} />
        </Div>
      </div>
      <Div overflow="scroll" zIndex="1">
        <div ref={ref => this.dom.content = ref} className={userList.toString()}>
        {
          this.props.visibleUsers
            .map(user => <User
              key={user.user_id}
              name={user.name}
              onSelect={() => this.props.onSelectUser(user)}
            />)
        }
        </div>
      </Div>
    </Div>
  }
}

const TitleBarListItem = glamorous.div({
  display: 'flex',
  alignItems: 'center',
  padding: '0 10px',
})

const User = ({ name, onSelect }) => <Div
  css={{
    ':hover': {
      background: 'rgb(235, 242, 251)'
    }
  }}
  cursor="pointer"
  onClick={onSelect}
  border="1px solid #F0F0F0"
  padding="20px">
  <Typography>{name}</Typography>
</Div>
User.displayName = 'User'
User.propTypes = {
  name: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
}

const TitleDivider = () => <Div
  width="1px"
  background="#CCCCCC"
  alignSelf="stretch"
  margin="3px 6px"/>
TitleDivider.displayName = 'TitleDivider'

const userList = css(important({
  display: 'flex',
  flexWrap: 'wrap'
}))

const titleBar = css(important({
  background: '#F3F3F3',
  borderBottom: '1px solid #CCCCCC',
  borderTop: '1px solid #CCCCCC',
  cursor: 'ns-resize',

  flexShrink: 0,

  display: 'flex',
  alignItems: 'center',
}))

const titleIcon = css(important({
  fontSize: '1rem'
}))

const ConnectedNodeView = inject(stores => ({
  visibleUsers: stores.state.visibleUsers,
  visibleNodes: stores.state.visibleNodes,
  usersById: stores.state.usersById,

  settings: stores.state.settings,
  bottomBarHeightPx: stores.state.bottomBarHeightPx,

  onSetBottomBarHeightPx: getBottomBarHeightSetterAction(stores.state),

  onSelectUser: user => stores.state.$selectUser.next(user),
}))(componentFromStream(
  $props => {
    const userSearchHandler = Recompose.createEventHandler()

    const sortModeEventHandler = Recompose.createEventHandler()
    const $sortMode = Rx.from(sortModeEventHandler.stream)
      .pipe(operators.startWith(SortMode.name))

    const $needsUpdate = $props.pipe(
      operators.filter(hasDefinedProperties(['visibleUsers']))
    )

    return Rx.combineLatest(
      $needsUpdate,
      $sortMode,
      Rx.concat(Rx.of(''), userSearchHandler.stream),
    ).pipe(
      operators.map(([props, sortMode, userSearchTerm]) => {
        const usersInGraph = sortNodesForMode(props.visibleNodes, props.usersById, sortMode)
            .map(node => props.usersById[node.data('userId')])

        const matchingVisibleUsers = usersInGraph.filter(user => {
          return user.name.toLowerCase().indexOf(userSearchTerm) !== -1
        })

        return [{
          ...props,
          visibleUsers: matchingVisibleUsers,
        }, sortMode, userSearchTerm]
      }),
      operators.map(([props, sortMode, userSearchTerm]) => <NodeView
        bottomBarHeightPx={props.bottomBarHeightPx}
        settings={props.settings}
        visibleUsers={props.visibleUsers}
        visibleNodes={props.visibleNodes}
        onSetBottomBarHeightPx={props.onSetBottomBarHeightPx}
        onChangeSortMode={sortModeEventHandler.handler}
        sortMode={sortMode}
        onSelectUser={props.onSelectUser}
        userSearchTerm={userSearchTerm}
        onChangeUserSearchTerm={userSearchHandler.handler} />)
    )
  }
))
ConnectedNodeView.displayName = 'ConnectedNodeView'

function sortNodesForMode (nodes, usersById, sortMode) {
  if (nodes.length === 0) {
    return nodes
  }

  const cy = nodes[0].cy()
  const getWeightedCentralityNotMemoized = centralityFactory(cy)

  const sortFunction = {
    [SortMode.weightedCentrality]: (() => {
      const getWeightedCentrality = R.memoizeWith(
        node => node.data('id'),
        getWeightedCentralityNotMemoized
      )
      return (node1, node2) => getWeightedCentrality(node1) - getWeightedCentrality(node2)
    })(),
    [SortMode.name]: (() => {
      const getNodeName = R.memoizeWith(
        node => node.data('userId'),
        node => {
          return R.trim(usersById[node.data('userId')].name.toLowerCase())
        }
      )
      return (node1, node2) => getNodeName(node1) >= getNodeName(node2) ? 1 : -1
    })(),
  }[sortMode]

  return R.sort(sortFunction, nodes)
}

export default ConnectedNodeView
