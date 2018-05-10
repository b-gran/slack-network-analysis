import * as R from 'ramda'

// Marks a CSS-in-JS style as important
export const important = style => {
  if (typeof style === 'object') {
    return R.map(important, style)
  }

  return `${style} !important`
}

// Returns true if the input object has a defined value for each property in the input array.
export const hasDefinedProperties = R.pipe(
  R.map(R.unary(R.prop)),
  R.allPass,
  R.ifElse(R.isNil, R.F)
)
