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

const slack = SlackApi(process.env.SLACK_TOKEN)

// Traverses all of the messages in the time frame
module.exports.traverseMessages = async (conversationId, start, end) => {
  let quota = 300
  let moreMessages = true
  let nextCursor = undefined
  while (moreMessages && quota) {
    const response = (await slack.GetConversationHistory(
      conversationId,
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
module.exports.traverseUsers = async () => {
  const response = (await slack.GetAllUsers()).data
  const users = response.members
  const realUsers = users.filter(user => !user.deleted && !user.is_bot)
  console.log(`GOT ${realUsers.length} USERS`)
}

module.exports.getTeams = async () => {
  return models.Team.find({})
}

module.exports.getTeamByTeamId = async teamId => {
  return models.Team.findOne({ team_id: teamId })
}

module.exports.createTeam = async team => {
  return (new models.Team(team)).save()
}
