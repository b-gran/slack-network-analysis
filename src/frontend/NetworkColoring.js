import * as R from 'ramda'
import assert from 'assert'
import { range } from '../utils'

import { ViewMode } from './NetworkSettings'
import { getColorsForLabels } from '../labelPropagation'

class Color {
  static fromCSSHex = R.pipe(
    R.tail, // drop #
    R.splitEvery(2), // get 2-digit hex numbers
    R.map(hexString => parseInt(hexString, 16)), // convert to Numbers
    R.apply(R.constructN(3, Color)) // create Color
  )

  constructor (r, g, b) {
    this.r = r
    this.g = g
    this.b = b
  }

  toCSSHex () {
    const hexColor = [
      channelToCSS(this.r),
      channelToCSS(this.g),
      channelToCSS(this.b),
    ].join('')
    return `#${hexColor}`
  }
}

function channelToCSS (_value) {
  const value = _value | 0
  const string = value.toString(16)
  return value < 0x10
    ? `0${string}`
    : string
}

function lerpColors (from, to, t) {
  return new Color(
    lerp(from.r, to.r, t),
    lerp(from.g, to.g, t),
    lerp(from.b, to.b, t)
  )
}

function lerp (from, to, t) {
  return from + (to - from) * t
}

function multiPointGradientFactory (points) {
  assert(
    !R.isEmpty(points) &&
    R.last(points)[0] <= 1
  )
  const head = R.head(points)
  const last = R.last(points)

  let lastPoint = 0
  for (const [t] of points) {
    assert(t >= lastPoint)
    lastPoint = t
  }

  // The first point must start from 0, and the last end at 1.
  const normalizedPoints = points.slice()
  if (head[0] > 0) {
    normalizedPoints.splice(0, 0, [0, head[1]])
  }
  if (last[0] < 1) {
    normalizedPoints.push([1, last[1]])
  }

  return t => {
    let startOfRange = normalizedPoints[0]
    let endOfRange = normalizedPoints[0]

    // Shift the gradient range forward by one point until t is within the interval.
    for (const i of range(1, normalizedPoints.length)) {
      if (endOfRange[0] >= t) {
        continue
      }
      startOfRange = endOfRange
      endOfRange = normalizedPoints[i]
    }

    const position = (t - startOfRange[0]) / ((endOfRange[0] - startOfRange[0]) || 1)
    return lerpColors(
      startOfRange[1],
      endOfRange[1],
      position
    )
  }
}

export const NodePrimaryColor = '#f50057'
export const NodeSecondaryColor = '#999999'

const PeripheryGradientStart = '#e5ffe3'
const PeripheryGradient80 = '#ffe196'
const PeripheryGradientEnd = '#ffa45f'

const peripheryGradient = multiPointGradientFactory([
  [0, Color.fromCSSHex(PeripheryGradientStart)],
  [0.8, Color.fromCSSHex(PeripheryGradient80)],
  [1, Color.fromCSSHex(PeripheryGradientEnd)],
])

// Mapping of mode => function for applying graph coloring
const GraphColorerByMode = {
  [ViewMode.label]: ({ labels, cy }) => {
    const colorsByLabel = getColorsForLabels(labels)

    // Generate selectors for each label
    const selectors = Array.from(colorsByLabel.entries()).map(([label, color]) => ({
      selector: `node[label = "${label}"]`,
      style: {
        'background-color': `#${color}`,
      },
    }))

    // Apply generated style with label selectors
    cy.style([
      {
        selector: 'node',
        style: {
          "width": "mapData(score, 0, 1, 60, 180)",
          "height": "mapData(score, 0, 1, 60, 180)",
          content: node => node.data('name'),
          'font-size': '20px',
          'text-background-color': '#fff',
          'text-background-opacity': '0.5',
        },
      },
      ...selectors,
      {
        selector: 'node:selected',
        style: {
          'background-color': NodePrimaryColor,
        },
      },
    ])
  },

  // Descending
  [ViewMode.periphery]: getCentralityColoring(R.flip(R.subtract)),

  // Ascending
  [ViewMode.center]: getCentralityColoring(R.subtract),
}

export default GraphColorerByMode

// Get a coloring function based on node centrality.
// If the comparator is ascending, peripheral nodes will take on the colors at the start
// of the gradient and central nodes the end of the gradient.
// If the comparator is descending, central nodes will take on the colors at the start
// of the gradient and peripheral nodes the end of the gradient.
function getCentralityColoring (centralityComparator) {
  if (!centralityComparator) {
    throw new Error('You must supply a centrality comparator')
  }

  return ({ labels, cy }) => {
    // We need to compute this during render because it's extremely expensive, so we can't batch
    // them all up during graph initialization.
    const getClosenessCentrality = cy.$().ccn({
      weight: edge => edge.data('weight'),
    }).closeness

    const closenessPercentileByNode = percentileByNodeForIteratee(
      getClosenessCentrality
    )(cy.nodes())

    const degreePercentileByNode = percentileByNodeForIteratee(
      node => node.data('normalizedDegreeCentrality')
    )(cy.nodes())

    const getColorWeight = node => (
      0.5 * closenessPercentileByNode.get(node) +
      0.5 * degreePercentileByNode.get(node)
    )

    const colorWeightPercentileByNode = percentileByNodeForIteratee(
      getColorWeight,
      centralityComparator
    )(cy.nodes())

    cy.nodes().forEach(node => {
      node.data(
        'colorScore',
        colorWeightPercentileByNode.get(node)
      )
    })

    // Apply generated style with label selectors
    const nodeBaseSize = 100
    cy.style([
      {
        selector: 'node',
        style: {
          "width": `mapData(score, 0, 1, ${nodeBaseSize}, ${3 * nodeBaseSize})`,
          "height": `mapData(score, 0, 1, ${nodeBaseSize}, ${3 * nodeBaseSize})`,
          // TODO: generate unique selectors for each node so we don't need a style function.
          'background-color': element => peripheryGradient(element.data('colorScore')).toCSSHex(),
          content: node => node.data('name'),
          'font-size': '20px',
          'text-background-color': '#fff',
          'text-background-opacity': '0.5',
        },
      },
      {
        selector: 'node:selected',
        style: {
          'background-color': NodePrimaryColor,
        },
      },
    ])
  }
}

// Given a function f :: Node -> Float[0, 1], returns a map of node to the
// node's percentile for the function f. (i.e. a Map<Node, Float[0,1]).
const percentileByNodeForIteratee = (f, comparator = R.subtract) => nodes => {
  const valueByNode = new Map(R.zip(
    nodes,
    nodes.map(f)
  ))

  const orderedByValue = R.sort(
    (a, b) => comparator(valueByNode.get(a), valueByNode.get(b)),
    nodes
  )

  return new Map(R.zip(
    orderedByValue,
    toIndexPercentile(orderedByValue)
  ))
}


// Returns a new array where the value at each index is the percentile of that index
// (i.e. the index divided by the length of the array).
function toIndexPercentile (array) {
  return array.map((_, index) => index / array.length)
}
