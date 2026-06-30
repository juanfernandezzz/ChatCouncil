import { useAtom } from 'jotai'
import { ComponentPropsWithoutRef, FC, useCallback, useEffect, useMemo, useState } from 'react'
import { ColorResult, TwitterPicker } from 'react-color'
import { useTranslation } from 'react-i18next'
import { cx } from '~/utils'
import { followArcThemeAtom, themeColorAtom } from '~app/state'
import { applyThemeMode } from '~app/utils/color-scheme'
import { isArcBrowser } from '~app/utils/env'
import { getLanguage, setLanguage } from '~services/storage/language'
import { ThemeMode, getUserThemeMode, setUserThemeMode } from '~services/theme'
import { languageCodes } from '../../i18n'
import Dialog from '../Dialog'
import Select from '../Select'

const Button: FC<ComponentPropsWithoutRef<'button'>> = (props) => {
  const { className, ...extraProps } = props
  return (
    <button
      type="button"
      className={cx(
        'relative inline-flex items-center bg-primary-background px-3 py-2 text-sm font-semibold text-primary-text ring-1 ring-inset ring-gray-300 hover:opacity-80 focus:z-10',
        className,
      )}
      {...extraProps}
    />
  )
}

const THEME_COLORS = [
  '#6B5CE7',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#78716C',
  '#1A1A1A',
]

interface Props {
  open: boolean
  onClose: () => void
}

const ThemeSettingModal: FC<Props> = (props) => {
  const { t, i18n } = useTranslation()
  const [themeColor, setThemeColor] = useAtom(themeColorAtom)
  const [themeMode, setThemeMode] = useState(getUserThemeMode())
  const [followArcTheme, setFollowArcTheme] = useAtom(followArcThemeAtom)
  const [lang, setLang] = useState(() => getLanguage() || 'auto')

  const languageOptions = useMemo(() => {
    const nameGenerator = new Intl.DisplayNames('en', { type: 'language' })
    return languageCodes.map((code) => {
      let name: string
      if (code === 'zh-CN') {
        name = '简体中文'
      } else if (code === 'zh-TW') {
        name = '繁體中文'
      } else {
        name = nameGenerator.of(code) || code
      }
      return { name, value: code }
    })
  }, [])

  const onThemeModeChange = useCallback((mode: ThemeMode) => {
    setUserThemeMode(mode)
    setThemeMode(mode)
    applyThemeMode(mode)
  }, [])

  const onThemeColorChange = useCallback(
    (color: ColorResult) => {
      setThemeColor(color.hex)
    },
    [setThemeColor],
  )

  const onLanguageChange = useCallback(
    (lang: string) => {
      setLang(lang)
      setLanguage(lang === 'auto' ? undefined : lang)
      i18n.changeLanguage(lang === 'auto' ? undefined : lang)
    },
    [i18n],
  )

  return (
    <Dialog
      title={t('Display Settings')}
      open={props.open}
      onClose={props.onClose}
      className="rounded-xl w-[600px] min-h-[300px]"
    >
      <div className="p-5 pb-10 flex flex-col gap-5">
        <div className="w-[300px]">
          <p className="font-bold text-lg mb-3">{t('Theme Mode')}</p>
          <Select
            options={[
              { name: t('Auto'), value: ThemeMode.Auto },
              { name: t('Light'), value: ThemeMode.Light },
              { name: t('Dark'), value: ThemeMode.Dark },
            ]}
            value={themeMode}
            onChange={onThemeModeChange}
          />
        </div>
        <div>
          <p className="font-bold text-lg mb-3">{t('Theme Color')}</p>
          <div className="flex flex-col gap-3">
            {isArcBrowser() && (
              <div className="flex flex-row items-center gap-2">
                <input
                  type="checkbox"
                  id="arc-theme-check"
                  checked={followArcTheme}
                  onChange={(e) => setFollowArcTheme(e.target.checked)}
                />
                <label htmlFor="arc-theme-check">{t('Follow Arc browser theme')}</label>
              </div>
            )}
            {!followArcTheme && (
              <TwitterPicker
                colors={THEME_COLORS}
                color={themeColor}
                onChange={onThemeColorChange}
                triangle="hide"
                width="300px"
              />
            )}
          </div>
        </div>
        <div className="w-[300px]">
          <p className="font-bold text-lg mb-3">{t('Language')}</p>
          <Select
            options={[{ name: t('Auto'), value: 'auto' }, { name: 'English', value: 'en' }, ...languageOptions]}
            value={lang}
            onChange={onLanguageChange}
            position="top"
          />
        </div>
      </div>
    </Dialog>
  )
}

export default ThemeSettingModal
