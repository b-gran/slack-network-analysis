import getConfig from 'next/config'
import * as R from 'ramda'
import { observable } from 'mobx'

export const SERVER_URL = getConfig().publicRuntimeConfig.SERVER_URL

export const mergeInitialState = (initialState, prevState) => {
  const sameKeys = R.equals(
    new Set(Object.keys(initialState)),
    new Set(Object.keys(prevState)),
  )

  if (sameKeys) {
    return prevState
  }

  return observable(R.merge(
    initialState,
    prevState
  ))
}