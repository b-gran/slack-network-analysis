import PropTypes from 'prop-types'
import { PropTypes as MobxPropTypes } from 'mobx-react'

export const JobData = PropTypes.shape({
  ever_run: PropTypes.bool.isRequired,
  is_running: PropTypes.bool.isRequired,
  last_run: PropTypes.string,
})

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

export const Graph = PropTypes.shape({
  _id: PropTypes.string.isRequired,
  team: Team.isRequired,

  description: PropTypes.string,
  created: PropTypes.string.isRequird,
})

// Unpopulated
export const User = PropTypes.shape({
  user_id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  slack_data: PropTypes.object,
  team: PropTypes.string.isRequired,
  mentions: PropTypes.objectOf(PropTypes.number),
})

// Unpopulated
export const Node = PropTypes.shape({
  _id: PropTypes.string.isRequired,
  graph: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  user: PropTypes.string.isRequired,
})

// Unpopulated
export const Edge = PropTypes.shape({
  _id: PropTypes.string.isRequired,
  graph: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  vertices: MobxPropTypes.arrayOrObservableArrayOf(PropTypes.string).isRequired,
  weight: PropTypes.number.isRequired,
})

export const error = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.object,
])
