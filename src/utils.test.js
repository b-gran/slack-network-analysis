import * as R from 'ramda'
import assert from 'assert'
import { booleanFromString, hasDefinedProperties, isIterable, range } from './utils'

describe('hasDefinedProperties', () => {
  it('returns false if the object is missing any props', () => {
    expect(hasDefinedProperties([ 'foo' ])({})).toBe(false)
  })

  it('returns false if the object is nil', () => {
    expect(hasDefinedProperties([ 'foo' ])(null)).toBe(false)
    expect(hasDefinedProperties([])(null)).toBe(false)
  })

  it('returns false if the object has falsey properties', () => {
    const object = {
      foo: 'something',
      bar: false
    }
    expect(hasDefinedProperties([ 'foo', 'bar' ])(object)).toBe(false)
  })

  it('returns true if the object has all the properties', () => {
    const object = {
      foo: 'something',
      bar: () => {},
    }
    expect(hasDefinedProperties([ 'foo', 'bar' ])(object)).toBe(true)

    expect(hasDefinedProperties([])({})).toBe(true)
  })

  it('supports non-objects', () => {
    expect(hasDefinedProperties([])(true)).toBe(true)
  })
})

describe('booleanFromString', () => {
  [true, false].forEach(boolean => {
    it(`${boolean}: supports all cases`, () =>
      allCapitalizations(String(boolean))
        .forEach(permutation => expect(booleanFromString(permutation)).toBe(boolean))
    )
  })
})

describe('isIterable', () => {
  it('returns true for Iterable things', () => {
    function* getIterable () {
      yield 'ok'
    }

    expect(isIterable('foo')).toBe(true)
    expect(isIterable([])).toBe(true)
    expect(isIterable(getIterable())).toBe(true)
  })

  it('returns false for non-Iterable things', () => {
    class NotIterable {}

    expect(isIterable(null)).toBe(false)
    expect(isIterable(5)).toBe(false)
    expect(isIterable(new NotIterable())).toBe(false)
  })
})

describe('range', () => {
  it(`returns an Iterator`, () => {
    expect(isIterable(range(1))).toBe(true)
    expect(isIterable(range(1, 2))).toBe(true)
  })

  it(`starts from 0 when end isn't provided`, () => {
    const yieldedValues = Array.from(range(5))
    expect(yieldedValues).toEqual([0, 1, 2, 3, 4])
  })

  it('contains the values from start up-to-but-not-including end', () => {
    const yieldedValues = Array.from(range(2, 5))
    expect(yieldedValues).toEqual([2, 3, 4])
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
