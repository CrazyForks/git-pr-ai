import ora from 'ora'
import { getCurrentBranch } from '../../git-helpers'
import { loadConfig } from '../../config'
import {
  extractJiraTicket,
  getJiraTicketDetails,
  normalizeJiraTicketInput,
} from '../../jira'
import { CommitJiraContext } from './prompts'

type JiraInput = {
  key: string
  browseUrl?: string
}

const JIRA_URL_PATTERN = /(https?:\/\/[^/]+)\/browse\/([A-Z0-9]+-\d+)/i

export function parseJiraInput(input: string): JiraInput {
  const urlMatch = input.match(JIRA_URL_PATTERN)
  if (urlMatch?.[1] && urlMatch?.[2]) {
    const key = urlMatch[2].toUpperCase()
    return { key, browseUrl: `${urlMatch[1]}/browse/${key}` }
  }

  const normalized = normalizeJiraTicketInput(input)
  if (normalized) return { key: normalized }

  throw new Error(
    'Invalid JIRA ticket format. Use a key like PROJ-123 or a JIRA URL.',
  )
}

export async function resolveJiraContext(
  jiraOption?: string | boolean,
): Promise<CommitJiraContext | null> {
  if (!jiraOption) return null

  const config = await loadConfig()

  let jiraKey: string
  let browseUrl: string | undefined
  let source: CommitJiraContext['source']

  if (jiraOption === true) {
    const currentBranch = await getCurrentBranch()
    const jiraTicket = extractJiraTicket(currentBranch)
    if (!jiraTicket) return null

    jiraKey = jiraTicket
    browseUrl = config.jira
      ? `${config.jira.baseUrl}/browse/${jiraTicket}`
      : undefined
    source = 'branch'
  } else {
    const jiraInput = parseJiraInput(jiraOption)
    jiraKey = jiraInput.key
    browseUrl =
      jiraInput.browseUrl ||
      (config.jira ? `${config.jira.baseUrl}/browse/${jiraKey}` : undefined)
    source = 'api'
  }

  const jiraSpinner = ora('Fetching JIRA ticket details...').start()
  const jiraDetails = await getJiraTicketDetails(jiraKey)

  if (!jiraDetails) {
    jiraSpinner.warn('Could not fetch JIRA ticket details, using key only')
    return {
      key: jiraKey,
      source,
      browseUrl,
    }
  }

  jiraSpinner.succeed(`JIRA: ${jiraKey}`)

  return {
    key: jiraKey,
    summary: jiraDetails.summary,
    description: jiraDetails.description,
    issueType: jiraDetails.issueType,
    priority: jiraDetails.priority,
    status: jiraDetails.status,
    assignee: jiraDetails.assignee,
    labels: jiraDetails.labels,
    source,
    browseUrl,
  }
}

export function buildJiraCommitMessage(
  commitType: string,
  jiraContext: CommitJiraContext,
): string {
  const title = jiraContext.summary?.replace(/\s+/g, ' ').trim()
  const subject = `${commitType}: [${jiraContext.key}] ${title || jiraContext.key}`

  if (jiraContext.browseUrl) {
    return `${subject}\n\nlink: ${jiraContext.browseUrl}`
  }

  return subject
}
