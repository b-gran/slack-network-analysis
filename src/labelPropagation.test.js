import * as R from 'ramda'
import cytoscape from 'cytoscape'

import { mapFromObject, isIterable, range } from './utils'
import * as LPA from './labelPropagation'

describe('propagateLabels', () => {
  // A graph containing a single node is assigned its initial label
  it('returns the same labels', () => {
    const nodeId = 'A'
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: nodeId,
        },
      }]
    })
    const expectedLabels = mapFromObject({
      [nodeId]: nodeId,
    })

    const propagatedLabels = LPA.propagateLabels(graph)
    expect(propagatedLabels).toEqual(expectedLabels)
  })

  // Each node is assigned the label of the majority of its neighbors.
  it('assigns the same label to every node and picks each label uniformly', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'D',
        },
      }, {
        group: 'edges',
        data: {
          source: 'A',
          target: 'B',
        },
      }, {
        group: 'edges',
        data: {
          source: 'A',
          target: 'C',
        },
      }, {
        group: 'edges',
        data: {
          source: 'B',
          target: 'D',
        },
      }, {
        group: 'edges',
        data: {
          source: 'C',
          target: 'D',
        },
      }]
    })

    const countByLabel = mapFromObject({
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    })

    const iterations = 400
    for (const i of range(iterations)) {
      const labelsByNodeId = LPA.propagateLabels(graph)

      const labels = Array.from(labelsByNodeId.values())
      const label = labels[0]

      // Has a small probability of failure
      expect(labels.every(R.equals(label))).toBe(true)

      countByLabel.set(label, countByLabel.get(label) + 1)
    }

    for (const [,count] of countByLabel) {
      const ratio = count / iterations

      // Has a small probability of failure
      expect(ratio).toBeCloseTo(1 / countByLabel.size, 0.05)
    }
  })

  it('assigns each node its own label when there are no edges between them', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'D',
        },
      }]
    })
    const labels = mapFromObject({
      A: 'A',
      B: 'B',
      C: 'C',
      D: 'D',
    })

    const propagatedLabels = LPA.propagateLabelsStep(labels, graph)
    expect(propagatedLabels).toEqual(labels)
  })
})

describe('propagateLabelsStep', () => {
  // A graph containing a single node is assigned its initial label
  it('returns the same labels', () => {
    const nodeId = 'A'
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: nodeId,
        },
      }]
    })
    const labels = mapFromObject({
      [nodeId]: nodeId,
    })

    const propagatedLabels = LPA.propagateLabelsStep(labels, graph)
    expect(propagatedLabels).toEqual(labels)
  })

  // Each node is assigned the label of the majority of its neighbors.
  it('assigns the same label to every node', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'D',
        },
      }, {
        group: 'edges',
        data: {
          source: 'A',
          target: 'B',
        },
      }, {
        group: 'edges',
        data: {
          source: 'A',
          target: 'C',
        },
      }, {
        group: 'edges',
        data: {
          source: 'A',
          target: 'D',
        },
      }, {
        group: 'edges',
        data: {
          source: 'B',
          target: 'C',
        },
      }, {
        group: 'edges',
        data: {
          source: 'B',
          target: 'D',
        },
      }, {
        group: 'edges',
        data: {
          source: 'C',
          target: 'D',
        },
      }]
    })
    const labels = mapFromObject({
      A: 'A',
      B: 'A',
      C: 'A',
      D: 'D',
    })

    const propagatedLabels = LPA.propagateLabelsStep(labels, graph)
    expect(propagatedLabels).toEqual(mapFromObject({
      A: 'A',
      B: 'A',
      C: 'A',
      D: 'A',
    }))
  })

  it('assigns each node its own label when there are no edges between them', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'D',
        },
      }]
    })
    const labels = mapFromObject({
      A: 'A',
      B: 'B',
      C: 'C',
      D: 'D',
    })

    const propagatedLabels = LPA.propagateLabelsStep(labels, graph)
    expect(propagatedLabels).toEqual(labels)
  })
})

describe('pickLabel', () => {
  // A graph containing a single node is assigned its initial label
  it('assigns the node the label', () => {
    const nodeId = 'A'

    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: nodeId,
        },
      }]
    })

    const source = graph.$(`#${nodeId}`)
    const neighbors = source.openNeighborhood().nodes()
    const labels = mapFromObject({
      [nodeId]: nodeId,
    })

    expect(LPA.pickLabel(labels, source, neighbors)).toBe(labels.get(nodeId))
  })

  // Each node is assigned the label of the majority of its neighbors.
  it('assigns the same label to every node', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }, {
        group: 'edges',
        data: {
          id: 'E1',
          source: 'A',
          target: 'B',
        },
      }, {
        group: 'edges',
        data: {
          id: 'E2',
          source: 'B',
          target: 'C',
        },
      }, {
        group: 'edges',
        data: {
          id: 'E3',
          source: 'C',
          target: 'A',
        },
      }]
    })

    const source = graph.$('#A')
    const neighbors = source.openNeighborhood().nodes()

    let lastLabel = LPA.pickLabel(labelOtherNodes(source, neighbors, 'X'), source, neighbors)

    for (const nodeId of ['B', 'C']) {
      const source = graph.$(`#${nodeId}`)
      const neighbors = source.openNeighborhood().nodes()
      const labels = labelOtherNodes(source, neighbors, 'X')

      const chosenLabel = LPA.pickLabel(labels, source, neighbors)
      expect(chosenLabel).toBe(lastLabel)
      lastLabel = chosenLabel
    }

    function labelOtherNodes (source, neighbors, otherLabel) {
      const labels = new Map()
      labels.set(source.id(), source.id())
      neighbors.forEach(node => labels.set(node.id(), otherLabel))
      return labels
    }
  })

  it('gives each node its own label when there are no edges between them', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }]
    })

    const labels = mapFromObject({
      A: 'A',
      B: 'B',
      C: 'C',
    })

    for (const nodeId of ['A', 'B', 'C']) {
      const source = graph.$(`#${nodeId}`)
      const neighbors = source.openNeighborhood().nodes()

      const chosenLabel = LPA.pickLabel(labels, source, neighbors)
      expect(chosenLabel).toBe(nodeId)
    }
  })
})

describe('getShuffledNodeIterator', () => {
  it('returns an empty iterator for an empty collection', () => {
    const iter = LPA.getShuffledNodeIterator(cytoscape().collection())
    expect(isIterable(iter)).toBe(true)

    const elem = iter.next()
    expect(elem.value).toBeUndefined()
    expect(elem.done).toBe(true)
  })

  it('returns an iterator containing all the elements in the collection', () => {
    const nodeIds = R.times(() => String(Math.random()), 10)
    const nodes = nodeIds.map(id => ({
      group: 'nodes',
      data: {
        id: id,
      }
    }))

    const collection = cytoscape({ elements: nodes }).nodes()
    const iter = LPA.getShuffledNodeIterator(collection)

    const nodeArray = Array.from(iter)
    for (const node of nodeArray) {
      expect(node.isNode()).toBe(true)
    }

    const idsInIterator = new Set(nodeArray.map(node => node.id()))
    expect(idsInIterator).toEqual(new Set(nodeIds))
  })

  it('shuffles the nodes', () => {
    const nodeIds = R.times(() => String(Math.random()), 100)
    const nodes = nodeIds.map(id => ({
      group: 'nodes',
      data: {
        id: id,
      }
    }))
    const collection = cytoscape({ elements: nodes }).nodes()

    // Shuffle 10 times and expect each shuffle to be different from other shuffles and
    // from the original ordering.
    // NOTE: This test has a very small chance of failing which decreases with the number of nodes.
    const orders = new Set([ serializeOrdering(R.range(0, nodeIds.length)) ])
    R.times(
      () => {
        const ordering = serializeOrdering(shuffleAndExtractOrdering())
        expect(orders.has(ordering)).toBe(false)

        orders.add(ordering)
      },
      10
    )

    // Returns an array such that each element is that node's index in the unshuffled collection.
    function shuffleAndExtractOrdering () {
      const iter = LPA.getShuffledNodeIterator(collection)
      return Array.from(iter).map(node => {
        const nodeId = node.id()
        return nodeIds.indexOf(nodeId)
      })
    }

    // Returns a string such that another ordering array with the same elements in the same order
    // will have the same serialization.
    function serializeOrdering (ordering) {
      return ordering.join(',')
    }
  })
})

describe('getInitialLabeling', () => {
  it('returns a unique label for each node', () => {
    const graph = cytoscape({
      elements: [{
        group: 'nodes',
        data: {
          id: 'A',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'B',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'C',
        },
      }, {
        group: 'nodes',
        data: {
          id: 'D',
        },
      }]
    })
    const labels = LPA.getInitialLabeling(graph)
    expect(labels).toEqual(mapFromObject({
      A: 'A',
      B: 'B',
      C: 'C',
      D: 'D',
    }))
  })
})
