import { beforeEach, describe, expect, it, vi } from 'vitest'
import { $ } from 'zx'
import ora from 'ora'
import { GitHubProvider } from './github'

vi.mock('zx')
vi.mock('ora')

interface MockCommandResult {
  stdout: string
}

const mockZx = vi.mocked($)

const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
}

function stringifyCommand(args: unknown[]): string {
  const [template, ...values] = args as [string[], ...unknown[]]
  return template
    .reduce((cmd, chunk, index) => {
      const value = index < values.length ? String(values[index]) : ''
      return cmd + chunk + value
    }, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function setupCommandMock(
  handler: (command: string) => MockCommandResult | Promise<MockCommandResult>,
): string[] {
  const executedCommands: string[] = []

  mockZx.mockImplementation((...args: unknown[]) => {
    const command = stringifyCommand(args)
    executedCommands.push(command)

    try {
      return Promise.resolve(handler(command))
    } catch (error) {
      return Promise.reject(error)
    }
  })

  return executedCommands
}

describe('GitHubProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ora).mockReturnValue(mockSpinner as any)
  })

  it('checkExistingPR finds upstream PR in fork workflow', async () => {
    const provider = new GitHubProvider()

    setupCommandMock((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'feat/fork-branch\n' }
      }
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        return {
          stdout: JSON.stringify({
            nameWithOwner: 'alice/fork-repo',
            owner: { login: 'alice' },
            name: 'fork-repo',
            isFork: true,
            parent: {
              nameWithOwner: 'org/main-repo',
              owner: { login: 'org' },
              name: 'main-repo',
            },
          }),
        }
      }
      if (
        command.includes(
          'gh pr list --state open --repo org/main-repo --head feat/fork-branch',
        )
      ) {
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              url: 'https://github.com/org/main-repo/pull/42',
              headRefName: 'feat/fork-branch',
              headRepositoryOwner: { login: 'alice' },
            },
          ]),
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const result = await provider.checkExistingPR()
    expect(result).toBe('https://github.com/org/main-repo/pull/42')
  })

  it('checkExistingPR prefers upstream PR when both upstream/current can exist', async () => {
    const provider = new GitHubProvider()
    const executedCommands = setupCommandMock((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'feat/fork-branch\n' }
      }
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        return {
          stdout: JSON.stringify({
            nameWithOwner: 'alice/fork-repo',
            owner: { login: 'alice' },
            name: 'fork-repo',
            isFork: true,
            parent: {
              nameWithOwner: 'org/main-repo',
              owner: { login: 'org' },
              name: 'main-repo',
            },
          }),
        }
      }
      if (
        command.includes(
          'gh pr list --state open --repo org/main-repo --head feat/fork-branch',
        )
      ) {
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              url: 'https://github.com/org/main-repo/pull/42',
              headRefName: 'feat/fork-branch',
              headRepositoryOwner: { login: 'alice' },
            },
          ]),
        }
      }
      if (
        command.includes(
          'gh pr list --state open --repo alice/fork-repo --head feat/fork-branch',
        )
      ) {
        return {
          stdout: JSON.stringify([
            {
              number: 99,
              url: 'https://github.com/alice/fork-repo/pull/99',
              headRefName: 'feat/fork-branch',
              headRepositoryOwner: { login: 'alice' },
            },
          ]),
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const result = await provider.checkExistingPR()
    expect(result).toBe('https://github.com/org/main-repo/pull/42')
    expect(
      executedCommands.some((command) =>
        command.includes('gh pr list --state open --repo alice/fork-repo'),
      ),
    ).toBe(false)
  })

  it('openPR opens PR using resolved URL', async () => {
    const provider = new GitHubProvider()
    const executedCommands = setupCommandMock((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'feat/fork-branch\n' }
      }
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        return {
          stdout: JSON.stringify({
            nameWithOwner: 'alice/fork-repo',
            owner: { login: 'alice' },
            name: 'fork-repo',
            isFork: true,
            parent: {
              nameWithOwner: 'org/main-repo',
              owner: { login: 'org' },
              name: 'main-repo',
            },
          }),
        }
      }
      if (
        command.includes(
          'gh pr list --state open --repo org/main-repo --head feat/fork-branch',
        )
      ) {
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              url: 'https://github.com/org/main-repo/pull/42',
              headRefName: 'feat/fork-branch',
              headRepositoryOwner: { login: 'alice' },
            },
          ]),
        }
      }
      if (
        command === 'gh pr view https://github.com/org/main-repo/pull/42 --web'
      ) {
        return { stdout: '' }
      }
      if (
        command ===
        'gh pr view https://github.com/org/main-repo/pull/42 --json url'
      ) {
        return {
          stdout: JSON.stringify({
            url: 'https://github.com/org/main-repo/pull/42',
          }),
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    await provider.openPR()

    expect(
      executedCommands.includes(
        'gh pr view https://github.com/org/main-repo/pull/42 --web',
      ),
    ).toBe(true)
  })

  it('openPR surfaces PR lookup failures instead of masking as missing PR', async () => {
    const provider = new GitHubProvider()

    setupCommandMock((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'feat/fork-branch\n' }
      }
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        throw new Error('gh auth failed')
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    await expect(provider.openPR()).rejects.toThrow('gh auth failed')
  })

  it('getPRDetails without args resolves upstream PR and actual repo ownership', async () => {
    const provider = new GitHubProvider()

    setupCommandMock((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'feat/fork-branch\n' }
      }
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        return {
          stdout: JSON.stringify({
            nameWithOwner: 'alice/fork-repo',
            owner: { login: 'alice' },
            name: 'fork-repo',
            isFork: true,
            parent: {
              nameWithOwner: 'org/main-repo',
              owner: { login: 'org' },
              name: 'main-repo',
            },
          }),
        }
      }
      if (
        command.includes(
          'gh pr list --state open --repo org/main-repo --head feat/fork-branch',
        )
      ) {
        return {
          stdout: JSON.stringify([
            {
              number: 42,
              url: 'https://github.com/org/main-repo/pull/42',
              headRefName: 'feat/fork-branch',
              headRepositoryOwner: { login: 'alice' },
            },
          ]),
        }
      }
      if (
        command ===
        'gh pr view 42 --repo org/main-repo --json number,title,url,baseRefName,headRefName,state,author'
      ) {
        return {
          stdout: JSON.stringify({
            number: 42,
            title: 'Fix branch discovery',
            url: 'https://github.com/org/main-repo/pull/42',
            baseRefName: 'main',
            headRefName: 'feat/fork-branch',
            state: 'OPEN',
            author: { login: 'alice' },
          }),
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const details = await provider.getPRDetails()
    expect(details.owner).toBe('org')
    expect(details.repo).toBe('main-repo')
    expect(details.number).toBe('42')
  })

  it('getPRDetails with URL uses repository from URL', async () => {
    const provider = new GitHubProvider()
    const executedCommands = setupCommandMock((command) => {
      if (
        command ===
        'gh pr view 77 --repo org/main-repo --json number,title,url,baseRefName,headRefName,state,author'
      ) {
        return {
          stdout: JSON.stringify({
            number: 77,
            title: 'Use explicit repo from URL',
            url: 'https://github.com/org/main-repo/pull/77',
            baseRefName: 'main',
            headRefName: 'feat/fork-branch',
            state: 'OPEN',
            author: { login: 'alice' },
          }),
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const details = await provider.getPRDetails(
      'https://github.com/org/main-repo/pull/77',
    )

    expect(details.owner).toBe('org')
    expect(details.repo).toBe('main-repo')
    expect(details.number).toBe('77')
    expect(executedCommands[0]).toBe(
      'gh pr view 77 --repo org/main-repo --json number,title,url,baseRefName,headRefName,state,author',
    )
  })

  it('getPRDetails with number tries upstream first, then current repo', async () => {
    const provider = new GitHubProvider()
    const executedCommands = setupCommandMock((command) => {
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        return {
          stdout: JSON.stringify({
            nameWithOwner: 'alice/fork-repo',
            owner: { login: 'alice' },
            name: 'fork-repo',
            isFork: true,
            parent: {
              nameWithOwner: 'org/main-repo',
              owner: { login: 'org' },
              name: 'main-repo',
            },
          }),
        }
      }
      if (
        command ===
        'gh pr view 123 --repo org/main-repo --json number,title,url,baseRefName,headRefName,state,author'
      ) {
        throw new Error('no pull requests found for branch "123"')
      }
      if (
        command ===
        'gh pr view 123 --repo alice/fork-repo --json number,title,url,baseRefName,headRefName,state,author'
      ) {
        return {
          stdout: JSON.stringify({
            number: 123,
            title: 'Fallback to current repo',
            url: 'https://github.com/alice/fork-repo/pull/123',
            baseRefName: 'main',
            headRefName: 'feat/fork-branch',
            state: 'OPEN',
            author: { login: 'alice' },
          }),
        }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    const details = await provider.getPRDetails('123')

    expect(details.owner).toBe('alice')
    expect(details.repo).toBe('fork-repo')
    expect(executedCommands[1]).toContain('--repo org/main-repo')
    expect(executedCommands[2]).toContain('--repo alice/fork-repo')
  })

  it('getPRDetails without args throws clear error when no PR found', async () => {
    const provider = new GitHubProvider()

    setupCommandMock((command) => {
      if (command === 'git rev-parse --abbrev-ref HEAD') {
        return { stdout: 'feat/fork-branch\n' }
      }
      if (
        command === 'gh repo view --json nameWithOwner,owner,name,isFork,parent'
      ) {
        return {
          stdout: JSON.stringify({
            nameWithOwner: 'alice/fork-repo',
            owner: { login: 'alice' },
            name: 'fork-repo',
            isFork: true,
            parent: {
              nameWithOwner: 'org/main-repo',
              owner: { login: 'org' },
              name: 'main-repo',
            },
          }),
        }
      }
      if (
        command.includes(
          'gh pr list --state open --repo org/main-repo --head feat/fork-branch',
        ) ||
        command.includes(
          'gh pr list --state open --repo alice/fork-repo --head feat/fork-branch',
        )
      ) {
        return { stdout: '[]' }
      }
      throw new Error(`Unexpected command: ${command}`)
    })

    await expect(provider.getPRDetails()).rejects.toThrow(
      'No open pull request found for branch "feat/fork-branch" in repositories: org/main-repo, alice/fork-repo',
    )
  })
})
