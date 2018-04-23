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
})

const state = (module.hot && module.hot.data && module.hot.data.state) ?
  mergeInitialState(initialState, module.hot.data.state) :
  initialState

const Visualize = observer(class _Visualize extends React.Component {
  static displayName = 'Visualize'

  static propTypes = {
  }

  render () {
    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis: Visualization</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="center" alignItems="center"
             height="100vh">
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
