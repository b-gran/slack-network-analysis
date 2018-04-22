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

  GetAllUsers () {
    return axios({
      url: 'https://slack.com/api/users.list',
      params: {
        token: token,
      }
    })
  }
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

