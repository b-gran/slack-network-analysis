import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Link from 'next/link'
import Router from 'next/router'

import axios from 'axios'

import Card, { CardContent } from 'material-ui/Card'
import Typography from 'material-ui/Typography'
import Button from 'material-ui/Button'
import List, { ListItem, ListItemText } from 'material-ui/List'
import Divider from 'material-ui/Divider'
import Modal from 'material-ui/Modal'
import TextField from 'material-ui/TextField'
import { FormControl, FormLabel } from 'material-ui/Form'

import { Div } from 'glamorous'
import { css } from 'glamor'

import { observable, action } from 'mobx'
import { PropTypes as MobxPropTypes, observer, inject, Provider } from 'mobx-react'
import * as R from 'ramda'

import { mergeInitialState, SERVER_URL } from '../config'
import * as MProps from '../props'

// Resets
css.global('body', { margin: 0 })

const initialState = observable({
  error: undefined,
  graph: undefined,
  nodesById: undefined,
  edgesById: undefined,
  usersById: undefined,
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

const Visualize = observer(class _Visualize extends React.Component {
  static displayName = 'Visualize'

  static propTypes = {
    graph: MProps.Graph,
    nodesById: PropTypes.objectOf(MProps.Node),
    edgesById: PropTypes.objectOf(MProps.Edge),
    usersById: PropTypes.objectOf(MProps.User),
    error: MProps.error,
  }

  componentDidMount () {
    return loadInitialData(Router.query.graph)
  }

  render () {
    const isLoaded = Boolean(
      this.props.graph &&
      this.props.nodesById &&
      this.props.edgesById &&
      this.props.usersById
    )

    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis: Visualization</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="center" alignItems="center"
             height="100vh">

          {this.props.error && (
            <Div backgroundColor="#ff7474">
              <Typography>{ JSON.stringify(this.props.error, null, ' ') }</Typography>
            </Div>
          )}
        </Div>
      </React.Fragment>
    )
  }
})

const WVisualize = inject(stores => ({ ...stores.state }))(Visualize)

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
