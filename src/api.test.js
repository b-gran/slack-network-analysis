const Api = require('./api')
const R = require('ramda')

const { mapFromObject, sample } = require('./utils')

const DAY_MS = (60 * 60 * 24) * 1000

const teamId = 'objectid'
function makeUser (id) {
  return {
    user_id: id,
    name: `${id} name`,
    slack_data: {},
    team: teamId,
    mentions: {},
  }
}

describe('getThreadRelationForThreads', () => {
  const userFoo = makeUser('foo')
  const userBar = makeUser('bar')

  it('returns an empty Map if there are no threads', () => {
    // Nil threads
    expect(Api.getThreadRelationForThreads(userFoo, null)).toEqual(new Map())

    // Empty threads
    expect(Api.getThreadRelationForThreads(userFoo, [])).toEqual(new Map())
  })

  it('counts the number of threads the user participated in when each replier posts only once', () => {
    const threads = [
      makeThread(userFoo.user_id, [ 'A', 'B', 'C', 'D']),
      makeThread(userFoo.user_id, [ 'A', 'B', 'C' ]),
      makeThread(userFoo.user_id, [      'B', 'C', 'D']),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(userFoo, threads)).toEqual(expected)
  })

  it(`ignores a user's own posts in a thread`, () => {
    const threads = [
      makeThread(userFoo.user_id, [ 'A', 'B', 'C', 'D', userFoo.user_id ]),
      makeThread(userFoo.user_id, [ 'A', 'B', 'C' ]),
      makeThread(userFoo.user_id, [      'B', 'C', 'D', userFoo.user_id ]),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(userFoo, threads)).toEqual(expected)
  })

  it('counts the number of threads the user participated in when each replier posts n times', () => {
    const threads = [
      makeThread(userFoo.user_id, [ 'A', 'B', 'C', 'D', 'A', 'A', userFoo.user_id, userFoo.user_id ]),
      makeThread(userFoo.user_id, [ 'A', 'B', 'C',                'B', 'C', 'C' ]),
      makeThread(userFoo.user_id, [      'B', 'C', 'D',           'B', 'C', 'C', 'D']),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(userFoo, threads)).toEqual(expected)
  })

  it('does not count empty threads', () => {
    const threads = [
      makeThread(userFoo.user_id, [ 'A', 'B', 'C', 'D', 'A', 'A', userFoo.user_id, userFoo.user_id ]),
      makeThread(userFoo.user_id, [ 'A', 'B', 'C',                'B', 'C', 'C' ]),
      makeThread(userFoo.user_id, [      'B', 'C', 'D',           'B', 'C', 'C', 'D']),
      makeThread(userFoo.user_id, []),
      makeThread(userFoo.user_id, []),
      makeThread('A', []),
      makeThread('B', []),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(userFoo, threads)).toEqual(expected)
  })

  it('does not count threads the user did not participate in', () => {
    const threads = [
      makeThread(userFoo.user_id, [ 'A', 'B', 'C', 'D', 'A', 'A', userFoo.user_id, userFoo.user_id ]),
      makeThread(userFoo.user_id, [ 'A', 'B', 'C',                'B', 'C', 'C' ]),
      makeThread(userFoo.user_id, [      'B', 'C', 'D',           'B', 'C', 'C', 'D']),

      makeThread('A',             [ 'A', 'B', 'C',                'B', 'C', 'C' ]),
      makeThread('B',             [      'B', 'C', 'D',           'B', 'C', 'C', 'D']),
      makeThread('C',             [ 'A', 'B', 'C',                'B', 'C', 'C' ]),
      makeThread('D',             [      'B', 'C', 'D',           'B', 'C', 'C', 'D']),
    ]

    const expected = objectToMap({
      A: 2,
      B: 3,
      C: 3,
      D: 2,
    })

    expect(Api.getThreadRelationForThreads(userFoo, threads)).toEqual(expected)
  })

  it('for a given set of threads, satisfies: A (x) B = B (x) A, where (x) is the thread relation', () => {
    const allUserIds = [ 'A', 'B', 'C', 'D', 'E', userFoo.user_id, userBar.user_id ]

    const threads = R.times(
      () => makeThread(
        sample(allUserIds),
        R.times(
          () => sample(allUserIds),
          (Math.random() * 15)|0
        )
      ),
      200
    )

    // Map of user id => relation
    const threadRelationsById = R.zipObj(
      allUserIds,
      allUserIds.map(id => Api.getThreadRelationForThreads(makeUser(id), threads))
    )

    // Each pair must satisfy the rule (including A (x) A = A (x) A)
    const allPairs = R.xprod(allUserIds, allUserIds)
    allPairs.forEach(([user1, user2]) =>
      expect(threadRelationsById[user1].get(user2)).toEqual(threadRelationsById[user2].get(user1))
    )
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
})

describe('getEdgesForUsers', () => {
  it('throws if incorrect dependencies are provided', async () => {
    expect.assertions(5)

    expect(Api.getEdgesForUsers([], undefined)).rejects.toBeTruthy()
    expect(Api.getEdgesForUsers([], {})).rejects.toBeTruthy()
    expect(Api.getEdgesForUsers([], { getThreadRelationForUser: jest.fn() })).rejects.toBeTruthy()
    expect(Api.getEdgesForUsers([], { getThreadRelationForUser: jest.fn(), usersById: 'foo' })).rejects.toBeTruthy()
    expect(Api.getEdgesForUsers([], { getThreadRelationForUser: 'foo', usersById: jest.fn() })).rejects.toBeTruthy()
  })

  it(`doesn't create edges if the users have no mentions or threads in common`, async () => {
    expect.assertions(2)

    const users = [makeUser('foo'), makeUser('bar')]
    const usersById = Api.keyByMap(R.prop('user_id'), users)

    const [edges, edgeList] = await Api.getEdgesForUsers(users,
      {
        usersById,
        getThreadRelationForUser: () => new Map()
      }
    )

    expect(edges).toEqual(new Map())
    expect(edgeList).toEqual([])
  })

  it(`creates edges with the correct weight`, async () => {
    expect.assertions(5)

    const foo = makeUser('foo')
    foo.mentions = {
      bar: 9,
    }

    const bar = makeUser('bar')
    bar.mentions = {
      foo: 14,
    }

    const threadRelationsByUserId = mapFromObject({
      foo: mapFromObject({
        bar: 7,
      }),
      bar: mapFromObject({
        foo: 7,
      })
    })

    const users = [foo, bar]
    const usersById = Api.keyByMap(R.prop('user_id'), users)

    const [edges, edgeList] = await Api.getEdgesForUsers(users,
      {
        usersById,
        getThreadRelationForUser: ({ user_id }) => threadRelationsByUserId.get(user_id),
      }
    )

    const fooBarWeight = Api.getEdgeWeight(
      foo.mentions.bar,
      bar.mentions.foo,
      threadRelationsByUserId.get('foo').get('bar')
    )

    expect(edges).toEqual(mapFromObject({
      foo: mapFromObject({
        bar: fooBarWeight,
      }),
      bar: mapFromObject({
        foo: fooBarWeight,
      }),
    }))

    expect(edgeList.length).toEqual(1)
    const [edge] = edgeList
    expect(edge.includes('foo')).toBeTruthy()
    expect(edge.includes('bar')).toBeTruthy()
    expect(edge[2]).toBe(fooBarWeight)
  })

  it(`supports nil mentions`, async () => {
    expect.assertions(5)

    const foo = makeUser('foo')
    delete foo.mentions

    const bar = makeUser('bar')
    delete bar.mentions

    const threadRelationsByUserId = mapFromObject({
      foo: mapFromObject({
        bar: 7,
      }),
      bar: mapFromObject({
        foo: 7,
      })
    })

    const users = [foo, bar]
    const usersById = Api.keyByMap(R.prop('user_id'), users)

    const [edges, edgeList] = await Api.getEdgesForUsers(users,
      {
        usersById,
        getThreadRelationForUser: ({ user_id }) => threadRelationsByUserId.get(user_id),
      }
    )

    const fooBarWeight = Api.getEdgeWeight(0, 0, threadRelationsByUserId.get('foo').get('bar'))

    expect(edges).toEqual(mapFromObject({
      foo: mapFromObject({
        bar: fooBarWeight,
      }),
      bar: mapFromObject({
        foo: fooBarWeight,
      }),
    }))

    expect(edgeList.length).toEqual(1)
    const [edge] = edgeList
    expect(edge.includes('foo')).toBeTruthy()
    expect(edge.includes('bar')).toBeTruthy()
    expect(edge[2]).toBe(fooBarWeight)
  })

  it('returns a map such that A→B = B→A', async () => {
    const userIds = R.times(String, 20)

    const users = userIds.map(userId => {
      const user = makeUser(userId)
      user.mentions = R.pipe(
        R.reject(R.equals(userId)),
        R.converge(R.zipObj, [R.identity, R.map(() => (Math.random() * 15)|0)]),
      )(userIds)
      return user
    })

    const usersById = Api.keyByMap(R.prop('user_id'), users)

    const getOrCreate = (key, map) => {
      if (!map.has(key)) {
        map.set(key, new Map())
      }
      return map.get(key)
    }

    // All unique (undirected) [ a, b ] pairs s.t. a != b
    const uniquePairs = R.pipe(
      // de-dupe undirected pairs
      R.map(R.sortBy(R.flip(parseInt)(10))), R.uniq,

      // remove [ n, n ] pairs
      R.reject(R.converge(R.equals, [ R.nth(0), R.nth(1) ])),
    )(R.xprod(userIds, userIds))

    // Create a map with random thread counts
    const threadRelation = new Map()
    uniquePairs.forEach(([src, dest]) => {
      // Always a non-zero thread count so the number of edges is deterministic
      const threadCount = ((Math.random() * 14)|0) + 1

      const srcThreadCount = getOrCreate(src, threadRelation)
      const destThreadCount = getOrCreate(dest, threadRelation)
      srcThreadCount.set(dest, threadCount)
      destThreadCount.set(src, threadCount)
    })

    const [edges, edgeList] = await Api.getEdgesForUsers(users, {
      getThreadRelationForUser: user => threadRelation.get(user.user_id),
      usersById
    })

    // A→B = B→A assertion for every unique pair
    uniquePairs.forEach(([src, dest]) => {
      const edgeSrcDest = edges.get(src).get(dest)
      const edgeDestSrc = edges.get(dest).get(src)
      expect(edgeSrcDest).toBe(edgeDestSrc)
    })

    // Correct number of unique edges
    expect(edgeList.length).toBe(userIds.length * (userIds.length - 1) / 2)
  })
})

describe('getEdgeWeight', () => {
  it('returns 0 if the users have no mentions or threads in common', () => {
    expect(Api.getEdgeWeight(0, 0, 0)).toBe((0))
  })

  it('returns the correct value', () => {
    const outgoing = 1.53453
    const incoming = 9.23894
    const threadRelation = 129.41847

    const expectedWeight = 1/(2 * outgoing + 2 * incoming + threadRelation)

    expect(Api.getEdgeWeight(outgoing, incoming, threadRelation)).toBe(expectedWeight)
  })
})

describe('keyByMap', () => {
  it('passes each element through the iteratee and returns a Map', () => {
    const iterableArray = [{ x: 'foo' }, { x: 'bar' }, { x: 'baz' }, { x: 'fraz' }]
    const iterableSet = new Set(iterableArray)

    const expectedMap = new Map(R.toPairs({
      'foo': { x: 'foo' },
      'bar': { x: 'bar' },
      'baz': { x: 'baz' },
      'fraz': { x: 'fraz' },
    }))

    const mapFromArray = Api.keyByMap(R.prop('x'), iterableArray)
    const mapFromSet = Api.keyByMap(R.prop('x'), iterableSet)
    expect(mapFromArray).toEqual(expectedMap)
    expect(mapFromSet).toEqual(expectedMap)
  })
})

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

