import getConfig from 'next/config'
import * as R from 'ramda'
import { IObservableObject, observable } from 'mobx'
import K from 'fast-keys'
import Module = __WebpackModuleApi.Module
import { SetDeep } from './utils'

export const SERVER_URL = getConfig().publicRuntimeConfig.SERVER_URL

export function mergeInitialState <TState> (initialState: TState & IObservableObject, prevState: TState & IObservableObject): TState & IObservableObject {
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

type ModuleWithState <T> = SetDeep<Module, T, ['hot', 'data', 'state']>

export function mobxHmrObservable (_module: Module) {
  return <TState>(initialValue: TState): TState & IObservableObject => {
    const moduleWithState = _module as ModuleWithState<TState & IObservableObject>
    const initialState = observable(initialValue)
    const state = (moduleWithState.hot && moduleWithState.hot.data && moduleWithState.hot.data.state) ?
      mergeInitialState(initialState, moduleWithState.hot.data.state) :
      initialState

    if (moduleWithState.hot) {
      moduleWithState.hot.dispose(data => {
        data.state = state
        return data
      })
    }

    return state
  }
}