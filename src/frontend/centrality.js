import * as R from 'ramda'

// It's expensive to compute the percentiles, so this module provides a factory so that the
// percentiles can be re-used.
export function centralityFactory (cy) {
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
    R.subtract
  )(cy.nodes())

  return node => colorWeightPercentileByNode.get(node)
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
