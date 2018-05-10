import Document, { Head, Main, NextScript } from 'next/document'
import { renderStatic } from 'glamor/server'

import { SheetsRegistry } from 'react-jss/lib/jss';
import JssProvider from 'react-jss/lib/JssProvider';
import { createMuiTheme, createGenerateClassName, MuiThemeProvider } from 'material-ui/styles'

import { GLAMOR_ID_FIELD } from '../rehydrate'

export default class MyDocument extends Document {
  static async getInitialProps ({ renderPage }) {
    const registry = new SheetsRegistry()
    const generateClassName = createGenerateClassName()

    // Wrap the page in a JSS provider so we can figure out which styles get added by MUI.
    const page = renderPage(Page => props => (
      <JssProvider registry={registry} generateClassName={generateClassName}>
        <MuiThemeProvider theme={createMuiTheme()} sheetsManager={new Map()}>
          <Page {...props} />
        </MuiThemeProvider>
      </JssProvider>
    ))

    const styles = renderStatic(() => page.html || page.errorHtml)

    return {
      ...page,
      ...styles,
      jss: registry.toString(),
    }
  }

  constructor (props) {
    super(props)
    const { __NEXT_DATA__, ids } = props
    if (ids) {
      __NEXT_DATA__[GLAMOR_ID_FIELD] = this.props.ids
    }
  }

  render () {
    return (
      <html>
      <Head>
        <link rel="stylesheet" href="/_next/static/style.css" />
        <style id="glamor-server-side" dangerouslySetInnerHTML={{ __html: this.props.css }}/>
        <style id="jss-server-side" dangerouslySetInnerHTML={{ __html: this.props.jss }} />
      </Head>
      <body>
      <Main/>
      <NextScript/>
      </body>
      </html>
    )
  }
}