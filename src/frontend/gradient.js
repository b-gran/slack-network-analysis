import assert from 'assert'

const GOLDEN_RATIO = 0.618033988749895

function toPaddedHexString (n) {
  const string = n.toString(16)
  return Array(6 - string.length).fill('0').join('') + string
}

function toHexGradient (x) {
  assert(typeof x === 'number' && x >= 0 && x <= 1)

  return (0xFFFFFF * x) | 0
}

export default function getGradientFactory (offset = Math.random()) {
  return i => toPaddedHexString(toHexGradient(
    (offset + (GOLDEN_RATIO * i)) % 1
  ))
}

