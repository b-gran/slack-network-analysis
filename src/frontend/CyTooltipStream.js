import * as Rx from 'rxjs'
import * as operators from 'rxjs/operators'
import * as R from 'ramda'

export const SELECT = 'SELECT'
export const UNSELECT = 'UNSELECT'

const isSelectEvent = R.pipe(R.prop('type'), R.equals(SELECT))

// Given a cytoscape graph, returns a stream that emits events
// when nodes are selected and unselected.
//
// * Emits SELECT when a single node is selected via `tap` event
// * Emits UNSELECT when any node or node collection is unselected
export default function (cy) {
  const $select = Rx.Observable.create(observer => {
    const selectHandler = evt => {
      const node = evt.target
      observer.next({
        type: SELECT,
        position: node.renderedPosition(),
        node: node,
      })
    }

    cy.on('tap', 'node', selectHandler)

    return () => cy.removeListener('tap', 'node', selectHandler)
  })

  const $unselect = Rx.Observable.create(observer => {
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

    cy.on('tapstart', backgroundUnselectHandler)
    cy.on('viewport', unselectHandler)

    return () => {
      cy.removeListener('tapstart', backgroundUnselectHandler)
      cy.removeListener('viewport', unselectHandler)
    }
  })

  return Rx.merge($select, $unselect).pipe(
    // Only emit events if we're selecting something, or going from selected -> unselected.
    operators.scan(
      (lastEvent, event) => (isSelectEvent(event) || isSelectEvent(lastEvent))
        ? event
        : null,
      null
    ),
    operators.filter(Boolean)
  )
}