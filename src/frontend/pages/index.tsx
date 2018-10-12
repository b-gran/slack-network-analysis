import '../rehydrate'

import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

import axios from 'axios'

import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import Divider from '@material-ui/core/Divider'
import Modal from '@material-ui/core/Modal'
import TextField from '@material-ui/core/TextField'

import { Div } from 'glamorous'
import { css } from 'glamor'

import { observable, action, IObservableArray, IObservableObject } from 'mobx'
import { observer, Provider } from 'mobx-react'
import { inject } from '../inject'

import { SERVER_URL } from '../config'
import * as MProps from '../props'
import { error, SlackAuthResponse, Team } from '../props'

// Resets
css.global('body', { margin: 0 })

type State = {
  teams: IObservableArray<MProps.Team>,
  isLoaded?: boolean,
  error?: error,
  showAddTeamModal?: boolean,
  addTeamModal: {
    token: string
  }
}

const state: State & IObservableObject = (module.hot && module.hot.data && module.hot.data.state) ?
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

const getTeamData = (token: string) => axios({
  url: `${SERVER_URL}/slack/getTeamData`,
  params: {
    token: token,
  }
})
  .then(res => res.data)

const createTeam = (token: string, authData: SlackAuthResponse) => axios.post(
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
const setToken = action((token: string) => state.addTeamModal.token = token)

const addTeam = action(() => {
  getTeamData(state.addTeamModal.token)
    .then(teamData => createTeam(state.addTeamModal.token, teamData))
    .finally(() => {
      state.addTeamModal.token = ''
      state.showAddTeamModal = false
    })
})

type IndexProps = {
  teams: IObservableArray<Team>,
  isLoaded?: boolean,

  showAddTeamModal?: boolean,
  addTeamModal: {
    token: string,
  },

  error?: error,
}
const Index = observer(class _Index extends React.Component<IndexProps> {
  static displayName = 'Index'

  componentDidMount() {
    return loadTeams()
  }

  render() {
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

            <Modal open={Boolean(this.props.showAddTeamModal)} onClose={() => closeAddTeamModal()}>
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
                      <Divider/>
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
                <Typography>{JSON.stringify(this.props.error, null, ' ')}</Typography>
              </Div>
            )}
          </Card>
        </Div>
      </React.Fragment>
    )
  }
})

const WIndex = inject((stores: { state: State }) => ({ ...stores.state } as State))(Index)

export default () => (
  <Provider state={state}>
    <WIndex/>
  </Provider>
)

// Keep track of state between module reloads
if (module.hot) {
  module.hot.dispose(data => {
    data.state = state
    return data
  })
}
