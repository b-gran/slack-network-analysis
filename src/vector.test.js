import * as R from 'ramda'
import cytoscape from 'cytoscape'
import { getNodeIdArray, graphToVectors, toVector, tsne } from './vector'

const emptyGraph = cytoscape({ headless: true })
const testGraph = cytoscape({
  headless: true,
  elements: [
    node('a'), node('b'), node('c'), node('d'), node('e'),
    edge('1', 'a', 'b'), edge('2', 'a', 'c'), edge('3', 'b', 'd'),
    edge('4', 'e', 'c'), edge('5', 'e', 'd')
  ],
})

describe('vector', () => {
  describe('getNodeIdArray', () => {
    it('returns an array of node ids', () => {
      expect(getNodeIdArray(testGraph.nodes())).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    it('returns an empty array', () => {
      expect(getNodeIdArray(emptyGraph.nodes())).toEqual([])
    })
  })

  describe('toVector', () => {
    // Each element i the vector is a 1 if there is an edge between the input
    // node and the corresponding node in the canonical node id array, or 0
    // otherwise.
    it('converts the node to a vector', () => {
      const canonicalNodeIdArray = ['a', 'b', 'c', 'd', 'e']
      expect(toVector(testGraph.getElementById('a'), canonicalNodeIdArray)).toEqual([
        0, 1, 1, 0, 0
      ])
      expect(toVector(testGraph.getElementById('b'), canonicalNodeIdArray)).toEqual([
        1, 0, 0, 1, 0
      ])
    })

    it('returns an empty vector', () => {
      const canonicalNodeIdArray = []
      expect(toVector(testGraph.getElementById('a'), canonicalNodeIdArray)).toEqual([])
    })
  })

  edge('1', 'a', 'b'), edge('2', 'a', 'c'), edge('3', 'b', 'd'),
    edge('4', 'e', 'c'), edge('5', 'e', 'd')

  describe('graphToVectors', () => {
    it('converts the graph to a list of vectors', () => {
      expect(graphToVectors(testGraph.nodes())).toEqual([
        [0, 1, 1, 0, 0],
        [1, 0, 0, 1, 0],
        [1, 0, 0, 0, 1],
        [0, 1, 0, 0, 1],
        [0, 0, 1, 1, 0],
      ])
    })
  })

  describe('tsne', () => {
    it('returns the nodes and node positions', () => {
      const nodes = testGraph.nodes().clone()
      const result = tsne(nodes)

      expect(R.prop('same', result.nodes) && result.nodes.same(nodes)).toBeTruthy()

      expect(Array.isArray(result.positions)).toBeTruthy()
      expect(result.positions.length).toBe(nodes.size())

      expect(Array.isArray(result.positions[0])).toBeTruthy()
      expect(result.positions[0].length).toBe(2)
    })

    it('updates the positions of the nodes', () => {
      const nodes = testGraph.nodes().clone()
      const result = tsne(nodes)

      for (let i = 0; i < nodes.size(); i++) {
        const node = nodes.eq(i)
        const { x, y } = node.position()
        expect([x, y]).toEqual(result.positions[i])
      }
    })
  })
})

function node (id) {
  return {
    group: 'nodes',
    data: {
      id,
    },
  }
}

function edge (id, source, target) {
  return {
    group: 'edges',
    data: {
      id,
      source,
      target,
    },
  }
}