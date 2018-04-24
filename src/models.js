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

const channelSchema = mongoose.Schema({
  // The channel's ID within Slack
  channel_id: {
    type: String,
    required: true,
    unique: true,
  },

  name: String,

  // user_id of the members of this channel
  members: [String],

  // Raw channel model data from Slack
  slack_data: {
    type: Object,
  },

  // Which team (within SNA) this channel belongs to
  team: mongoose.SchemaTypes.ObjectId,
})

module.exports.Channel = mongoose.model('Channel', channelSchema)

const jobData = mongoose.Schema({
  ever_run: {
    type: Boolean,
    default: false,
  },
  is_running: {
    type: Boolean,
    default: false,
  },
  last_run: Date,
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
    type: jobData,
    required: true,
    default: jobData,
  },

  // Keep track of whether we've fetched the message data
  message_data: {
    type: jobData,
    required: true,
    default: jobData,
  },

  // Keep track of whether we've fetched the channel data
  channel_data: {
    type: jobData,
    required: true,
    default: jobData,
  },
})

module.exports.Team = mongoose.model('Team', teamSchema)

const messageSchema = mongoose.Schema({
  user_id: {
    type: String,
    required: true,
  },

  ts: {
    type: String,
    required: true,
  },

  text: String,

  reactions: mongoose.SchemaTypes.Array,

  replies: mongoose.SchemaTypes.Array,

  channel: {
    type: String,
    required: true,
  },

  team: {
    type: mongoose.SchemaTypes.ObjectId,
    required: true,
  },
})

module.exports.Message = mongoose.model('Message', messageSchema)
