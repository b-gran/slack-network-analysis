import * as R from 'ramda'
import { sample } from './utils'

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

  for (let i = 1; i < entries.length; i++) {
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

export function* getShuffledNodeIterator (nodeCollection) {
  const shuffledIndices = shuffleArrayInPlace(R.range(0, nodeCollection.size()))
  for (const index of shuffledIndices) {
    yield nodeCollection[index]
  }
}

function shuffleArrayInPlace (array) {
  for (let i = 0; i < array.length; i++) {
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
