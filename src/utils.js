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
