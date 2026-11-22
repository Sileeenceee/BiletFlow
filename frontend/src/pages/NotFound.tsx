import { Link } from 'react-router'
import { useLocale } from '../lib/i18n'

export default function NotFound() {
  const { t } = useLocale()
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="text-gray-600">{t('notFound.text')}</p>
      <Link to="/events" className="underline">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
