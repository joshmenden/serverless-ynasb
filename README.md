# YNASB Serverless

**You Need a Slackbot** -- YNAB meets Slack in an epic serverless solution for keeping an eye on your finances.

### What does it do?

When set up properly, this Slackbot will integrate with your YNAB budget and provide you with:
* A daily morning report, informing you of remaining funds in specific categories, and number of uncategorized transactions
* A daily Net Worth report, informing you what your current net worth is
* A simple `/` slash command to get updates on your budget or specific budget categories. For example:
  * `/ynasb summary` (summary of budget)
  * `/ynasb net worth` (posts current net worth)
  * `ynasb budget Groceries` (posts current state of the Groceries budget)

### How can I set this up?

I've made this serverless & fully infrastructure-as-coded this thing so it should be pretty simple to set up. This is setup right now to work exclusively in AWS and I have a few `us-east-1`s hard coded so just spin it up there for now.

(This assumes you've already created a Slackbot for this project.)

* Run the `./deploy.sh` script (might have to adjust permissions)
* Once that finishes, go ahead in the AWS console and put in values for the following AWS Secrets. The `key` for each secret is the name as follows:
  * `YNABApiKey`: Your YNAB Api Key. 
  * `SlackAuthToken`: The token found in the "Oauth" section of your Slackbot (should begin with `xoxb`)
  * `SlackVerificationToken`: Should be found in the "General Info" section of your slackbot.

And that's it, you're good to go!

For following deploys, you can remove the `--guided` flag from the `./deploy.sh` script and things will move a little quicker for you.