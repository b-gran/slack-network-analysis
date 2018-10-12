import PropTypes from 'prop-types'

export const ColorMode = {
  label: 'label',
  degreeCentrality: 'degreeCentrality',
  betweennessCentrality: 'betweennessCentrality',
}
export type ColorMode = typeof ColorMode

export const SizeMode = {
  degreeCentrality: 'degreeCentrality',
  betweennessCentrality: 'betweennessCentrality',
}
export type SizeMode = typeof SizeMode

export const ViewMode = {
  label: 'label',
  periphery: 'periphery',
  center: 'center',
}
export type ViewMode = typeof ViewMode

export const ViewModePropType = PropTypes.oneOf(Object.keys(ViewMode))

