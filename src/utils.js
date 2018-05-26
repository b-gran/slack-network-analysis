const R = require('ramda')

// Returns true if the input object has a defined value for each property in the input array.
module.exports.hasDefinedProperties = R.pipe(
  R.map(R.unary(R.prop)),
  R.allPass,
  R.ifElse(R.isNil, R.F)
)

module.exports.booleanFromString = R.ifElse(
  R.pipe(String, R.toLower, R.equals('true')),
  R.T,
  R.F
)

// Given an object, returns a Map with the same keys & values.
// Note: keys will be strings.
module.exports.mapFromObject = R.pipe(R.toPairs, R.constructN(1, Map))

module.exports.sample = function sample (array) {
  if (R.isNil(array) || !Array.isArray(array) || R.isEmpty(array)) {
    return undefined
  }

  return array[(Math.random() * array.length)|0]
}
