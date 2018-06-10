import * as R from 'ramda'
import { range, sample } from './utils'
import getGradientFactory from './frontend/gradient'

// Chooses a label for a source node based on the labelling of its neighbors.
// labelsByNodeId is a Map whose keys have the same type as the ids of the nodes.
//
// Preconditions:
//    sourceNode is a cytoscape single element Collection
//    neighbors is a cytoscape Collection
//    there is an entry in labelsByNodeId for sourceNode and each node in neighbors
export function pickLabel (labelsByNodeId, sourceNode, neighbors) {
  if (neighbors.empty()) {
    return labelsByNodeId.get(sourceNode.id())
  }

  const scores = new Map()
  neighbors.forEach(node => {
    const label = labelsByNodeId.get(node.id())

    if (!scores.has(label)) {
      scores.set(label, 1)
      return
    }

    scores.set(label, scores.get(label) + 1)
  })

  const entries = Array.from(scores.entries())
  const maxEntries = new Set([ entries[0] ])

  for (const i of range(1, entries.length)) {
    const currentMax = headSet(maxEntries)[1]
    const entry = entries[i]
    const [,score] = entry

    if (score > currentMax) {
      maxEntries.clear()
      maxEntries.add(entry)
    } else if (score === currentMax) {
      maxEntries.add(entry)
    }
  }

  return sampleSet(maxEntries)[0]
}

// Given a graph and a labeling, assigns each node the label of the majority of its neighbors.
// Does not modify the input labeling. Returns a new labeling.
//
// Preconditions
//    graph is a Cytoscape graph
//    there is a label in _labelsByNodeId (Map) for each node in graph
export function propagateLabelsStep (_labelsByNodeId, graph) {
  const labelsByNodeId = new Map(_labelsByNodeId)
  const nodes = graph.nodes()

  // Pick nodes at random and assign a label
  for (const node of getShuffledNodeIterator(nodes)) {
    const neighbors = node.openNeighborhood().nodes()
    const label = pickLabel(labelsByNodeId, node, neighbors)
    labelsByNodeId.set(node.id(), label)
  }

  return labelsByNodeId
}

export function propagateLabels (graph, { iterations = 10 } = {}) {
  let labelsByNodeId = getInitialLabeling(graph)
  const initialLabelCount = labelsByNodeId.size

  for (const i of range(iterations)) {
    labelsByNodeId = propagateLabelsStep(labelsByNodeId, graph)

    // If we didn't propagate any labels, we're done
    const labelCount = new Set(labelsByNodeId.values()).size
    if (labelCount === initialLabelCount) {
      return labelsByNodeId
    }
  }

  return labelsByNodeId
}

export function getInitialLabeling (graph) {
  const labelsByNodeId = new Map()
  graph.nodes().forEach(node => {
    const id = node.id()
    labelsByNodeId.set(id, id)
  })
  return labelsByNodeId
}

export function* getShuffledNodeIterator (nodeCollection) {
  const shuffledIndices = shuffleArrayInPlace(R.range(0, nodeCollection.size()))
  for (const index of shuffledIndices) {
    yield nodeCollection[index]
  }
}

// In-place Fisher-Yates shuffle
function shuffleArrayInPlace (array) {
  for (const i of range(array.length)) {
    const shuffledIndex = randomInt(i, array.length)

    const initialValue = array[i]
    array[i] = array[shuffledIndex]
    array[shuffledIndex] = initialValue
  }
  return array
}

// Returns an integer selected uniformly at random in the range [min, max)
function randomInt (min, max) {
  const minInt = min|0
  const maxInt = max|0
  return ((Math.random() * (maxInt - minInt))|0) + minInt
}

function headSet (set) {
  return set.values().next().value
}

function sampleSet (set) {
  return sample(Array.from(set.values()))
}

// Given a node labeling, returns a mapping of label => color for the labels.
export function getColorsForLabels (labelsByNodeId) {
  const getColor = getGradientFactory()

  const colorsByLabel = new Map()
  const labelValues = Array.from(labelsByNodeId.values())
  for (const i of range(labelValues.length)) {
    const label = labelValues[i]
    colorsByLabel.set(label, getColor(i))
  }

  return colorsByLabel
}

// Creates a function that returns a unique human-readable label each time is invoked.
function getLabelGenerator () {
  const sequence = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const labelCount = sequence.length

  let index = 0

  return () => {
    // Convert the index to a number whose base is the length of the sequence.
    // Each digit will correspond to a position in the sequence
    // This number is string format.
    const sequencePositions = Array.from(index.toString(labelCount))
    // Convert each character of the high-base number-string to a Number.
      .map(char => parseInt(char, labelCount))

    index = index + 1

    // If there's only one digit, we just index directly into the sequence.
    if (sequencePositions.length === 1) {
      return sequence[sequencePositions[0]]
    }

    // Otherwise, we need to shift the first digit one position to the left in the sequence.
    // For example, if the digits were 100, these positions would correspond directly to BAB.
    // We actually want this label to be AAA - so we need to shift the first digit.
    const [first, ...rest] = sequencePositions
    return [
      sequence[first - 1],
      ...rest.map(n => sequence[n]),
    ].join('')
  }
}

// Given a node labeling, returns an equivalent labeling but whose labels are human-readable.
export function getHumanReadableLabels (labelsByNodeId) {
  const getLabel = getLabelGenerator()
  const uniqueLabels = new Set(labelsByNodeId.values())

  // Generate a human label for each unique original label
  const humanReadableLabelsByOriginalLabel = new Map()
  for (const label of uniqueLabels) {
    humanReadableLabelsByOriginalLabel.set(label, getLabel())
  }

  // Convert the original labels to the new format
  const humanReadableLabelsByNodeId = new Map()
  for (const [nodeId, label] of labelsByNodeId) {
    humanReadableLabelsByNodeId.set(nodeId, humanReadableLabelsByOriginalLabel.get(label))
  }

  return humanReadableLabelsByNodeId
}
