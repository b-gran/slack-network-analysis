import * as Utils from './utils'
import * as R from 'ramda'
import assert from 'assert'

describe('hasDefinedProperties', () => {
  it('returns false if the object is missing any props', () => {
    expect(Utils.hasDefinedProperties([ 'foo' ])({})).toBe(false)
  })

  it('returns false if the object is nil', () => {
    expect(Utils.hasDefinedProperties([ 'foo' ])(null)).toBe(false)
    expect(Utils.hasDefinedProperties([])(null)).toBe(false)
  })

  it('returns false if the object has falsey properties', () => {
    const object = {
      foo: 'something',
      bar: false
    }
    expect(Utils.hasDefinedProperties([ 'foo', 'bar' ])(object)).toBe(false)
  })

  it('returns true if the object has all the properties', () => {
    const object = {
      foo: 'something',
      bar: () => {},
    }
    expect(Utils.hasDefinedProperties([ 'foo', 'bar' ])(object)).toBe(true)

    expect(Utils.hasDefinedProperties([])({})).toBe(true)
  })

  it('supports non-objects', () => {
    expect(Utils.hasDefinedProperties([])(true)).toBe(true)
  })
})

describe('K', () => {
  describe('length', () => {
    it('returns 0 for the empty object', () => {
      expect(Utils.K({}).length).toBe(0)
    })

    it('returns the number of own keys', () => {
      const object = {
        1: null,
        2: undefined,
        3: false,
        4: 0,
      }
      expect(Utils.K(object).length).toBe(4)
    })

    it('skips inherited keys', () => {
      const object = getObjectWithInheritedProperties({ foo: 1, bar: 1, baz: 1}, { x: 1, y: 1 })
      expect(Utils.K(object).length).toBe(3)
    })

    it('skips non-enumerable string keys', () => {
      const object = getObjectWithSymbolAndNonEnumerableProperties({ foo: 1, bar: 1 })
      expect(Utils.K(object).length).toBe(2)
    })
  })

  describe('some()', () => {
    it('returns false for the empty object regardless of predicate', () => {
      expect(Utils.K({}).some(R.T)).toBe(false)
    })

    it('passes only the key to the predicate', () => {
      const object = {
        foo: null,
      }

      const spy = jest.fn(R.T)
      Utils.K(object).some(spy)

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('foo')
    })

    it('returns true if one key passes the predicate', () => {
      const object = {
        1: null,
        2: undefined,
        3: false,
        4: 0,
      }

      const spy = jest.fn(key => key === '4')
      expect(Utils.K(object).some(spy)).toBe(true)

      // Key ordering is not guaranteed, so it's possible the predicate
      // could just be called once (with 4)
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    it('returns false if no key passes the predicate', () => {
      const object = {
        1: null,
        2: undefined,
        3: false,
        4: 0,
      }
      expect(Utils.K(object).some(R.F)).toBe(false)
    })

    it('skips inherited keys', () => {
      const object = getObjectWithInheritedProperties({ 1: 1, 2: 1 }, { 3: 1, 4: 1})
      const spy = jest.fn(R.F)
      expect(Utils.K(object).some(spy)).toBe(false)

      expect(spy).toHaveBeenCalledWith('1')
      expect(spy).toHaveBeenCalledWith('2')
      expect(spy).not.toHaveBeenCalledWith('3')
      expect(spy).not.toHaveBeenCalledWith('4')
    })

    it('skips non-enumerable string keys', () => {
      const object = getObjectWithSymbolAndNonEnumerableProperties({ foo: 1, bar: 1 })
      const spy = jest.fn(R.F)
      expect(Utils.K(object).some(spy)).toBe(false)
      expect(spy).toHaveBeenCalledTimes(2)
    })
  })
})

describe('booleanFromString', () => {
  [true, false].forEach(boolean => {
    it(`${boolean}: supports all cases`, () =>
      allCapitalizations(String(boolean))
        .forEach(permutation => expect(Utils.booleanFromString(permutation)).toBe(boolean))
    )
  })
})

// Generates all possible permutations of capital letters of the input string.
function allCapitalizations (input, acc = []) {
  assert(input.length > 0)

  const rest = R.tail(input)
  const lower = R.toLower(input[0])
  const upper = R.toUpper(input[0])

  if (input.length === 1) {
    return [lower, upper]
  }

  for (const perm of allCapitalizations(rest)) {
    acc.push(`${lower}${perm}`)
    acc.push(`${upper}${perm}`)
  }

  return acc
}

function getObjectWithInheritedProperties (ownProps, inheritedProps) {
  const prototype = Object.create({})
  Object.keys(inheritedProps).forEach(key => prototype[key] = inheritedProps[key])

  function Klass () {
    Object.keys(ownProps).forEach(key => this[key] = ownProps[key])
  }
  Klass.prototype = prototype
  return new Klass()
}

function getObjectWithSymbolAndNonEnumerableProperties (ownProps) {
  const object = { ...ownProps }
  Object.defineProperty(
    object,
    Symbol.for('symbol property'),
    { value: 'something'}
  )
  Object.defineProperty(
    object,
    'string property, but not enumerable',
    { value: 'something', enumerable: false }
  )
  return object
}
