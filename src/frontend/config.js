import getConfig from 'next/config'
import * as R from 'ramda'
import { observable } from 'mobx'

export const SERVER_URL = 'http://localhost:8080'
export const SLACK_TOKEN = getConfig().publicRuntimeConfig.SLACK_TOKEN

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