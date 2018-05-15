import * as R from 'ramda'

// Marks a CSS-in-JS style as important
export const important = style => {
  if (typeof style === 'object') {
    return R.map(important, style)
  }

  return `${style} !important`
}
