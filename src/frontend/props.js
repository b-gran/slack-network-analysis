import PropTypes from 'prop-types'

export const Team = PropTypes.shape({
  token: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  team_id: PropTypes.string.isRequired,
  user_data: PropTypes.shape({
    has_user_data: PropTypes.bool.isRequired,
    is_fetching: PropTypes.bool.isRequired,
    last_fetched: PropTypes.string,
  }).isRequired,
})

export const error = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.object,
])
