import * as Utils from './utils'

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