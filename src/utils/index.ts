import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { v4 } from 'uuid'

export function uuid() {
  return v4()
}

export function getVersion() {
  try {
    return __APP_VERSION__
  } catch {
    return '1.0.0'
  }
}

export function isProduction() {
  return !import.meta.env.DEV
}

export function cx(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
