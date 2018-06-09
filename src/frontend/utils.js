import * as R from 'ramda'
import * as Recompose from 'recompose'
import * as Rx from 'rxjs'

// Marks a CSS-in-JS style as important
export const important = style => {
  if (typeof style === 'object') {
    return R.map(important, style)
  }

  return `${style} !important`
}

// Create stream-components with RxJS streams
export const componentFromStream = Recompose.componentFromStreamWithConfig({
  fromESObservable: Rx.from,
  toESObservable: R.identity,
})
