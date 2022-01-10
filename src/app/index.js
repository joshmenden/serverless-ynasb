var AWS = require('aws-sdk'),
    region = "us-east-1",
    secret,
    decodedBinarySecret

var secretsClient = new AWS.SecretsManager({
  region: region
})

import _ from 'lodash'

import ynab from './ynabService'
import SlackMessageBlock from './slackMessageBlock'
const qs = require('querystring')


const { WebClient } = require('@slack/web-api')

// Handler
exports.handler = async function(event, context) {
  try {
    const { ynabClient, slackClient } = await setupClients()
    console.log('🤖 Clients succesfully set up')

    // cron job from cloudwatch
    if (event.source === 'aws.events') {
      if (event.resources[0].includes("BudgetAlert")) {
        await postDailyAlert(slackClient, ynabClient, 'finances')
        return formatResponse()
      } else if (event.resources[0].includes("NetworthAlert")) {
        await postNetworth(slackClient, ynabClient, 'finances')
        return formatResponse()
      }
    }

    let eventBody = qs.parse(event.body)
    console.log('🗒️ Event body parsed')

    try {
      console.log('⌛ Validating request...')
      await validateRequest(eventBody.token)
      console.log('✅ Request validated')
    } catch (e) {
      console.log('❌ Request NOT validated')
      return formatError({ code: 401, statusCode: 401, message: `Unauthorized - Not from Slack!` })
    }

    let channelName = eventBody['channel_name']
    if (!channelName) channelName = 'finances'

    let args = eventBody.text.replace("_", " ").split(" ")
    let action = args[0].toLowerCase()
    switch (action) {
      case 'net':
        console.log('🤑 Posting net worth...')
        await postNetworth(slackClient, ynabClient, channelName)
        return formatResponse()
      case 'budget':
        args.shift()
        let budgetCat = args.join(" ")
        await postBudgetAlert(slackClient, ynabClient, channelName, budgetCat)
        return formatResponse()
      case 'summary':
        console.log('💰 Posting budget summary...')
        await postDailyAlert(slackClient, ynabClient, channelName)
        return formatResponse()
      default:
        return formatResponse(body({ status: `No Matching Action Found: ${action}` }))
    }
  } catch (err) {
    console.log(`Following error: ${err}`)
    return formatError()
  }
}

function validateRequest (token) {
  return new Promise(async (resolve, reject) => {
    let verification = await getSecret(process.env.SlackVerificationTokenArn)
    if (token !== verification) reject()
    resolve()
  })
}

async function setupClients () {
  return new Promise(async resolve => {
    let ynabSecret = await getSecret(process.env.YNABApiKeyArn)
    let slackSecret = await getSecret(process.env.SlackAuthTokenArn)
    const slacker = new WebClient(slackSecret)
    let y = new ynab(ynabSecret)
    await y.init()
    resolve({
      ynabClient: y,
      slackClient: slacker
    })
  })
}

async function postNetworth (slacker, ynab, slackChannel) {
  return new Promise(async resolve => {
    let alert = await ynab.getNetworthAlert()
    await postToSlack(slacker, alert, slackChannel)
    resolve()
  })
}

async function postDailyAlert (slacker, ynab, slackChannel) {
  return new Promise(async resolve => {
    let desiredCategories = process.env.DesiredCategories.split(",")
    let categoryAlerts = await ynab.getCategoryAlerts(desiredCategories)
    let uncategorizedAlerts = await ynab.getUncategorizedTransactionNumberAlert()
    let alerts = _.flatten([categoryAlerts, uncategorizedAlerts])
    await postToSlack(slacker, alerts, slackChannel)
    resolve()
  })
}

async function postBudgetAlert (slacker, ynab, slackChannel, budgetName) {
  return new Promise(async resolve => {
    let desiredCategories = [budgetName]
    let categoryAlerts = await ynab.getCategoryAlerts(desiredCategories, false, false)
    let alerts = _.flatten([categoryAlerts])
    await postToSlack(slacker, alerts, slackChannel)
    resolve()
  })
}

function postToSlack (slacker, alerts, slackChannel) {
  return new Promise(async (resolve, reject) => {
    try {
      await slacker.chat.postMessage({
        channel: `#${slackChannel}`,
        blocks: alerts
      })
      resolve()
    } catch (error) {
      reject(error)
      return formatError()
    }
  })
}

var formatResponse = function(body = null){
  var response = {
    "statusCode": 200,
    "headers": {
      "Content-Type": "application/json"
    },
    "isBase64Encoded": false,
    "body": body
  }
  return response
}

var formatError = function(error = null){
  var response = {
    "statusCode": error ? error.statusCode : 404,
    "headers": {
      "Content-Type": "text/plain",
      "x-amzn-ErrorType": error ? error.code : 404
    },
    "isBase64Encoded": false,
    "body": error ? (error.code + ": " + error.message) : 'Bad request'
  }
  return response
}

function body (bodyJSON) {
  return JSON.stringify(bodyJSON, null, 2)
}

function getSecret (secretId) {
  return new Promise((resolve, reject) => {
    secretsClient.getSecretValue({SecretId: secretId}, function(err, data) {
      if (err) {
        reject(err)
      } else {
          if ('SecretString' in data) {
              secret = data.SecretString;
          } else {
              let buff = new Buffer(data.SecretBinary, 'base64');
              decodedBinarySecret = buff.toString('ascii');
          }
          if (secret) {
            resolve(Object.values(JSON.parse(secret))[0])
          } else if (decodedBinarySecret) resolve(decodedBinarySecret)
          reject()
      }
    })
  })
}
