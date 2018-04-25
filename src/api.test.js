const Api = require('./api')
const R = require('ramda')

const DAY_MS = (60 * 60 * 24) * 1000

describe('getThreadRelationForThreads', () => {
  const user = {
    user_id: 'foo',
    name: 'bar',
    slack_data: {},
    team: 'objectid',
    mentions: {},
  }

  it('returns an empty Map if there are no threads', () => {
    // Nil threads
    expect(Api.getThreadRelationForThreads(user, null)).toEqual(new Map())

    // Empty threads
    expect(Api.getThreadRelationForThreads(user, [])).toEqual(new Map())
  })

  it('counts the number of threads the user participated in when each replier posts only once', () => {
    const threads = [
      makeThread(user.user_id, [ 'A', 'B', 'C', 'D']),
      makeThread(user.user_id, [ 'A', 'B', 'C' ]),
      makeThread(user.user_id, [      'B', 'C', 'D']),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(user, threads)).toEqual(expected)
  })

  it(`ignores a user's own posts in a thread`, () => {
    const threads = [
      makeThread(user.user_id, [ 'A', 'B', 'C', 'D', user.user_id ]),
      makeThread(user.user_id, [ 'A', 'B', 'C' ]),
      makeThread(user.user_id, [      'B', 'C', 'D', user.user_id ]),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(user, threads)).toEqual(expected)
  })

  it('counts the number of threads the user participated in when each replier posts n times', () => {
    const threads = [
      makeThread(user.user_id, [ 'A', 'B', 'C', 'D', 'A', 'A', user.user_id, user.user_id ]),
      makeThread(user.user_id, [ 'A', 'B', 'C',                'B', 'C', 'C' ]),
      makeThread(user.user_id, [      'B', 'C', 'D',           'B', 'C', 'C', 'D']),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(user, threads)).toEqual(expected)
  })

  const objectToMap = R.pipe(R.toPairs, R.constructN(1, Map))

  // Shape:
  // {
  //   text: String,
  //   user_id: String,
  //   replies: [
  //     [
  //       {
  //         user: String,
  //         ts: String,
  //       }
  //     ],
  //   ],
  // }
  function makeThread (threadStarterId, replierIds) {
    return {
      text: String(Math.random()),
      user_id: threadStarterId,
      replies: replierIds.map(replierId => [{
        user: replierId,
        ts: randomSlackTimestamp(),
      }])
    }
  }

  const randomSlackTimestamp = R.pipe(randomDateWithinLastDay, toSlackTimestamp)

  // JS Dates are in ms since unix epoch.
  // Slack dates are in seconds since unix epoch (with 6 decimal places).
  function toSlackTimestamp (date) {
    return date.getTime() / 1000
  }

  function randomDateWithinLastDay () {
    const now = Date.now()
    const randomDateTimestamp = now - (Math.random() * DAY_MS)
    return new Date(randomDateTimestamp)
  }
})