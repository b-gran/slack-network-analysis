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