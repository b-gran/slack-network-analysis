import App from 'next/app'
import React from 'react'
import './hack.css'

export default class MyApp extends App {
  componentDidMount () {
    super.componentDidMount && super.componentDidMount()

    // Remove the server-side injected JSS after the initial render.
    // The page's own MUI instance will end up regenerating theses styles so they're safe to remove.
    const jssStyles = document.getElementById('jss-server-side');
    if (jssStyles && jssStyles.parentNode) {
      jssStyles.parentNode.removeChild(jssStyles);
    }
  }
}