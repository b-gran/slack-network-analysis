import * as R from 'ramda'

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

function lerp (from, to, t) {
  return new Color(
    lerpValue(from.r, to.r, t),
    lerpValue(from.g, to.g, t),
    lerpValue(from.b, to.b, t)
  )
}

function lerpValue (from, to, t) {
  return from + (to - from) * t
}

function lerpRangeFactory (points) {
  if (points.length === 0) {
    throw new Error('invalid LERP range')
  }

  if (points[points.length - 1][0] > 1) {
    throw new Error('invalid LERP range')
  }

  let last = 0
  for (const [t] of points) {
    if (t < last) {
      throw new Error('invalid LERP range')
    }
    last = t
  }

  points = points.slice()
  if (points[0][0] > 0) {
    points.splice(0, 0, [0, points[0][1]])
  }

  if (points[points.length - 1][0] < 1) {
    points.push([1, points[points.length - 1][1]])
  }

  return t => {
    let start = points[0]
    let end = points[0]

    for (let i = 1; i < points.length; i++) {
      if (end[0] >= t) {
        continue
      }
      start = end
      end = points[i]
    }

    const position = (t - start[0]) / ((end[0] - start[0]) || 1)
    return lerp(
      start[1],
      end[1],
      position
    )
  }
}

export const NodePrimaryColor = '#f50057'
export const NodeSecondaryColor = '#999999'

const PeripheryGradientStart = '#96eaff'
const PeripheryGradient80 = '#ffe196'
const PeripheryGradientEnd = '#ffa45f'

const peripheryGradient = lerpRangeFactory([
  [0, Color.fromCSSHex(PeripheryGradientStart)],
  [0.8, Color.fromCSSHex(PeripheryGradient80)],
  [1, Color.fromCSSHex(PeripheryGradientEnd)],
])

// Mapping of mode => function for applying graph coloring
const GraphColorerByMode = {
  // Actual coloring for label mode
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

  // TODO: replace with actual "periphery" coloring
  // Currently using label coloring
  [ViewMode.periphery]: ({ labels, cy }) => {
    // We need to compute this during render because it's extremely expensive, so we can't batch
    // them all up during graph initialization.
    // TODO: memoize
    const getClosenessCentrality = cy.$().ccn({
      weight: edge => edge.data('weight'),
    }).closeness

    const closenessByNode = new Map(R.zip(
      cy.nodes(),
      cy.nodes().map(getClosenessCentrality)
    ))
    
    const toIndexPercentile = array => array.map((_, index) => index / array.length)

    const nodesOrderedByCloseness = R.sort(
      (a, b) => closenessByNode.get(a) - closenessByNode.get(b),
      cy.nodes()
    )
    const nodesByClosenessPercentile = new Map(R.zip(
      nodesOrderedByCloseness,
      toIndexPercentile(nodesOrderedByCloseness)
    ))

    const nodesOrderedByDegree = R.sort(
      (a, b) => a.data('normalizedDegreeCentrality') - b.data('normalizedDegreeCentrality'),
      cy.nodes()
    )
    const nodesByDegreePercentile = new Map(R.zip(
      nodesOrderedByDegree,
      toIndexPercentile(nodesOrderedByDegree)
    ))

    const getColorWeight = node => (
      0.5 * nodesByClosenessPercentile.get(node) +
      0.5 * nodesByDegreePercentile.get(node)
    )

    const nodesOrderedByColorWeight = R.sort(
      (a, b) => getColorWeight(b) - getColorWeight(a),
      cy.nodes()
    )
    const colorWeightByNode = new Map(R.zip(
      nodesOrderedByColorWeight,
      toIndexPercentile(nodesOrderedByColorWeight)
    ))

    cy.nodes().forEach(node => {
      node.data(
        'colorScore',
        colorWeightByNode.get(node)
      )
    })

    const nodeBaseSize = 100

    // Apply generated style with label selectors
    cy.style([
      {
        selector: 'node',
        style: {
          "width": `mapData(score, 0, 1, ${nodeBaseSize}, ${3 * nodeBaseSize})`,
          "height": `mapData(score, 0, 1, ${nodeBaseSize}, ${3 * nodeBaseSize})`,
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
  },

  // TODO: replace with actual "center" coloring
  // Currently using label coloring
  [ViewMode.center]: ({ labels, cy }) => {
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
}

export default GraphColorerByMode

