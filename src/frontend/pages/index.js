import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Link from 'next/link'

import axios from 'axios'

import Card, { CardContent } from 'material-ui/Card'
import Typography from 'material-ui/Typography'
import Button from 'material-ui/Button'
import List, { ListItem, ListItemText } from 'material-ui/List'
import Divider from 'material-ui/Divider'
import Modal from 'material-ui/Modal'
import TextField from 'material-ui/TextField'

import { Div } from 'glamorous'
import { css } from 'glamor'

import { observable, action } from 'mobx'
import { PropTypes as MobxPropTypes, observer, inject, Provider } from 'mobx-react'

import { SERVER_URL } from '../config'
import * as MProps from '../props'

// Resets
css.global('body', { margin: 0 })

const state = (module.hot && module.hot.data && module.hot.data.state) ?
  module.hot.data.state :
  observable({
    teams: [],
    isLoaded: false,
    error: undefined,
    showAddTeamModal: false,
    addTeamModal: {
      token: ''
    }
  })

const getTeamData = token => axios({
  url: `${SERVER_URL}/slack/getTeamData`,
  params: {
    token: token,
  }
})
  .then(res => res.data)

const createTeam = (token, authData) => axios.post(
  `${SERVER_URL}/teams`,
  {
    token: token,
    url: authData.url,
    team: authData.team,
    team_id: authData.team_id
  }
)
  .then(() => loadTeams())
  .catch(err => state.error = err)

const loadTeams = action(() => axios.get(`${SERVER_URL}/teams`)
  .then(res => {
    state.teams = res.data
    state.isLoaded = true
  })
  .catch(err => state.error = err)
)

const showAddTeamModal = action(() => state.showAddTeamModal = true)
const closeAddTeamModal = action(() => state.showAddTeamModal = false)
const setToken = action(token => state.addTeamModal.token = token)

const addTeam = action(() => {
  getTeamData(state.addTeamModal.token)
    .then(teamData => createTeam(state.addTeamModal.token, teamData))
    .finally(() => {
      state.addTeamModal.token = ''
      state.showAddTeamModal = false
    })
})

const Index = observer(class _Index extends React.Component {
  static displayName = 'Index'

  static propTypes = {
    teams: MobxPropTypes.observableArrayOf(MProps.Team).isRequired,
    isLoaded: PropTypes.bool,

    showAddTeamModal: PropTypes.bool,
    addTeamModal: PropTypes.shape({
      token: PropTypes.string.isRequired,
    }).isRequired,

    error: MProps.error,
  }

  componentDidMount () {
    return loadTeams()
  }
  
  render () {
    const token = this.props.addTeamModal.token
    const isTokenValid = !this.props.teams.some(team => team.token === token)

    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="center" alignItems="center"
             height="100vh">
          <Card>
            <CardContent>
              <Typography variant="display1">Slack teams</Typography>
            </CardContent>

            <Divider/>

            {!this.props.isLoaded && (
              <CardContent>
                <Typography>Loading...</Typography>
              </CardContent>
            )}

            {this.props.isLoaded && <React.Fragment>
              <List component="nav">
                {this.props.teams.map(team => (
                  <ListItem key={team.team} button>
                    <Link href={{ pathname: '/team', query: { team_id: team.team_id } }}>
                      <ListItemText primary={team.team}/>
                    </Link>
                  </ListItem>
                ))}
              </List>

              <Divider/>

              <CardContent>
                <Button variant="raised" color="primary" onClick={() => showAddTeamModal()}>
                  Add new team
                </Button>
              </CardContent>

            </React.Fragment>}

            <Modal open={this.props.showAddTeamModal} onClose={() => closeAddTeamModal()}>
              <Div width="300px" position="absolute" top="50%" left="50%">
                <Card>
                  <CardContent>
                    <Typography gutterBottom variant="title">Add a new team</Typography>

                    {isTokenValid && (
                      <TextField
                        label="Slack Token"
                        placeholder="xxx-xxxx-12345"
                        onChange={evt => setToken(evt.target.value)}/>
                    )}

                    {!isTokenValid && (
                      <TextField
                        error
                        helperText="A team with this token already exists"
                        label="Slack Token"
                        defaultValue="xxx-xxxx-12345"
                        onChange={evt => setToken(evt.target.value)}/>
                    )}

                    <Div padding="10px 0">
                      <Divider />
                    </Div>

                    <Button variant="raised" color="primary" onClick={() => {
                      if (token.length > 0 && isTokenValid) {
                        addTeam()
                      }
                    }}>
                      Create team from token
                    </Button>
                  </CardContent>
                </Card>
              </Div>
            </Modal>

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

const WIndex = inject(stores => ({ ...stores.state }))(Index)

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
