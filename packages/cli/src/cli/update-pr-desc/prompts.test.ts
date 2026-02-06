import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildUpdateDescriptionPrompt } from './prompts'
import { GitProvider, PRDetails } from '../../providers/types'

describe('update-pr-desc prompts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes explicit GitHub repo in PR update command', async () => {
    const provider = {
      name: 'GitHub',
      findPRTemplate: vi.fn().mockResolvedValue({ exists: false }),
    } as unknown as GitProvider

    const prDetails: PRDetails = {
      number: '42',
      title: 'Fix fork PR discovery',
      url: 'https://github.com/org/main-repo/pull/42',
      baseBranch: 'main',
      headBranch: 'feat/fork-branch',
      owner: 'org',
      repo: 'main-repo',
      state: 'open',
      author: 'alice',
    }

    const prompt = await buildUpdateDescriptionPrompt({
      prDetails,
      provider,
    })

    expect(prompt).toContain(
      'gh pr edit 42 --repo org/main-repo --body-file description.md',
    )
  })
})
