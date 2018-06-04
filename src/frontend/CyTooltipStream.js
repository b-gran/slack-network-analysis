import * as Rx from 'rxjs'

export const SELECT = 'SELECT'
export const UNSELECT = 'UNSELECT'

// Given a cytoscape graph, returns a stream that emits events
// when nodes are selected and unselected.
//
// * Emits SELECT when a single node is selected via `tap` event
// * Emits UNSELECT when any node or node collection is unselected
export default function (cy) {
  return Rx.Observable.create(observer => {
    const tapHandler = evt => {
      const node = evt.target
      observer.next({
        type: SELECT,
        position: node.renderedPosition(),
        node: node,
      })
    }
    cy.on('tap', 'node', tapHandler)

    const unselectHandler = evt => {
      const node = evt.target
      observer.next({
        type: UNSELECT,
        node: node,
      })
    }
    const nodes = cy.nodes()
    nodes.on('unselect', unselectHandler)

    return () => {
      cy.removeListener('tap', 'node', tapHandler)
      nodes.removeListener('unselect', unselectHandler)
    }
  })
}