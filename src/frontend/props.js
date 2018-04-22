import PropTypes from 'prop-types'

export const Team = PropTypes.shape({
  token: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  team: PropTypes.string.isRequired,
  team_id: PropTypes.string.isRequired,
})

export const error = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.object,
])
