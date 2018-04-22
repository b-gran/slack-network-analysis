const mongoose = require('mongoose')

const teamSchema = mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  team: {
    type: String,
    required: true
  },
  team_id: {
    type: String,
    required: true,
    unique: true,
  },
})

module.exports.Team = mongoose.model('Team', teamSchema)
