import * as Rx from 'rxjs'
import * as R from 'ramda'

export const SELECT = 'SELECT'
export const UNSELECT = 'UNSELECT'

// Given a cytoscape graph, returns a stream that emits events
// when nodes are selected and unselected.
//
// * Emits SELECT when a single node is selected via `tap` event
// * Emits UNSELECT when any node or node collection is unselected
export default function (cy) {
  return Rx.Observable.create(observer => {
    const selectHandler = evt => {
      const node = evt.target
      observer.next({
        type: SELECT,
        position: node.renderedPosition(),
        node: node,
      })
    }

    const unselectHandler = evt => {
      const node = evt.target
      observer.next({
        type: UNSELECT,
        node: node,
      })
    }

    // Trigger unselect when the background or a non-node is clicked.
    const backgroundUnselectHandler = R.when(
      evt => (
        typeof evt.target === 'object' &&
        (
          evt.target === cy || // The entire graph is the target when the background is clicked
          !evt.target.isNode()
        )
      ),
      unselectHandler
    )

    cy.on('tap', 'node', selectHandler)
    cy.on('tapstart', backgroundUnselectHandler)
    cy.on('pan', unselectHandler)
    cy.on('zoom', unselectHandler)
    cy.on('resize', unselectHandler)

    return () => {
      cy.removeListener('tap', 'node', selectHandler)
      cy.removeListener('tapstart', backgroundUnselectHandler)
      cy.removeListener('pan', unselectHandler)
      cy.removeListener('zoom', unselectHandler)
      cy.removeListener('resize', unselectHandler)
    }
  })
}