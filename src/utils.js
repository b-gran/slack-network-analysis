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

module.exports.K = function K (object) {
  function isEnumberableNamedStringKey (key) {
    return typeof key === 'string' && object.hasOwnProperty(key)
  }

  return {
    get length () {
      let length = 0
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }
        length += 1
      }
      return length
    },
    some: iteratee => {
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }

        if (iteratee(key)) {
          return true
        }
      }
      return false
    },
    map: iteratee => {
      const result = []
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }

        result.push(iteratee(key))
      }
      return result
    },
    toSet: () => {
      const set = new Set()
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }
        set.add(key)
      }
      return set
    },
    every: iteratee => {
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }

        if (!iteratee(key)) {
          return false
        }
      }
      return true
    },
    filter: iteratee => {
      const filteredElements = []
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }

        if (iteratee(key)) {
          filteredElements.push(key)
        }
      }
      return filteredElements
    },
    forEach: iteratee => {
      for (const key in object) {
        if (!isEnumberableNamedStringKey(key)) {
          continue
        }
        iteratee(object[key])
      }
    },
  }
}
