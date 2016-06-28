'use strict'

const AnvilConnect = require('anvil-connect-nodejs')
const url = require('url')
const qs = require('qs')
const request = require('request-promise')
const argv = require('minimist')(process.argv.slice(2))

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
if (argv.usage || (!argv.clientIdAdmin || !argv.clientSecretAdmin || !argv.redirectUri || !argv.logoutRedirectUri || !argv.clientId || !argv.login || !argv.password || !argv.addUrl)) {
  console.log("Usage : node index.js --login='toto@toto.fr' --password='myPassword' --clientIdAdmin='myClientIdAdmin' --clientSecretAdmin='mySecretAdmin' --clientId='myClientIdToEdit' --redirectUri='https://myredirectUri' --logoutRedirectUri='https://mylogoutRedirectUri' --addUrl='true' ('false' to remove)")
  process.exit(0)
}

const CLIENT_ID_ADMIN = argv.clientIdAdmin
const CLIENT_SECRET_ADMIN = argv.clientSecretAdmin
const REDIRECT_URI = argv.redirectUri
const LOGOUT_REDIRECT_URI = argv.logoutRedirectUri
const CLIENT_ID_TO_EDIT = argv.clientId
const LOGIN = argv.login
const PASSWORD = argv.password
const addUrl = argv.addUrl

const client = new AnvilConnect({
  issuer: 'https://accounts.integ.clubmed.com',
  client_id: CLIENT_ID_ADMIN,
  client_secret: CLIENT_SECRET_ADMIN,
  redirect_uri: 'https://accounts.integ.clubmed.com',
  scope: 'openid profile realm'
})
// add login method to anvil client
function login (email, password) {
  const self = this
  const input = {}

  // construct the endpoint
  // this one isn't included in openid-configuration
  const uri = this.issuer + '/signin'

  // authorization parameters
  const params = this.authorizationParams(input)

  // password login params
  params.provider = 'password'
  params.email = email
  params.password = password
  params.scope = 'openid profile realm'

  // authorization request
  return new Promise((resolve, reject) => {
    request({
      url: uri,
      method: 'POST',
      form: params,
      headers: { 'referer': uri },
      agentOptions: self.agentOptions
    })
      .then((data) => reject(new Error('Bad username or password', data)))
      .catch((err) => {
        if (err.statusCode === 302) {
          const u = url.parse(err.response.headers.location)
          const code = qs.parse(u.query).code

          // we need to handle an error response in redirect

          self.token({ code: code })
            .then((data) => resolve(data))
            .catch((err) => reject(err))
        } else {
          reject(err)
        }
      })
  })
}

AnvilConnect.prototype.login = login

let accessToken
client.initProvider()
  .then(() => console.info('provider initialized'))
  .then(() => client.login(LOGIN, PASSWORD))
  .then((token) => { accessToken = token.access_token })
  .then(() => console.info('access token obtained'))
  .then(() => client.clients.get(CLIENT_ID_TO_EDIT, { token: accessToken }))
  .then((clientData) => {
    console.info('client config retrieved with success:', clientData)
    return clientData
  })
  .then((clientData) => {
    if (addUrl === 'true') {
      console.log('adding url')
      clientData.redirect_uris.push(REDIRECT_URI)
      clientData.post_logout_redirect_uris.push(LOGOUT_REDIRECT_URI)
    } else {
      clientData.redirect_uris = clientData.redirect_uris.filter((redirect_uri) => redirect_uri !== REDIRECT_URI)
      clientData.post_logout_redirect_uris = clientData.post_logout_redirect_uris.filter((post_logout_redirect_uri) => post_logout_redirect_uri !== LOGOUT_REDIRECT_URI)
    }
    client.clients.update(CLIENT_ID_TO_EDIT, clientData, { token: accessToken })
  })
  .then(() => client.clients.get(CLIENT_ID_TO_EDIT, { token: accessToken }))
  .then((clientData) => console.info('client config updated with success: ', clientData))
  .catch((err) => console.error('error while updating client: ' + CLIENT_ID_TO_EDIT, err))
