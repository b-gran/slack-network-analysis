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

import * as MProps from './props'
import { componentFromStream, important } from './utils'
import { hasDefinedProperties } from '../utils'

// HACK: temporary until the state is refactored into a separate module
const getBottomBarHeightSetterAction = store => action(
  bottomBarHeightPx => store.bottomBarHeightPx = bottomBarHeightPx
)

function getDOMElementHeight (dom) {
  return dom.getBoundingClientRect().height
}

class NodeView extends React.Component {
  static propTypes = {
    visibleUsers: PropTypes.arrayOf(MProps.User).isRequired,
    settings: MProps.SettingsProp.isRequired,
    bottomBarHeightPx: PropTypes.number.isRequired,
    onSetBottomBarHeightPx: PropTypes.func.isRequired,
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
      operators.map(([ barHeight, isResizing ]) => isResizing
        ? Rx.of(barHeight)
        : Rx.EMPTY
      ),
      operators.mergeAll(),
      operators.map(height => Math.min(height, (
        getDOMElementHeight(this.dom.titleBar) +
        getDOMElementHeight(this.dom.content)
      ) + 1)),
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
                alignItems="stretch" width="100vw" zIndex="1" height={this.props.bottomBarHeightPx}>
      <div
        ref={ref => this.dom.titleBar = ref}
        className={titleBar.toString()}
        onMouseDown={this.clickResize.handler}>
        <Div padding="3px 6px"><Typography>Users</Typography></Div>
      </div>
      <Div overflow="scroll" background="#8AFF9E" zIndex="1">
        <div ref={ref => this.dom.content = ref} className={userList.toString()}>
        {
          this.props.visibleUsers
            .map(user => <Div padding="20px">{ user.name }</Div>)
        }
        </div>
      </Div>
    </Div>
  }
}

const userList = css(important({
  display: 'flex',
  flexWrap: 'wrap'
}))

const titleBar = css(important({
  background: '#F3F3F3',
  borderBottom: '1px solid #CCCCCC',
  borderTop: '1px solid #CCCCCC',
  cursor: 'ns-resize',
}))

const ConnectedNodeView = inject(stores => ({
  visibleUsers: stores.state.visibleUsers,
  settings: stores.state.settings,
  bottomBarHeightPx: stores.state.bottomBarHeightPx,

  onSetBottomBarHeightPx: getBottomBarHeightSetterAction(stores.state),
}))(componentFromStream(
  $props => {
    const $needsUpdate = $props.pipe(
      operators.filter(hasDefinedProperties(['visibleUsers']))
    )

    return $needsUpdate.pipe(
      operators.map(props => <NodeView
        bottomBarHeightPx={props.bottomBarHeightPx}
        settings={props.settings}
        visibleUsers={props.visibleUsers}
        onSetBottomBarHeightPx={props.onSetBottomBarHeightPx}/>)
    )
  }
))
ConnectedNodeView.displayName = 'ConnectedNodeView'

export default ConnectedNodeView
