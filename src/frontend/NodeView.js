import React from 'react'
import PropTypes from 'prop-types'

import { action } from 'mobx'
import { inject } from 'mobx-react'

import * as R from 'ramda'
import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'
import * as Recompose from 'recompose'

import glamorous, { Div } from 'glamorous'
import Typography from 'material-ui/Typography'

import * as MProps from './props'
import { componentFromStream } from './utils'
import { hasDefinedProperties } from '../utils'

// HACK: temporary until the state is refactored into a separate module
const getBottomBarHeightSetterAction = store => action(
  bottomBarHeightPx => store.bottomBarHeightPx = bottomBarHeightPx
)

class NodeView extends React.Component {
  static propTypes = {
    visibleUsers: PropTypes.arrayOf(MProps.User).isRequired,
    settings: MProps.SettingsProp.isRequired,
    bottomBarHeightPx: PropTypes.number.isRequired,
    onSetBottomBarHeightPx: PropTypes.func.isRequired,
  }

  clickResize = Recompose.createEventHandler()
  subscription = null

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
      operators.mergeAll()
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
      <Div
        background="rgb(243, 243, 243)"
        borderBottom="1px solid rgb(204, 204, 204)"
        borderTop="1px solid rgb(204, 204, 204)"
        cursor="ns-resize"
        onMouseDown={this.clickResize.handler}>
        <Typography>Users</Typography>
      </Div>
      <Div
        display="flex"
        overflow="scroll" background="#8AFF9E" zIndex="1"
        flexWrap="wrap">
        {
          this.props.visibleUsers
            .map(user => <Div padding="20px">{ user.name }</Div>)
        }
      </Div>
    </Div>
  }
}

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
