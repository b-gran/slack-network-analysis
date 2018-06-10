import * as R from 'ramda'
import { sample, range } from './utils'

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
