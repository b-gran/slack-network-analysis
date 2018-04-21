import getConfig from 'next/config'

export const SERVER_URL = 'http://localhost:8080'
export const SLACK_TOKEN = getConfig().publicRuntimeConfig.SLACK_TOKEN
