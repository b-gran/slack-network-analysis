import '../rehydrate'
import { css } from 'glamor'

import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'
import Link from 'next/link'
import Router from 'next/router'

import axios from 'axios'

import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import IconButton from '@material-ui/core/IconButton'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import ListSubheader from '@material-ui/core/ListSubheader'
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction'
import Divider from '@material-ui/core/Divider'
import FormLabel from '@material-ui/core/FormLabel'
import green from '@material-ui/core/colors/green'
import { createMuiTheme } from '@material-ui/core/styles'

import DeviceHub from '@material-ui/icons/DeviceHub'
import OpenInNew from '@material-ui/icons/OpenInNew'

import { Div, Span } from 'glamorous'

import { action } from 'mobx'
import { PropTypes as MobxPropTypes, observer, inject, Provider } from 'mobx-react'
import * as R from 'ramda'

import { mobxHmrObservable, SERVER_URL } from '../config'
import * as MProps from '../props'
import { important } from '../utils'

// Resets
css.global('body', { margin: 0 })

const state = mobxHmrObservable(module)({
  team: undefined,
  graphs: undefined,
  error: undefined,
})

const getTeam = action(teamId => axios.get(`${SERVER_URL}/teams/${teamId}`)
  .then(res => state.team = res.data)
  .catch(err => state.error = err)
)

const loadInitialData = action(teamId => Promise.all([
  axios.get(`${SERVER_URL}/teams/${teamId}`).then(R.prop('data')),
  axios.get(`${SERVER_URL}/graphs?team_id=${teamId}`).then(R.prop('data')),
]).then(([team, graphs]) => {
  state.team = team
  state.graphs = graphs
}).catch(err => state.error = err))

// Starts a job and updates the team data immediately after initiating the request.
const runJob = action((jobName, teamId) => {
  const jobRequest = axios.post(`${SERVER_URL}/jobs/${jobName}?team_id=${teamId}`)
    .then(() => getTeam(teamId))

  // noinspection JSIgnoredPromiseFromCall
  getTeam(teamId)

  return jobRequest
})

const theme = createMuiTheme()

const Team = observer(class _Team extends React.Component {
  static displayName = 'Team'

  static propTypes = {
    team: MProps.Team,
    graphs: MobxPropTypes.observableArrayOf(MProps.Graph),
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
    return loadInitialData(Router.query.team_id)
  }
  
  render () {
    const isLoaded = Boolean(this.props.team && this.props.graphs)

    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis{isLoaded && `: ${this.props.team.team}`}</title>
        </Head>
        <Div display="flex" flexDirection="column" justifyContent="center" alignItems="center"
             height="100vh">
          <Card>
            <CardContent>
              <Typography variant="display1">Team</Typography>
            </CardContent>

            <Divider/>

            {!isLoaded && (
              <CardContent>
                <Typography>Loading...</Typography>
              </CardContent>
            )}

            {isLoaded && (
              <Div display="flex" justifyContent="flex-start" alignItems="stretch">
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

                    <Div margin="0 10px">
                      <FormLabel>URL</FormLabel>
                      <a href={this.props.team.url}>
                        <Typography variant="body2">{this.props.team.url}</Typography>
                      </a>
                    </Div>
                  </Div>

                  <Div display="flex">
                    <Job
                      jobData={this.props.team.user_data}
                      label="User data from Slack"
                      onRunJob={() => runJob('users', this.props.team.team_id)} />

                    <Job
                      jobData={this.props.team.message_data}
                      label="Message data from Slack"
                      onRunJob={() => runJob('messages', this.props.team.team_id)} />
                  </Div>

                  <Div display="flex">
                    <Job
                      jobData={this.props.team.channel_data}
                      label="Channel data from Slack"
                      onRunJob={() => runJob('channels', this.props.team.team_id)}/>

                    <Job
                      jobData={this.props.team.mention_job}
                      label="Compute mention counts"
                      onRunJob={() => runJob('mentions', this.props.team.team_id)}/>
                  </Div>

                  <Job
                    jobData={this.props.team.network_job}
                    label="Generate network"
                    onRunJob={() => runJob('network', this.props.team.team_id)} />
                </Div>

                <Div borderLeft="1px solid rgba(0, 0, 0, 0.12)" minWidth="200px">
                  <List>
                    <ListSubheader>
                      {/*Inner div needed so we can put vertical-align on the contents*/}
                      <Div>
                        <DeviceHub className={valignMiddle.toString()} />
                        <Span verticalAlign="middle">Graphs</Span>
                      </Div>
                    </ListSubheader>

                    {this.props.graphs.map(graph => {
                      const date = new Date(graph.created).toLocaleString()
                      const visualizeGraphPath = {
                        pathname: '/visualize',
                        query: {
                          graph: graph._id,
                        },
                      }
                      return (
                        <ListItem key={graph._id}>
                          <ListItemText
                            primary={<Typography>{date}</Typography>}
                            secondary={graph.description}/>

                          <ListItemSecondaryAction>
                            <Link href={visualizeGraphPath}>
                              <IconButton color="primary" className={viewGraphButton.toString()}>
                                <OpenInNew />
                              </IconButton>
                            </Link>
                          </ListItemSecondaryAction>
                        </ListItem>
                      )
                    })}
                  </List>
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

const viewGraphButton = css(important({
  color: green['300'],
}))

const valignMiddle = css(important({
  verticalAlign: 'middle',
}))

const WIndex = inject(stores => ({ ...stores.state }))(Team)

function Job (props) {
  return (
    <Div marginTop="20px">
      <Div margin="0 10px">
        <FormLabel>{ props.label }</FormLabel>

        <Div display="flex" alignItems="center">
          <Div marginRight="10px">
            <FormLabel>
              <small>Ever run job?</small>
            </FormLabel>
          </Div>
          <Typography
            variant="body2">{R.toString(props.jobData.ever_run)}</Typography>
        </Div>

        {props.jobData.ever_run && (
          <Div display="flex" alignItems="center">
            <Div marginRight="10px">
              <FormLabel>
                <small>Last ran job</small>
              </FormLabel>
            </Div>
            <Typography variant="body2">
              {new Date(props.jobData.last_run).toLocaleString()}
            </Typography>
          </Div>
        )}

        <Button
          variant="raised"
          color="primary"
          disabled={props.jobData.is_running}
          onClick={props.onRunJob}>
          Run job
        </Button>
      </Div>
    </Div>
  )
}
Job.displayName = 'Job'
Job.propTypes = {
  label: PropTypes.node.isRequired,
  jobData: MProps.JobData.isRequired,
  onRunJob: PropTypes.func.isRequired,
}

export default () => (
  <Provider state={state}>
    <WIndex />
  </Provider>
)
