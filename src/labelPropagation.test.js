import * as R from 'ramda'
import cytoscape from 'cytoscape'

import { mapFromObject } from './utils'
import { pickLabel } from './labelPropagation'

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

    expect(pickLabel(labels, source, neighbors)).toBe(labels.get(nodeId))
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

    let lastLabel = pickLabel(labelOtherNodes(source, neighbors, 'X'), source, neighbors)

    for (const nodeId of ['B', 'C']) {
      const source = graph.$(`#${nodeId}`)
      const neighbors = source.openNeighborhood().nodes()
      const labels = labelOtherNodes(source, neighbors, 'X')

      const chosenLabel = pickLabel(labels, source, neighbors)
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

      const chosenLabel = pickLabel(labels, source, neighbors)
      expect(chosenLabel).toBe(nodeId)
    }
  })
})

