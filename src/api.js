const R = require('ramda')
const axios = require('axios')

const models = require('./models')

const SlackApi = token => ({
  GetConversationHistory (conversationId, {
    cursor,
    start,
    end,
  } = {}) {
    const startTimeSeconds = start && new Date(start).getTime() / 1000
    const endTimeSeconds = end && new Date(end).getTime() / 1000
    return axios({
      url: 'https://slack.com/api/conversations.history',
      params: {
        token: token,
        channel: conversationId,
        cursor: cursor,
        latest: endTimeSeconds,
        oldest: startTimeSeconds,
        limit: 500,
      }
    })
  },

  GetAllUsers ({ cursor } = {}) {
    return axios({
      url: 'https://slack.com/api/users.list',
      params: {
        token: token,
        cursor: cursor,
      }
    })
  },

  GetAllPublicChannels ({ cursor } = {}) {
    return axios({
      url: 'https://slack.com/api/channels.list',
      params: {
        token: token,
        limit: 0,
        cursor: cursor,
      }
    })
  },

  GetMembersForChannel (channelId, { cursor } = {}) {
    return axios({
      url: 'https://slack.com/api/conversations.members',
      params: {
        token: token,
        channel: channelId,
        limit: 500,
        cursor: cursor,
      }
    })
  },
})

const slackApiForTeam = async team_id => {
  const team = await getTeamByTeamId(team_id)
  return {
    slack: SlackApi(team.token),
    team: team,
  }
}

module.exports.getTeams = async () => {
  return models.Team.find({})
}

const getTeamByTeamId = module.exports.getTeamByTeamId = async teamId => {
  return models.Team.findOne({ team_id: teamId })
}

module.exports.createTeam = async team => {
  return (new models.Team(team)).save()
}

const getChannels = module.exports.getChannels = async teamId => {
  const team = await getTeamByTeamId(teamId)
  return models.Channel.find({ team: team._id })
}

module.exports.getChannelByChannelId = async channelId => {
  return models.Channel.find({ channel_id: channelId })
}

module.exports.loadMessagesForTeam = async team_id => {
  const { team } = await slackApiForTeam(team_id)

  const channels = await getChannels(team_id)

  // Loading messages between 1 August 2017 and the present.
  const start = new Date(2017, 7, 1)

  console.log(`Loading messages for ${channels.length} channels...`)
  let channelsRemaining = channels.length
  const timer = setInterval(
    () => console.log(`${channelsRemaining}/${channels.length} channels remaining to process...`),
    2000
  )

  let failedChannels = []
  let writeFailures = 0
  const saveMessages = Promise.resolve()

  for (const channel of channels) {
    if (channel.name.match(/alerts/) || channel.name.match(/jira$/) || channel.name.match(/jiraall/)) {
      console.log(`Skipping channel ${channel.name}`)
      channelsRemaining = channelsRemaining - 1
      continue
    }

    try {
      const messages = await loadChannelMessagesForTeam(team_id, channel.channel_id, start)

      // Create & update messages in bulk
      // It would take ages to issue a bunch of findOneAndUpdates()
      const updateOperations = messages.map(message => {
        const id = message.user || message.bot_id
        return ({
            updateOne: {
              filter: {
                user_id: id,
                ts: message.ts,
                team: team._id,
              },
              update: {
                user_id: id,
                ts: message.ts,
                text: message.text,
                reactions: message.reactions,
                replies: message.replies,
                channel: channel.channel_id,
                team: team._id,
              },
              upsert: true,
              setDefaultsOnInsert: true,
            }
          }
        )
      })

      if (updateOperations.length > 0) {
        // Enqueue background processing of message writes
        saveMessages
          .then(() => models.Message.bulkWrite(updateOperations))
          .catch(() => writeFailures += updateOperations.length)
      }
    } catch (err) {
      console.error(`Failed channel ${channel.name}`)
      failedChannels.push(channel.name)
    } finally {
      channelsRemaining = channelsRemaining - 1
    }
  }

  clearInterval(timer)
  console.log('Finished loading messages.')

  console.log(`Failed channels (${failedChannels.length}):`)
  console.log(failedChannels)

  console.log('Waiting for writes to finish.')

  await saveMessages
  console.log(`${writeFailures} errors during processing.`)
}

// Traverses all of the messages in the channel for the given time frame
// start is the timestamp of the oldest message
// end is the timestamp of the latest message
const loadChannelMessagesForTeam = module.exports.loadChannelMessagesForTeam = async (team_id, channelId, start, end) => {
  const { slack } = await slackApiForTeam(team_id)

  return await followCursor(
    cursor => slack.GetConversationHistory(channelId, { cursor, start, end }),
    (result, response) => arrayConcatMutate(result, response.messages)
  )
}

// Traverses all of the users in the slack team
module.exports.loadUsersForTeam = async team_id => {
  const { slack, team } = await slackApiForTeam(team_id)

  const response = (await slack.GetAllUsers()).data
  const users = response.members
  const realUsers = users.filter(user => !user.deleted && !user.is_bot)

  // Create & update users in bulk
  // It would take ages to issue a bunch of findOneAndUpdates()
  const updateOperations = realUsers.map(user => ({
      updateOne: {
        filter: {
          user_id: user.id,
        },
        update: {
          user_id: user.id,
          name: user.profile.real_name,
          slack_data: user,
          team: team._id,
        },
        upsert: true,
        setDefaultsOnInsert: true,
      }
    }
  ))

  return await models.User.bulkWrite(updateOperations)
}

// Traverses all of the channels in the slack team
module.exports.loadChannelsForTeam = async team_id => {
  const { slack, team } = await slackApiForTeam(team_id)

  const response = (await slack.GetAllPublicChannels()).data
  const channels = response.channels

  console.log('Channel length', channels.length)

  // Separate API for fetching members of each channel
  for (const channel of channels) {
    const members = await followCursor(
      cursor => slack.GetMembersForChannel(channel.id, { cursor: cursor }),
      (result, response) => result.concat(response.members)
    )
    channel.members = members
  }

  // Create & update channels in bulk
  // It would take ages to issue a bunch of findOneAndUpdates()
  const updateOperations = channels.map(channel => ({
      updateOne: {
        filter: {
          channel_id: channel.id,
        },
        update: {
          channel_id: channel.id,
          name: channel.name,
          members: channel.members,
          slack_data: channel,
          team: team._id,
        },
        upsert: true,
        setDefaultsOnInsert: true,
      }
    }
  ))

  return await models.Channel.bulkWrite(updateOperations)
}

const atMentionRegexp = /<@\w+>/g
const extractAtMentionRegexp = /<@(\w+)>/

// Traverse the slack data, looking for mentions within messages.
// Assumes that users, channels, & messages have already been loaded.
// TODO: handle a single message with multiple mentions of the same user
module.exports.loadMentions = async team_id => {
  const team = await getTeamByTeamId(team_id)

  const users = await models.User.find({ team: team._id })
  console.log('user length', users.length)

  const usersById = new Map()
  for (const user of users) {
    usersById.set(user.user_id, user)
  }

  const messages = await models.Message.find({
    team: team._id,
    text: {
      $regex: /<@/,

      // Filter out system messages
      $not: {
        $in: [
          /uploaded a file/,
          /has joined the channel/,
          /shared a file/,
          /has left the channel/,
          /has renamed the channel/,
          /set the channel topic/
        ]
      }
    }
  })

  const mentionsByUser = new Map()
  const getMentionsForUser = user_id => {
    return mentionsByUser.has(user_id)
      ? mentionsByUser.get(user_id)
      : mentionsByUser.set(user_id, new Map()).get(user_id)
  }

  // Increments the value of a key in a map by some amount.
  // If the key isn't set, sets the value equal to n.
  const incrementMentions = (n, key, map) => {
    const currentValue = map.has(key)
      ? map.get(key)
      : 0
    map.set(key, currentValue + n)
    return map
  }

  for (const message of messages) {
    // User ids surrounded with <@ >
    const wrappedMentionedIds = message.text.match(atMentionRegexp)
    if (!wrappedMentionedIds || R.isEmpty(wrappedMentionedIds)) {
      continue
    }

    // Just the raw id within the <@ >
    const mentionedIds = wrappedMentionedIds
      .map(wrappedId => wrappedId.match(extractAtMentionRegexp)[1])

    // Skip if we can't determine the id
    // For file mentions, the message won't have a user_id field, but we
    // can still determine the user_id.
    const currentUserId = getUserIdForMessage(message, mentionedIds)
    if (!currentUserId) {
      console.warn('Malformed message')
      console.log(message)
      continue
    }

    const currentUserMentions = getMentionsForUser(currentUserId)

    // Skip mentions of yourself
    const mentionsOtherUsers = mentionedIds.filter(id => id !== currentUserId)

    // Track mentions of others
    mentionsOtherUsers.forEach(otherUserId => {
      incrementMentions(1, otherUserId, currentUserMentions)
    })
  }

  // Save mentions for users
  for (const [user_id, mentionsOfOthers] of mentionsByUser) {
    const user = await models.User.findOne({ user_id: user_id })

    // Skip users we don't know about (deleted, etc.)
    if (!user) continue

    // Build the mentions object for storage
    // WARNING: wipes the previous mentions
    user.mentions = {}

    for (const [other_user_id, mentionCount] of mentionsOfOthers) {
      const otherUser = await models.User.findOne({ user_id: other_user_id })

      // Skip users we don't know about (deleted, etc.)
      if (!otherUser) continue

      // Store mentions
      user.mentions[other_user_id] = mentionCount
    }

    await user.save()
  }
}

const isFileCommentRegexp = /^<@\w+> commented on/
// Extracts the user id from message, handling edge cases like
// file comments.
// Returns nil if no user id could be extracted.
function getUserIdForMessage (message, mentionedIds) {
  // Straightforward: user_id attached to the message
  if (message.user_id) {
    return message.user_id
  }

  // See if it's a file comment
  if (Boolean(message.text.match(isFileCommentRegexp))) {
    return mentionedIds[0]
  }

  // Otherwise, we don't know the current user id
  return null
}

// Build the network graph from pre-loaded Slack data.
// Assumes that users, channels, & messages have already been loaded.
// Also assumes that mentions have been computed.
module.exports.loadNetwork = async team_id => {
  const team = await getTeamByTeamId(team_id)

  const users = await models.User.find({ team: team._id })

  for (const user of users) {

  }
}

// Get thread counts for other users
const getThreadRelation = async user => {
  const allThreadsForUser = await models.Message.find({
    $and: [
      // The message must have some replies
      { replies: { $ne: null } },

      {
        $or: [
          // The user started the thread
          { user_id: user.user_id },

          // Or the user participated somewhere in the thread
          {
            replies: {
              $elemMatch: {
                $elemMatch: {
                  user: user.user_id
                }
              }
            }
          }
        ]
      }
    ]
  })
  return getThreadRelationForThreads(user, allThreadsForUser)
}

// Get thread counts for other users
const getThreadRelationForThreads = module.exports.getThreadRelationForThreads = (user, allThreadsForUser) => {
  const threadCountsbyUser = new Map()

  // Increments the value of a key in a map by some amount.
  // If the key isn't set, sets the value equal to n.
  const incrementThreads = (n, key, map) => {
    const currentValue = map.has(key)
      ? map.get(key)
      : 0
    map.set(key, currentValue + n)
    return map
  }

  // User didn't participate in any threads
  if (!allThreadsForUser) {
    return threadCountsbyUser
  }

  for (const thread of allThreadsForUser) {
    // Skip empty threads
    if (!thread.replies || R.isEmpty(thread.replies)) {
      continue
    }

    // Need to determine if the user actually participated in this thread.
    // Usually this is true (the query already does this), but this function supports
    // threads that the user hasn't participated in.
    let participatedInThread = thread.user_id === user.user_id

    // Keep track of the counts within the thread.
    // We might not add them to the total if the user didn't participate.
    const relationForThread = new Map()

    // Don't double count users in the thread.
    // The current user's id may be in this set.
    const countedUsers = new Set()

    // Someone else started the thread
    if (thread.user_id && thread.user_id !== user.user_id) {
      incrementThreads(1, thread.user_id, relationForThread)
    }

    countedUsers.add(thread.user_id)

    // Handle replies.
    // Note: replies needs to be non-nil and non-empty, and needs to contain 1-tuples of objects.
    for (const [{ user: replyUserId }] of thread.replies) {
      participatedInThread = participatedInThread || replyUserId === user.user_id

      // Skip if we've already counted this user
      if (countedUsers.has(replyUserId)) {
        continue
      }

      // A reply from someone else
      if (replyUserId && replyUserId !== user.user_id) {
        incrementThreads(1, replyUserId, relationForThread)
        countedUsers.add(replyUserId)
      }
    }

    // If the current user did participate, add the thread relation values to the total.
    if (participatedInThread) {
      for (const [user_id, count] of relationForThread) {
        incrementThreads(count, user_id, threadCountsbyUser)
      }
    }
  }

  return threadCountsbyUser
}

const isNonEmptyString = R.allPass([
  x => typeof x === 'string',
  R.complement(R.isEmpty),
])

const getNextCursor = R.path(['response_metadata', 'next_cursor'])

// Keeps making a Slack api request with new cursors until all of the data
// has been retrieved.
// Accumulates the results with the supplied reducer function.
//
// makeRequestWithCursor() is called with a nil value for the first call.
// makeRequestWithCursor() must return a raw axios request
//
// accumulate() is called with:
//    accumulate(resultSoFar, currentResponseBody)
async function followCursor (makeRequestWithCursor, accumulate) {
  let result = []

  let moreMessages = true
  let nextCursor = undefined
  while (moreMessages) {
    const response = await retryWithBackoff(() => makeRequestWithCursor(nextCursor))
    result = accumulate(result, response.data)

    nextCursor = getNextCursor(response.data)
    moreMessages = isNonEmptyString(nextCursor)
  }

  return result
}

async function retryWithBackoff (operation, retries = 7) {
  const failed = Symbol('failed')

  let tries = retries
  let result = failed
  let lastError = null
  while (result === failed && tries > 0) {
    try {
      result = await operation()
    } catch (err) {
      lastError = err

      const duration = Math.pow(2, retries - tries)
      console.warn(`Rate limited. Waiting ${duration} seconds...`)
      tries = tries - 1
      await delay(duration * 1000)
    }
  }
  return result === failed
    ? Promise.reject(lastError)
    : result
}

// Concatenates dest to src, mutating src.
function arrayConcatMutate (src, dest) {
  for (const element of dest) {
    src.push(element)
  }
  return src
}

function delay (duration) {
  return new Promise(resolve => setTimeout(
    () => resolve(),
    duration
  ))
}
