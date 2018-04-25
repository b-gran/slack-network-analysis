import PropTypes from 'prop-types'

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

export const error = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.object,
])
