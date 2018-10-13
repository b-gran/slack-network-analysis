import * as R from 'ramda'
import * as Recompose from 'recompose'
import * as Rx from 'rxjs'
import { CSSProperties } from 'react'
import { Subscribable } from 'recompose'

// Marks a CSS-in-JS style as important
export function important (style: string): string
export function important (style: CSSProperties): CSSProperties
export function important (style: CSSProperties | string): CSSProperties | string {
  if (typeof style === 'object') {
    return R.mapObjIndexed(important, style)
  }

  return `${style} !important`
}

// Create stream-components with RxJS streams
export const componentFromStream = Recompose.componentFromStreamWithConfig({
  fromESObservable <T> (observable: Subscribable<T>): Rx.Observable<T> {
    return Rx.from(observable as Rx.Subscribable<T>)
  },
  toESObservable: R.identity,
})

///////////////////////////////////

// Makes an input type nullable only if some other potentially nullable type is nullable.
// e.g.
//    PreserveNullable<'foo', 'bar'> == 'foo'
//    PreserveNullable<'foo', 'bar' | undefined> == 'foo' | undefined
export type PreserveNullable <TInput, MaybeNullable> = TInput | Extract<MaybeNullable, undefined>

// Omit some keys from an object.
// e.g.
//    Omit<{ foo: 1, bar: 2 }, 'bar'> == { foo: 1 }
export type Omit <T, K> = Pick<T, Exclude<keyof T, K>>

// Deep merge B into A.
export type DeepMerge <A, B> =
  // Slice of A unaffected by B
  Omit<A, keyof B> &

  // Recursively merged shared keys of A and B
  {
    [K in Extract<keyof B, keyof A>]:
      // We want to always guarantee that the merged value
      // is assignable to B, so we explicitly intersect
      // the merged value with B.
      PreserveNullable<
        (
          B[K] extends object ?
            DeepMerge<NonNullable<A[K]>, B[K]> :
            B[K]
        ) & B[K],
        A[K]
      >
  } &

  // Slice of B unaffected by A
  Omit<B, keyof A>

///////////////////////////////////

type NumberNameByValue = {
  0: '0',
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
}
type GetNumberName <N> = N extends keyof NumberNameByValue
  ? NumberNameByValue[N]
  : never

type NumberValueByName = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
}
type OnlyNumberName <N> = N extends keyof NumberValueByName
  ? N
  : never
type FiniteNumber = NumberValueByName[keyof NumberValueByName]
type PositiveNumber = Exclude<FiniteNumber, 0>

type MinusOne <N> = N extends NumberValueByName[keyof NumberValueByName] ? {
  0: never,
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
}[N] : number

type PlusOne <N> = N extends NumberValueByName[keyof NumberValueByName] ? {
  0: 1,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
  9: never,
}[N] : number

// The string values for the indices of an array.
// e.g.
//    Indices<[5, 6, 7, 8]> == '0' | '1' | '2' | '3'
type Indices <tuple extends any[]> = OnlyNumberName<keyof tuple>

// Extract the values of an array or array-like object.
// e.g.
//    ArrayValues<string[]> == string
//    ArrayValues<['a', 'b']> == 'a' | 'b'
//    ArrayValues<{ '0': 'foo', '1': 'bar' }> == 'foo' | 'bar'
type ArrayValues <T> = {
  [K in Extract<keyof T, keyof NumberValueByName>]: T[K]
}[Extract<keyof T, keyof NumberValueByName>]

// A type representing the tail of a fixed-length tuple.
// e.g.
//    Tail<['a', 'b', 'c']> == ['b', 'c']
//    Tail<[]> == []
type Tail <Tuple extends string[]> =
  // This type is still a tuple
  (string & Exclude<ArrayValues<Tuple>, Tuple[0]>)[] &

  {
    // Exclude the greatest index
    [K in Exclude<Indices<Tuple>, GetNumberName<MinusOne<Tuple['length']>>>]:

      // Shift each remaining index forward by one
      Tuple[
        PlusOne<NumberValueByName[K]>
      ]
  } &

  // The length of the new tuple is one smaller
  {
    length: Tuple['length'] extends 0
      ? 0
      : MinusOne<Tuple['length']>
  }

// A type representing an object with a nested property changed.
// The path to the property can be up to 9 path lengths longs.
// e.g.
//     SetDeep<
//       {
//         foo: {
//           bar: {}
//         },
//       },
//       'baz',
//       ['foo', 'bar', 'x']
//     > == {
//       foo: {
//         bar: {
//           x: 'baz'
//         }
//       }
//     }
export type SetDeep <Obj, Val, Path extends string[]> =
  // Base case: just setting one property
  Path['length'] extends 1 ?
    Omit<Obj, Path[0]> & { [K in Path[0]]: Val } :

  // Otherwise, it's a finite length path
  Path['length'] extends PositiveNumber ?
    // The properties that aren't affected by the path
    (Omit<Obj, Path[0]> &

    // The property affected by the path, if it's a property of the object
    {
      [K in Path[0] & keyof Obj]: PreserveNullable<
        SetDeep<NonNullable<Obj[K]>, Val, Tail<Path>>,
        Obj[K]
      >
    } &

    // The property affected by the path, if it's not a property of the object.
    // In this case, we recurse into an empty object.
    { [K in Exclude<Path[0], keyof Obj>]: SetDeep<{}, Val, Tail<Path>> }) :

  // If we don't know the path length, we can't recurse
  Obj

