import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getCities, type City, type CreateEventInput, type EventSummary } from '../api/events'
import { errorMessage } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'
import { DateField } from './DateField'
import { Button, Card, ErrorText, Field, Select, Toggle, text } from './ui'

type Visibility = NonNullable<EventSummary['visibility']>

type Values = {
  title: string
  description: string
  venue: string
  cityId: string
  venueAddress: string
  timezone: string
  refundPolicy: string
  startsAt: string
  endsAt: string
  category: string
  capacity: string
  opensAt: string
  closesAt: string
  visibility: Visibility
  imageUrls: string
  isPublished: boolean
}

type Errors = Partial<Record<keyof Values, MessageKey>>

const parseImageUrls = (value: string) => value.split('\n').map((url) => url.trim()).filter(Boolean)
const isUrl = (value: string) => /^https?:\/\/\S+$/i.test(value)

/** The website's create-event rules (frontend/src/pages/CreateEvent.tsx), as error message keys. */
function validate(v: Values): Errors {
  const errors: Errors = {}
  const title = v.title.trim()
  if (title.length < 3) errors.title = 'createEvent.error.min3'
  else if (title.length > 120) errors.title = 'createEvent.error.max120'
  const description = v.description.trim()
  if (description.length < 20) errors.description = 'createEvent.error.min20'
  else if (description.length > 4000) errors.description = 'createEvent.error.max4000'
  if (!v.venue.trim()) errors.venue = 'form.required'
  else if (v.venue.trim().length > 250) errors.venue = 'createEvent.error.max250'
  if (!v.cityId) errors.cityId = 'createEvent.chooseCity'
  if (v.venueAddress.trim().length > 300) errors.venueAddress = 'createEvent.error.max300'
  if (v.refundPolicy.trim().length > 2000) errors.refundPolicy = 'createEvent.error.max2000'
  if (v.category.trim().length > 120) errors.category = 'createEvent.error.max120'
  if (!v.startsAt) errors.startsAt = 'form.required'
  if (!v.endsAt) errors.endsAt = 'form.required'
  else if (v.startsAt && new Date(v.endsAt) <= new Date(v.startsAt)) errors.endsAt = 'createEvent.error.endAfterStart'
  if (v.capacity && !(Number.isInteger(Number(v.capacity)) && Number(v.capacity) > 0)) errors.capacity = 'createEvent.error.capacity'
  if (v.opensAt && v.closesAt && new Date(v.closesAt) <= new Date(v.opensAt)) errors.closesAt = 'createEvent.error.closeAfterOpen'
  else if (v.closesAt && v.endsAt && new Date(v.closesAt) > new Date(v.endsAt)) errors.closesAt = 'createEvent.error.closeBeforeEnd'
  if (v.opensAt && v.endsAt && new Date(v.opensAt) >= new Date(v.endsAt)) errors.opensAt = 'createEvent.error.openBeforeEnd'
  const urls = parseImageUrls(v.imageUrls)
  if (urls.length > 10 || !urls.every(isUrl)) errors.imageUrls = 'createEvent.error.imageUrls'
  return errors
}

function initialValues(event?: EventSummary): Values {
  return {
    title: event?.title ?? '',
    description: event?.description ?? '',
    venue: event?.venue ?? '',
    cityId: event?.cityId ? String(event.cityId) : '',
    venueAddress: event?.venueAddress ?? '',
    timezone: event?.timezone ?? 'Asia/Almaty',
    refundPolicy: event?.refundPolicy ?? '',
    startsAt: event?.startDateUtc ?? '',
    endsAt: event?.endDateUtc ?? '',
    category: event?.category ?? '',
    capacity: event?.capacity ? String(event.capacity) : '',
    opensAt: event?.registrationOpensAt ?? '',
    closesAt: event?.registrationClosesAt ?? '',
    visibility: event?.visibility ?? 'Public',
    imageUrls: (event?.imageUrls ?? []).join('\n'),
    isPublished: event?.isPublished ?? false,
  }
}

type Props = {
  /** Editing an existing event; omitted when creating one. */
  event?: EventSummary
  submitLabel: string
  onSubmit: (input: CreateEventInput) => Promise<void>
}

/** Event details form shared by "Create event" and the Overview tab of Manage event. */
export function EventForm({ event, submitLabel, onSubmit }: Props) {
  const { t } = useLocale()
  const [values, setValues] = useState<Values>(() => initialValues(event))
  const [errors, setErrors] = useState<Errors>({})
  const [cities, setCities] = useState<City[] | null>(null)
  const [citiesError, setCitiesError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getCities()
      .then((data) => { if (active) setCities(data) })
      .catch((err: unknown) => { if (active) setCitiesError(errorMessage(err, t('createEvent.loadCitiesError'))) })
    return () => { active = false }
  }, [t])

  const set = <K extends keyof Values>(key: K) => (value: Values[K]) => setValues((current) => ({ ...current, [key]: value }))
  const error = (key: keyof Values) => (errors[key] ? t(errors[key]!) : undefined)

  async function submit() {
    const next = validate(values)
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      await onSubmit({
        title: values.title.trim(),
        description: values.description.trim(),
        venue: values.venue.trim(),
        cityId: Number(values.cityId),
        startDateUtc: values.startsAt,
        endDateUtc: values.endsAt,
        isPublished: values.isPublished,
        venueAddress: values.venueAddress.trim() || null,
        timezone: values.timezone.trim() || null,
        refundPolicy: values.refundPolicy.trim() || null,
        category: values.category.trim() || null,
        capacity: values.capacity ? Number(values.capacity) : null,
        registrationOpensAt: values.opensAt || null,
        registrationClosesAt: values.closesAt || null,
        visibility: values.visibility,
        imageUrls: parseImageUrls(values.imageUrls),
      })
    } catch (err) {
      setFormError(errorMessage(err, t('createEvent.createError')))
    } finally {
      setBusy(false)
    }
  }

  const visibilities: Visibility[] = ['Public', 'Unlisted', 'Private']
  return (
    <View style={styles.form}>
      <Card style={styles.gap}>
        <Field label={t('createEvent.titleLabel')} value={values.title} onChangeText={set('title')} error={error('title')} maxLength={120} />
        <Field label={t('createEvent.description')} value={values.description} onChangeText={set('description')} error={error('description')} multiline maxLength={4000} />
        <Field label={t('createEvent.category')} placeholder={t('createEvent.categoryPlaceholder')} value={values.category} onChangeText={set('category')} error={error('category')} />
        <Select label={t('createEvent.visibility')} value={values.visibility} onChange={(value) => set('visibility')(value as Visibility)} options={visibilities.map((value) => ({ value, label: t(`createEvent.visibility.${value}`) }))} />
      </Card>

      <Card style={styles.gap}>
        <Text style={text.subheading}>{t('event.venue')}</Text>
        <Field label={t('createEvent.venueName')} value={values.venue} onChangeText={set('venue')} error={error('venue')} />
        {citiesError ? <ErrorText message={t('createEvent.citiesError', { error: citiesError })} /> : (
          <Select
            label={t('createEvent.city')}
            value={values.cityId}
            onChange={set('cityId')}
            placeholder={cities ? t('createEvent.chooseCity') : t('createEvent.loadingCities')}
            options={(cities ?? []).map((city) => ({ value: String(city.id), label: city.name }))}
          />
        )}
        {error('cityId') ? <Text accessibilityRole="alert" style={styles.error}>{error('cityId')}</Text> : null}
        <Field label={t('createEvent.address')} value={values.venueAddress} onChangeText={set('venueAddress')} error={error('venueAddress')} />
        <Field label={t('manageEvent.timezone')} placeholder="Asia/Almaty" value={values.timezone} onChangeText={set('timezone')} autoCapitalize="none" />
      </Card>

      <Card style={styles.gap}>
        <Text style={text.subheading}>{t('createEvent.when')}</Text>
        <DateField label={t('createEvent.starts')} value={values.startsAt} onChange={set('startsAt')} error={error('startsAt')} />
        <DateField label={t('createEvent.ends')} value={values.endsAt} onChange={set('endsAt')} error={error('endsAt')} />
        <DateField label={t('createEvent.opens')} value={values.opensAt} onChange={set('opensAt')} error={error('opensAt')} optional />
        <DateField label={t('createEvent.closes')} value={values.closesAt} onChange={set('closesAt')} error={error('closesAt')} optional />
        <Field label={t('createEvent.capacity')} value={values.capacity} onChangeText={set('capacity')} error={error('capacity')} keyboardType="number-pad" />
      </Card>

      <Card style={styles.gap}>
        <Field label={t('createEvent.refundPolicy')} value={values.refundPolicy} onChangeText={set('refundPolicy')} error={error('refundPolicy')} multiline maxLength={2000} />
        <Field label={t('createEvent.imageUrls')} value={values.imageUrls} onChangeText={set('imageUrls')} error={error('imageUrls')} multiline autoCapitalize="none" keyboardType="url" />
        <Toggle label={event ? t('manageEvent.published') : t('createEvent.publishNow')} value={values.isPublished} onChange={set('isPublished')} />
      </Card>

      <ErrorText message={formError} />
      <Button label={busy ? t('common.saving') : submitLabel} busy={busy} onPress={() => void submit()} />
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  gap: { gap: 12 },
  error: { color: '#be123c', fontSize: 13 },
})
