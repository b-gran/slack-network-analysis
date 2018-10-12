import PropTypes from 'prop-types'
import { PropTypes as MobxPropTypes } from 'mobx-react'
import { ViewModePropType, ViewMode } from './NetworkSettings'
import * as Mobx from 'mobx'

type ObjectId = string

export type SlackAuthResponse = {
  url: string,
  team: Team,
  team_id: string,
}

export const JobData = PropTypes.shape({
  ever_run: PropTypes.bool.isRequired,
  is_running: PropTypes.bool.isRequired,
  last_run: PropTypes.string,
})
export type JobData = {
  ever_run: boolean,
  is_running: boolean,
  last_run?: string,
}

export const Team = PropTypes.shape({
  token: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  team_id: PropTypes.string.isRequired,

  user_data: JobData.isRequired,
  message_data: JobData.isRequired,
  channel_data: JobData.isRequired,
  mention_job: JobData.isRequired,
  network_job: JobData.isRequired,
})
export type Team = {
  token: string,
  url: string,
  team: string,
  team_id: string,
  user_data: JobData,
  message_data: JobData,
  channel_data: JobData,
  mention_job: JobData,
  network_job: JobData,
  networks: ObjectId[],
}

export const Graph = PropTypes.shape({
  _id: PropTypes.string.isRequired,
  team: Team.isRequired,

  description: PropTypes.string,
  created: PropTypes.string.isRequired,
})
export type Graph = {
  _id: ObjectId,
  team: Team,
  description?: string,
  created: string,
}

// Unpopulated
export const User = PropTypes.shape({
  user_id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  slack_data: PropTypes.object,
  team: PropTypes.string.isRequired,
  mentions: PropTypes.objectOf(PropTypes.number),
})
export type User = {
  user_id: string,
  name: string,
  slack_data?: {},
  team: ObjectId,
  mentions: Record<string, number>,
}

// Unpopulated
export const Node = PropTypes.shape({
  _id: PropTypes.string.isRequired,
  graph: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  user: PropTypes.string.isRequired,
})
export type Node = {
  _id: ObjectId,
  graph: ObjectId,
  team: ObjectId,
  user: ObjectId,
}

// Unpopulated
export const Edge = PropTypes.shape({
  _id: PropTypes.string.isRequired,
  graph: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  vertices: MobxPropTypes.arrayOrObservableArrayOf(PropTypes.string).isRequired,
  weight: PropTypes.number.isRequired,
})
export type Edge = {
  _id: ObjectId,
  graph: ObjectId,
  team: ObjectId,
  vertices: Mobx.IObservableArray<string> | Array<string>,
  weight: number,
}

export const error = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.object,
])
export type error = string | Error

export const SettingsProp = PropTypes.shape({
  maxEdgeWeight: PropTypes.number.isRequired,
  edgeLength: PropTypes.number.isRequired,
  animation: PropTypes.bool,
  mode: ViewModePropType.isRequired,
})
export type SettingsProp = {
  maxEdgeWeight: number,
  edgeLength: number,
  animation?: boolean,
  mode: ViewMode,
}
