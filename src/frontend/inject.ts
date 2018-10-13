import * as React from "react";
import { inject as mobxInject } from "mobx-react";
import { Omit } from './utils'

export function inject<D, Stores>(
  mapStoreToProps: (stores: Stores) => D
): <A extends D>(
  component: React.ComponentType<A>
) => React.SFC<Omit<A, keyof D> & Partial<D>>
export function inject<Stores, StoreNames extends keyof Stores, StoreNameParams extends StoreNames[]> (
  ...stores: StoreNameParams
): <A>(
  component: React.ComponentType<A & Pick<Stores, StoreNames>>
) => React.SFC<A>
export function inject(...args: any[]): any {
  return mobxInject(...args)
}

