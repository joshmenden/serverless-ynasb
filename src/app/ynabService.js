import * as ynabAPI from "ynab"
import { utils } from "ynab"
import _ from 'lodash'
import moment from 'moment'
import SlackMessageBlock from './slackMessageBlock'
import { resolve } from "path"

export default class {
  constructor(apiKey) {
    this.apiKey = apiKey
  }

  init () {
    return new Promise(resolve => {
      this.client = new ynabAPI.API(this.apiKey)
      resolve()
    })
  }

  async budgetId () {
    return new Promise(async (resolve, reject) => {
      try {
        const { data: { budgets } } = await this.client.budgets.getBudgets()
        resolve(budgets[0].id)
      } catch (err) {
        reject(`Error getting YNAB budget: ${JSON.stringify(err)}`)
      }
    })
  }

  async getCategories ({ flattenCategories = false } = { flattenCategories: false }) {
    let budgetId = await this.budgetId()
    const { data: { category_groups } } = await this.client.categories.getCategories(budgetId)
    this.categories = category_groups
    if (flattenCategories) return this.flattenCategories(this.categories)
    else return this.categories
  }

  async getNetworth () {
    return new Promise(async resolve => {
      let budgetId = await this.budgetId()
      let { data: { accounts } } = await this.client.accounts.getAccounts(budgetId)
      accounts = accounts.filter(account => !account.closed && !account.deleted)
      let totalPennies = accounts.map(account => account.balance).reduce((accumulator, currentValue) => accumulator + currentValue)
      resolve(this.formatMoney(totalPennies))
    })
  }

  async getNetworthAlert () {
    return new Promise(async resolve => {
      const networth = await this.getNetworth()
      let blocks = []
      blocks.push(new SlackMessageBlock({ type: 'section', text: `:money_mouth_face:   *Yee haw!* We have a current Networth of ${networth}.` }).serialize())
      resolve(blocks)
    })
  }

  async getCategoryAlerts (alertCategories, multipleCategories = true, includeNegatives = true) {
    try {
      let messageBlocks = []
      let categories = await this.getCategories({ flattenCategories: true })

      if (multipleCategories) messageBlocks = messageBlocks.concat(this.budgetGrouping({ groupTitle: 'Frequently Used Categories', groupEmoji: ':moneybag:', budgetNames: alertCategories, categories: categories}))
      else {
        let budgetsText = `\n${this.formatBudgetString({ name: alertCategories[0], balance: Object.keys(categories).includes(alertCategories[0]) ? categories[alertCategories[0]].balance : 'NA', budgeted: Object.keys(categories).includes(alertCategories[0]) ? categories[alertCategories[0]].budgeted : 'NA' })}`
        let blocks = [new SlackMessageBlock({ type: 'section', text: budgetsText}).serialize()]
        messageBlocks = messageBlocks.concat(blocks)
      }

      if (includeNegatives) {
        let negativeBudgets = []
        Object.keys(categories).forEach(categoryName => {
          if(categories[categoryName].balance < 0) negativeBudgets.push(categoryName)
        })

        negativeBudgets = negativeBudgets.filter(budget => !alertCategories.includes(budget))

        if (negativeBudgets.length > 0) { messageBlocks = messageBlocks.concat(this.budgetGrouping({ groupTitle: 'Categories Overbudget', groupEmoji: ':exclamation:', budgetNames: negativeBudgets, categories: categories })) }
      }

      return new Promise(resolve => resolve(messageBlocks))
    } catch (error) {
      return new Promise((resolve, reject) => reject(error))
    }
  }

  async getUncategorizedTransactionNumberAlert () {
    return new Promise(async resolve => {
      const total = await this.uncategorizedTransactions()
      if (total.length <= 0) resolve([])
      let blocks = []
      blocks.push(new SlackMessageBlock({ type: 'divider' }).serialize())
      blocks.push(new SlackMessageBlock({ type: 'section', text: `:mega:   *Alert!* We have ${total.length} unapproved transactions.` }).serialize())
      resolve(blocks)
    })
  }


  async uncategorizedTransactions () {
    return new Promise(async resolve => {
      const budgetId = await this.budgetId()
      const { data: { accounts } } = await this.client.accounts.getAccounts(budgetId)
      const filteredAccounts = accounts.filter(acc => !acc.closed).filter(acc => acc.on_budget)

      let uncategorizedTransactions = []
      for (let i = 0; i < filteredAccounts.length; i++) {
        let momentTime = moment().subtract(30, 'days').toISOString()
        console.log(`Account Name: ${filteredAccounts[i].name}`)
        const { data: { transactions } } = await this.client.transactions.getTransactionsByAccount(budgetId, filteredAccounts[i].id, momentTime, 'unapproved')
        uncategorizedTransactions = uncategorizedTransactions.concat(transactions)
      }

      resolve(uncategorizedTransactions)
    })
  }

  budgetGrouping ({ groupTitle, groupEmoji, budgetNames, categories }) {
    let blocks = []
    blocks.push(new SlackMessageBlock({ type: 'section', text: `${groupEmoji}   *${groupTitle}*` }).serialize(),)
    let budgetsText = ''
    for (let budgetName of budgetNames) {
      budgetsText = budgetsText + `\n${this.formatBudgetString({ name: budgetName, balance: Object.keys(categories).includes(budgetName) ? categories[budgetName].balance : 'NA', budgeted: Object.keys(categories).includes(budgetName) ? categories[budgetName].budgeted : 'NA' })}`
    }
    blocks.push(new SlackMessageBlock({ type: 'section', text: budgetsText}).serialize())
    return blocks
  }

  flattenCategories (categories) {
    let grouped = _.flatten(categories.map(group => group.categories.map(category => Object.assign(category, { category_group_name: group.name }))))
    let flattened = grouped.reduce((obj, item) => {
      obj[item.name] = item
      return obj
    }, {})
    return flattened
  }

  formatBudgetString ({ name, balance, budgeted }) {
    let budgetTitleString = `${name}`
    let budgetBalanceString = `*${this.formatMoney(balance)}* left of your *${this.formatMoney(budgeted)}* budget`
    return `${budgetTitleString}:  ${budgetBalanceString}`
  }

  formatMoney (cents) {
    let money = (cents / 1000).toFixed(2)
    return new Intl.NumberFormat('en-US',
      { style: 'currency', currency: 'USD' }
    ).format(money)
  }
}
