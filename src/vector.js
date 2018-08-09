// Converts a node to an N-dimensional vector, where N is the
// number of vertices in the graph.
export function toVector (node, canonicalNodeIdArray) {
  const connectedNodesCollection = node.neighborhood().nodes()

  const connectedNodeIds = new Set()
  connectedNodesCollection.forEach(connectedNode => {
    connectedNodeIds.add(connectedNode.data('id'))
  })

  return canonicalNodeIdArray.map(nodeId => connectedNodeIds.has(nodeId) ? 1 : 0)
}

// Get an Array of node ids from a cytoscape graph for use with toVector()
export function getNodeIdArray (cyGraph) {
  return cyGraph.nodes().toArray().map(node => node.data('id'))
}