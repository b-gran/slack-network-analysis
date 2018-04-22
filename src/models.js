const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
  // The user's ID within Slack
  user_id: {
    type: String,
    required: true,
    unique: true,
  },

  // Users's real name
  name: {
    type: String,
    required: true,
  },

  // Raw user model data from Slack
  slack_data: {
    type: Object,
  },

  // Which team (within SNA) this user belongs to
  team: mongoose.SchemaTypes.ObjectId,
})

module.exports.User = mongoose.model('User', userSchema)

const userData = mongoose.Schema({
  has_user_data: {
    type: Boolean,
    default: false,
  },
  is_fetching: {
    type: Boolean,
    default: false,
  },
  last_fetched: Date,
})

const messageData = mongoose.Schema({
  has_message_data: {
    type: Boolean,
    default: false,
  },
  is_fetching: {
    type: Boolean,
    default: false,
  },
  last_fetched: Date,
})

const teamSchema = mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },

  // Name of the team
  team: {
    type: String,
    required: true
  },

  // Team's ID within slack
  team_id: {
    type: String,
    required: true,
    unique: true,
  },

  // Keep track of whether we've fetched the user data
  user_data: {
    type: userData,
    required: true,
    default: userData,
  },

  // Keep track of whether we've fetched the message data
  message_data: {
    type: messageData,
    required: true,
    default: messageData,
  },
})

module.exports.Team = mongoose.model('Team', teamSchema)
