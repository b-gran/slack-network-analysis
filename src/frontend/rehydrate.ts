import { rehydrate } from 'glamor'

export const GLAMOR_ID_FIELD = 'ids'

declare const window:
  Window &
  {
    __NEXT_DATA__: {
      [GLAMOR_ID_FIELD]: string[],
    },
  } |
  undefined // if we're on the server

if (typeof window === 'object' && window) {
  rehydrate(window.__NEXT_DATA__[GLAMOR_ID_FIELD])
}
