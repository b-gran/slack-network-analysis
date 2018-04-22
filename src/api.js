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

  let writeFailures = 0
  const saveMessages = Promise.resolve()

  for (const channel of channels) {
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

    channelsRemaining = channelsRemaining - 1
  }

  clearInterval(timer)
  console.log('Finished loading messages.')

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
    const response = (await makeRequestWithCursor(nextCursor)).data
    result = accumulate(result, response)

    nextCursor = getNextCursor(response)
    moreMessages = isNonEmptyString(nextCursor)
  }

  return result
}

// Concatenates dest to src, mutating src.
function arrayConcatMutate (src, dest) {
  for (const element of dest) {
    src.push(element)
  }
  return src
}
