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

// Traverses all of the messages in the time frame
module.exports.loadChannelMessagesForTeam = async (team_id, channelId, start, end) => {
  const { slack } = await slackApiForTeam(team_id)

  let quota = 300
  let moreMessages = true
  let nextCursor = undefined
  while (moreMessages && quota) {
    const response = (await slack.GetConversationHistory(
      channelId,
      { start, end, cursor: nextCursor, }
    )).data
    console.log(`GOT ${response.messages.length} MESSAGES`)
    response.messages.forEach(message => console.log(`TS: ${message.ts}`))

    moreMessages = response.has_more
    nextCursor = moreMessages && response.response_metadata.next_cursor
    console.log(`CURSOR ${nextCursor}`)
  }
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
