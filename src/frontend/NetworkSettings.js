import PropTypes from 'prop-types'

export const ColorMode = {
  label: 'label',
  degreeCentrality: 'degreeCentrality',
  betweennessCentrality: 'betweennessCentrality',
}

export const SizeMode = {
  degreeCentrality: 'degreeCentrality',
  betweennessCentrality: 'betweennessCentrality',
}

export const ViewMode = {
  label: 'label',
  periphery: 'periphery',
  center: 'center',
}

export const ViewModePropType = PropTypes.oneOf(Object.keys(ViewMode))

