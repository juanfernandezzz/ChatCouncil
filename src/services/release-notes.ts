import { compareVersions } from 'compare-versions'
import { getVersion } from '~utils'

const RELEASE_NOTES = [
  {
    version: '1.0.0',
    notes: ['ChatCouncil - Multi-model AI Chat Interface'],
  },
]

export async function checkReleaseNotes(): Promise<string[]> {
  const version = getVersion()
  const lastCheck = localStorage.getItem('lastCheckReleaseNotesVersion')
  localStorage.setItem('lastCheckReleaseNotesVersion', version)
  if (!lastCheck) {
    return []
  }
  return RELEASE_NOTES.slice(0, 3)
    .filter(({ version: v }) => compareVersions(v, lastCheck) > 0)
    .map(({ notes }) => notes)
    .flat()
}
