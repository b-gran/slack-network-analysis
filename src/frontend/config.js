import getConfig from 'next/config'
import * as R from 'ramda'
import { observable } from 'mobx'
import K from 'fast-keys'

export const SERVER_URL = getConfig().publicRuntimeConfig.SERVER_URL

export const mergeInitialState = (initialState, prevState) => {
  const sameKeys = R.equals(
    K(initialState).toSet(),
    K(prevState).toSet(),
  )

  if (sameKeys) {
    return prevState
  }

  return observable(R.merge(
    initialState,
    prevState
  ))
}

export function mobxHmrObservable (_module) {
  return (...args) => {
    const initialState = observable(...args)
    const state = (_module.hot && _module.hot.data && _module.hot.data.state) ?
      mergeInitialState(initialState, _module.hot.data.state) :
      initialState

    if (_module.hot) {
      _module.hot.dispose(data => {
        data.state = state
        return data
      })
    }

    return state
  }
}