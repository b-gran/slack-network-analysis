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

module.exports.isIterable = maybeIterable => (
  !R.isNil(maybeIterable) &&
  typeof maybeIterable[Symbol.iterator] === 'function'
)

// Iterator over the numbers [start, end) (i.e. up to, but not including, end).
// Has the same semantics as Python's range().
module.exports.range = function* (_start, _end) {
  const isSingleArgument = R.isNil(_end)

  const start = isSingleArgument ? 0 : _start
  const end = isSingleArgument ? _start : _end

  for (let i = start; i < end; i++) {
    yield i
  }
}