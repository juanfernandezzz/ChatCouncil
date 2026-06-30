import { Dialog as HeadlessDialog, Transition } from '@headlessui/react'
import { FC, Fragment, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import logoIcon from '~/assets/logo-chatcouncil.svg'
import { cx } from '~/utils'
import { getQuotaInfo, QuotaInfo } from '~services/quota'

interface AuthState {
  isLoggedIn: boolean
  email: string
  name: string
}

const AUTH_KEY = 'cc_auth'

function loadAuth(): AuthState {
  try {
    const stored = localStorage.getItem(AUTH_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return { isLoggedIn: false, email: '', name: '' }
}

function saveAuth(state: AuthState) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(state))
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
}

interface Props {
  open: boolean
  onClose: () => void
}

const AuthWizard: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [quota] = useState<QuotaInfo>(getQuotaInfo)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!email || !password) return
      if (mode === 'register' && !name) return

      const existing = loadAuth()
      if (mode === 'login') {
        if (existing.email === email && existing.isLoggedIn) {
          toast.success(t('Welcome back!'))
          setStep('success')
        } else {
          toast.error(t('Invalid credentials'))
        }
      } else {
        saveAuth({ isLoggedIn: true, email, name })
        toast.success(t('Account created!'))
        setStep('success')
      }
    },
    [email, password, name, mode, t],
  )

  const handleGuest = useCallback(() => {
    saveAuth({ isLoggedIn: true, email: 'guest@local', name: 'Guest' })
    setStep('success')
    toast.success(t('Continuing as guest'))
  }, [t])

  const handleClose = useCallback(() => {
    if (step === 'success') {
      onClose()
    }
  }, [step, onClose])

  return (
    <Transition.Root show={open} as={Fragment}>
      <HeadlessDialog as="div" onClose={handleClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center max-h-screen m-5">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300" enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200" leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <HeadlessDialog.Panel className="mx-auto w-full max-w-md rounded-2xl bg-primary-background shadow-2xl overflow-hidden border border-primary-border">
              {step === 'form' ? (
                <div className="p-8">
                  <div className="flex justify-center mb-6">
                    <img src={logoIcon} className="w-24" alt="ChatCouncil" />
                  </div>
                  <div className="flex mb-6 bg-secondary rounded-xl p-1">
                    <button
                      className={cx(
                        'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
                        mode === 'register' ? 'bg-primary-blue text-white' : 'text-secondary-text hover:text-primary-text',
                      )}
                      onClick={() => setMode('register')}
                    >
                      {t('Register')}
                    </button>
                    <button
                      className={cx(
                        'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
                        mode === 'login' ? 'bg-primary-blue text-white' : 'text-secondary-text hover:text-primary-text',
                      )}
                      onClick={() => setMode('login')}
                    >
                      {t('Sign in')}
                    </button>
                  </div>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {mode === 'register' && (
                      <input
                        type="text"
                        placeholder={t('Name')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-secondary border border-primary-border rounded-xl px-4 py-3 text-sm text-primary-text placeholder:text-light-text focus:outline-none focus:ring-1 focus:ring-primary-blue"
                      />
                    )}
                    <input
                      type="email"
                      placeholder={t('Email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-secondary border border-primary-border rounded-xl px-4 py-3 text-sm text-primary-text placeholder:text-light-text focus:outline-none focus:ring-1 focus:ring-primary-blue"
                    />
                    <input
                      type="password"
                      placeholder={t('Password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-secondary border border-primary-border rounded-xl px-4 py-3 text-sm text-primary-text placeholder:text-light-text focus:outline-none focus:ring-1 focus:ring-primary-blue"
                    />
                    <button
                      type="submit"
                      className="w-full bg-primary-blue text-white rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {mode === 'register' ? t('Create account') : t('Sign in')}
                    </button>
                  </form>
                  <div className="mt-4 text-center">
                    <button
                      onClick={handleGuest}
                      className="text-sm text-secondary-text hover:text-primary-text transition-colors"
                    >
                      {t('Continue as guest')}
                    </button>
                  </div>
                  <div className="mt-6 pt-4 border-t border-primary-border">
                    <div className="flex justify-between text-xs text-light-text mb-2">
                      <span>{t('Daily free usage')}</span>
                      <span>{quota.used}/{quota.limit}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, quota.percentage)}%`,
                          background: quota.percentage > 80 ? '#EF4444' : '#6B5CE7',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary-blue/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-primary-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-primary-text mb-2">{t('Welcome to ChatCouncil!')}</h2>
                  <p className="text-sm text-secondary-text mb-6">{t('You have 50 free messages per day')}</p>
                  <div className="mb-6">
                    <div className="flex justify-between text-xs text-light-text mb-2">
                      <span>{t('Daily usage')}</span>
                      <span>{quota.used}/{quota.limit}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, quota.percentage)}%`,
                          background: quota.percentage > 80 ? '#EF4444' : '#6B5CE7',
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-full bg-primary-blue text-white rounded-xl py-3 text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {t('Start chatting')}
                  </button>
                </div>
              )}
            </HeadlessDialog.Panel>
          </Transition.Child>
        </div>
      </HeadlessDialog>
    </Transition.Root>
  )
}

export default AuthWizard
