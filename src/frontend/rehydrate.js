import { rehydrate } from 'glamor'

export const GLAMOR_ID_FIELD = 'ids'

if (typeof window === 'object' && window) {
  rehydrate(window.__NEXT_DATA__[GLAMOR_ID_FIELD])
}
