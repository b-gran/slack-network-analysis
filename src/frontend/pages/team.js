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
  team: undefined,
  isLoaded: false,
  error: undefined,
})

const state = (module.hot && module.hot.data && module.hot.data.state) ?
  mergeInitialState(initialState, module.hot.data.state) :
  initialState

const getTeam = action(teamId => axios.get(`${SERVER_URL}/teams/${teamId}`)
  .then(res => {
    state.team = res.data
    state.isLoaded = true
  })
  .catch(err => state.error = err)
)

// Loads all users during the request.
const loadUserData = action(teamId => {
  const loadUsers = axios.post(`${SERVER_URL}/users?team_id=${teamId}`)
    .then(() => getTeam(teamId))

  // noinspection JSIgnoredPromiseFromCall
  getTeam(teamId)

  return loadUsers
})

// Loads channels in a background job.
// Request will return immediately (if params are correct).
// Need to keep polling team data.
const loadChannelData = action(teamId => {
  const loadUsers = axios.post(`${SERVER_URL}/channels?team_id=${teamId}`)
    .then(() => getTeam(teamId))

  // noinspection JSIgnoredPromiseFromCall
  getTeam(teamId)

  return loadUsers
})

// Loads messages in a background job.
// Request will return immediately (if params are correct).
// Need to keep polling team data.
const loadMessageData = action(teamId => {
  const loadUsers = axios.post(`${SERVER_URL}/messages?team_id=${teamId}`)
    .then(() => getTeam(teamId))

  // noinspection JSIgnoredPromiseFromCall
  getTeam(teamId)

  return loadUsers
})

const Team = observer(class _Team extends React.Component {
  static displayName = 'Team'

  static propTypes = {
    team: MProps.Team,
    isLoaded: PropTypes.bool,
    error: MProps.error,
  }

  teamUpdateTimer = null

  componentWillUnmount () {
    if (this.teamUpdateTimer) {
      clearInterval(this.teamUpdateTimer)
      this.teamUpdateTimer = null
    }
  }

  componentDidMount () {
    this.teamUpdateTimer = setInterval(() => getTeam(Router.query.team_id), 5000)
    return getTeam(Router.query.team_id)
  }
  
  render () {
    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis{this.props.isLoaded && `: ${this.props.team.team}`}</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="center" alignItems="center"
             height="100vh">
          <Card>
            <CardContent>
              <Typography variant="display1">Team</Typography>
            </CardContent>

            <Divider/>

            {!this.props.isLoaded && (
              <CardContent>
                <Typography>Loading...</Typography>
              </CardContent>
            )}

            {this.props.isLoaded && (
              <Div padding="20px 10px">
                <Div display="flex">
                  <Div margin="0 10px">
                    <FormLabel>Team name</FormLabel>
                    <Typography variant="body2">{this.props.team.team}</Typography>
                  </Div>

                  <Div margin="0 10px">
                    <FormLabel>Team id</FormLabel>
                    <Typography variant="body2">{this.props.team.team_id}</Typography>
                  </Div>
                </Div>

                <Div display="flex" marginTop="20px">
                  <Div margin="0 10px">
                    <FormLabel>URL</FormLabel>
                    <a href={this.props.team.url}>
                      <Typography variant="body2">{this.props.team.url}</Typography>
                    </a>
                  </Div>
                </Div>

                {/***********************
                  ****** User data ******
                  ***********************/}
                <Div marginTop="20px">
                  <Div margin="0 10px">
                    <FormLabel>User Data</FormLabel>

                    <Div display="flex" alignItems="center">
                      <Div marginRight="10px">
                        <FormLabel>
                          <small>Has user data?</small>
                        </FormLabel>
                      </Div>
                      <Typography
                        variant="body2">{R.toString(this.props.team.user_data.has_user_data)}</Typography>
                    </Div>

                    {this.props.team.user_data.has_user_data && (
                      <Div display="flex" alignItems="center">
                        <Div marginRight="10px">
                          <FormLabel>
                            <small>Last fetched user data</small>
                          </FormLabel>
                        </Div>
                        <Typography variant="body2">
                          {new Date(this.props.team.user_data.last_fetched).toLocaleString()}
                        </Typography>
                      </Div>
                    )}

                    <Button
                      variant="raised"
                      color="primary"
                      disabled={this.props.team.user_data.is_fetching}
                      onClick={() => {
                        return loadUserData(this.props.team.team_id)
                      }} >
                      Reload user data
                    </Button>
                  </Div>
                </Div>

                {/***********************
                 ***** Message data *****
                 ***********************/}
                <Div marginTop="20px">
                  <Div margin="0 10px">
                    <FormLabel>Message Data</FormLabel>

                    <Div display="flex" alignItems="center">
                      <Div marginRight="10px">
                        <FormLabel>
                          <small>Has message data?</small>
                        </FormLabel>
                      </Div>
                      <Typography
                        variant="body2">{R.toString(this.props.team.message_data.has_message_data)}</Typography>
                    </Div>

                    {this.props.team.message_data.has_message_data && (
                      <Div display="flex" alignItems="center">
                        <Div marginRight="10px">
                          <FormLabel>
                            <small>Last fetched message data</small>
                          </FormLabel>
                        </Div>
                        <Typography variant="body2">
                          {new Date(this.props.team.message_data.last_fetched).toLocaleString()}
                        </Typography>
                      </Div>
                    )}

                    <Button
                      variant="raised"
                      color="primary"
                      disabled={this.props.team.message_data.is_fetching}
                      onClick={() => {
                        return loadMessageData(this.props.team.team_id)
                      }} >
                      Reload message data
                    </Button>
                  </Div>
                </Div>

                {/***********************
                 ***** Channel data *****
                 ***********************/}
                <Div marginTop="20px">
                  <Div margin="0 10px">
                    <FormLabel>Channel Data</FormLabel>

                    <Div display="flex" alignItems="center">
                      <Div marginRight="10px">
                        <FormLabel>
                          <small>Has channel data?</small>
                        </FormLabel>
                      </Div>
                      <Typography
                        variant="body2">{R.toString(this.props.team.channel_data.has_channel_data)}</Typography>
                    </Div>

                    {this.props.team.channel_data.has_channel_data && (
                      <Div display="flex" alignItems="center">
                        <Div marginRight="10px">
                          <FormLabel>
                            <small>Last fetched channel data</small>
                          </FormLabel>
                        </Div>
                        <Typography variant="body2">
                          {new Date(this.props.team.channel_data.last_fetched).toLocaleString()}
                        </Typography>
                      </Div>
                    )}

                    <Button
                      variant="raised"
                      color="primary"
                      disabled={this.props.team.channel_data.is_fetching}
                      onClick={() => {
                        return loadChannelData(this.props.team.team_id)
                      }} >
                      Reload channel data
                    </Button>
                  </Div>
                </Div>


              </Div>
            )}

            {this.props.error && (
              <Div backgroundColor="#ff7474">
                <Typography>{ JSON.stringify(this.props.error, null, ' ') }</Typography>
              </Div>
            )}
          </Card>
        </Div>
      </React.Fragment>
    )
  }
})

const WIndex = inject(stores => ({ ...stores.state }))(Team)

export default () => (
  <Provider state={state}>
    <WIndex />
  </Provider>
)

// Keep track of state between module reloads
if (module.hot) {
  module.hot.dispose(data => {
    data.state = state
    return data
  })
}
