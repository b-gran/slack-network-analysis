import React from 'react'
import PropTypes from 'prop-types'
import Head from 'next/head'

export default class Index extends React.Component {
  render () {
    return (
      <React.Fragment>
        <Head>
          <title>Slack Network Analysis</title>
        </Head>
        <div>
          <h1>Slack Network Analysis</h1>
          <p>This is where the app will go</p>
        </div>
      </React.Fragment>
    )
  }
}