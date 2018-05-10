import * as Utils from './utils'

describe('hasProps', () => {
  it('returns false if the object is missing any props', () => {
    expect(Utils.hasProps([ 'foo' ])({})).toBe(false)
  })

  it('returns false if the object is nil', () => {
    expect(Utils.hasProps([ 'foo' ])(null)).toBe(false)
    expect(Utils.hasProps([])(null)).toBe(false)
  })

  it('returns true if the object has all the properties', () => {
    const object = {
      foo: 'something',
      bar: undefined,
    }
    expect(Utils.hasProps([ 'foo', 'bar' ])(object)).toBe(true)

    expect(Utils.hasProps([])({})).toBe(true)
  })

  it('supports non-objects', () => {
    expect(Utils.hasProps([])(true)).toBe(true)
  })
})