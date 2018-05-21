import * as R from 'ramda'
import assert from 'assert'
import { booleanFromString, hasDefinedProperties } from './utils'

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
