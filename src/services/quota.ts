const QUOTA_STORAGE_KEY = 'cc_quota_usage'
const DAILY_FREE_LIMIT = 50

interface QuotaUsage {
  date: string
  totalMessages: number
  modelUsage: Record<string, number>
}

export interface QuotaInfo {
  used: number
  limit: number
  remaining: number
  percentage: number
  models: Record<string, number>
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function loadUsage(): QuotaUsage {
  const stored = localStorage.getItem(QUOTA_STORAGE_KEY)
  if (!stored) {
    return { date: getTodayKey(), totalMessages: 0, modelUsage: {} }
  }
  try {
    const parsed = JSON.parse(stored) as QuotaUsage
    if (parsed.date !== getTodayKey()) {
      return { date: getTodayKey(), totalMessages: 0, modelUsage: {} }
    }
    return parsed
  } catch {
    return { date: getTodayKey(), totalMessages: 0, modelUsage: {} }
  }
}

function saveUsage(usage: QuotaUsage) {
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(usage))
}

export function incrementQuota(modelId: string): QuotaInfo {
  const usage = loadUsage()
  usage.totalMessages += 1
  usage.modelUsage[modelId] = (usage.modelUsage[modelId] || 0) + 1
  saveUsage(usage)
  return getQuotaInfo()
}

export function getQuotaInfo(): QuotaInfo {
  const usage = loadUsage()
  return {
    used: usage.totalMessages,
    limit: DAILY_FREE_LIMIT,
    remaining: Math.max(0, DAILY_FREE_LIMIT - usage.totalMessages),
    percentage: Math.min(100, (usage.totalMessages / DAILY_FREE_LIMIT) * 100),
    models: usage.modelUsage,
  }
}

export function isQuotaExhausted(): boolean {
  const info = getQuotaInfo()
  return info.remaining <= 0
}

export function resetQuota() {
  localStorage.removeItem(QUOTA_STORAGE_KEY)
}
