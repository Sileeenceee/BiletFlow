import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { createEvent, getCities, type City } from '../api/events'
import { Field, buttonClass, inputClass } from '../components/form'
import { useLocale, type MessageKey } from '../lib/i18n'

const isValidDate = (v: string) => !Number.isNaN(Date.parse(v))
const parseImageUrls = (v: string) => v.split(/\r?\n/).map((u) => u.trim()).filter(Boolean)

// Messages are translation keys; they are translated where the error is shown.
const schema = z
  .object({
    title: z.string().trim().min(3, 'createEvent.error.min3').max(120, 'createEvent.error.max120'),
    description: z.string().trim().min(20, 'createEvent.error.min20').max(4000, 'createEvent.error.max4000'),
    venue: z.string().trim().min(1, 'form.required').max(250, 'createEvent.error.max250'),
    // Select value is the city id as a string; the empty placeholder means nothing was chosen.
    cityId: z.string().min(1, 'createEvent.chooseCity'),
    venueAddress: z.string().trim().max(300, 'createEvent.error.max300'),
    refundPolicy: z.string().trim().max(2000, 'createEvent.error.max2000'),
    startsAt: z.string().min(1, 'form.required').refine(isValidDate, 'createEvent.error.invalidDate'),
    endsAt: z.string().min(1, 'form.required').refine(isValidDate, 'createEvent.error.invalidDate'),
    category: z.string().trim().max(120, 'createEvent.error.max120'),
    capacity: z.string(),
    registrationOpensAt: z.string().refine((v) => !v || isValidDate(v), 'createEvent.error.invalidDate'),
    registrationClosesAt: z.string().refine((v) => !v || isValidDate(v), 'createEvent.error.invalidDate'),
    visibility: z.enum(['Public', 'Unlisted', 'Private']),
    imageUrls: z.string().refine((v) => {
      const urls = parseImageUrls(v)
      return urls.length <= 10 && urls.every((u) => {
        try {
          const parsed = new URL(u)
          return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        } catch {
          return false
        }
      })
    }, 'createEvent.error.imageUrls'),
    isPublished: z.boolean(),
  })
  .refine((d) => !isValidDate(d.startsAt) || !isValidDate(d.endsAt) || new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'createEvent.error.endAfterStart',
    path: ['endsAt'],
  })
  .refine((d) => !d.capacity || (Number.isInteger(Number(d.capacity)) && Number(d.capacity) > 0), {
    message: 'createEvent.error.capacity',
    path: ['capacity'],
  })
  .refine((d) => !d.registrationOpensAt || !d.registrationClosesAt || !isValidDate(d.registrationOpensAt) || !isValidDate(d.registrationClosesAt) || new Date(d.registrationClosesAt) > new Date(d.registrationOpensAt), {
    message: 'createEvent.error.closeAfterOpen',
    path: ['registrationClosesAt'],
  })
  .refine((d) => !d.registrationOpensAt || !isValidDate(d.registrationOpensAt) || !isValidDate(d.endsAt) || new Date(d.registrationOpensAt) < new Date(d.endsAt), {
    message: 'createEvent.error.openBeforeEnd',
    path: ['registrationOpensAt'],
  })
  .refine((d) => !d.registrationClosesAt || !isValidDate(d.registrationClosesAt) || !isValidDate(d.endsAt) || new Date(d.registrationClosesAt) <= new Date(d.endsAt), {
    message: 'createEvent.error.closeBeforeEnd',
    path: ['registrationClosesAt'],
  })

type FormValues = z.infer<typeof schema>

export default function CreateEvent() {
  const [formError, setFormError] = useState('')
  const [cities, setCities] = useState<City[] | null>(null)
  const [citiesError, setCitiesError] = useState('')
  const { t } = useLocale()
  const navigate = useNavigate()
  const errorText = (message?: string) => message && t(message as MessageKey)

  useEffect(() => {
    let active = true
    getCities()
      .then((data) => { if (active) setCities(data) })
      .catch((err: unknown) => { if (active) setCitiesError(err instanceof Error ? err.message : t('createEvent.loadCitiesError')) })
    return () => { active = false }
  }, [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      isPublished: false,
      cityId: '',
      venueAddress: '',
      refundPolicy: '',
      category: '',
      capacity: '',
      registrationOpensAt: '',
      registrationClosesAt: '',
      visibility: 'Public',
      imageUrls: '',
    },
  })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await createEvent({
        title: values.title,
        description: values.description,
        venue: values.venue,
        cityId: Number(values.cityId),
        startDateUtc: new Date(values.startsAt).toISOString(),
        endDateUtc: new Date(values.endsAt).toISOString(),
        isPublished: values.isPublished,
        ...(values.venueAddress.trim() ? { venueAddress: values.venueAddress.trim() } : {}),
        ...(values.refundPolicy.trim() ? { refundPolicy: values.refundPolicy.trim() } : {}),
        ...(values.category.trim() ? { category: values.category.trim() } : {}),
        ...(values.capacity ? { capacity: Number(values.capacity) } : {}),
        ...(values.registrationOpensAt ? { registrationOpensAt: new Date(values.registrationOpensAt).toISOString() } : {}),
        ...(values.registrationClosesAt ? { registrationClosesAt: new Date(values.registrationClosesAt).toISOString() } : {}),
        ...(values.visibility !== 'Public' ? { visibility: values.visibility } : {}),
        ...(values.imageUrls.trim() ? { imageUrls: parseImageUrls(values.imageUrls) } : {}),
      })
      navigate('/events')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('createEvent.createError'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <div><p className="text-sm font-semibold text-indigo-600">{t('events.organizerKicker')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('events.create')}</h1><p className="mt-2 text-sm text-slate-500">{t('createEvent.subtitle')}</p></div>

      <Field id="title" label={t('createEvent.titleLabel')} error={errorText(errors.title?.message)}>
        <input id="title" {...register('title')} className={inputClass} />
      </Field>

      <Field id="description" label={t('createEvent.description')} error={errorText(errors.description?.message)}>
        <textarea
          id="description"
          rows={5}
          {...register('description')}
          className={inputClass}
        />
      </Field>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-slate-800">{t('event.venue')}</legend>

        <Field id="venue" label={t('createEvent.venueName')} error={errorText(errors.venue?.message)}>
          <input id="venue" {...register('venue')} className={inputClass} />
        </Field>

        <Field id="venueAddress" label={t('createEvent.address')} error={errorText(errors.venueAddress?.message)}>
          <input id="venueAddress" maxLength={300} {...register('venueAddress')} className={inputClass} />
        </Field>

        <Field id="cityId" label={t('createEvent.city')} error={errorText(errors.cityId?.message)}>
          {citiesError ? (
            <p role="alert" className="text-sm text-rose-600">{t('createEvent.citiesError', { error: citiesError })}</p>
          ) : (
            <select id="cityId" disabled={!cities} {...register('cityId')} className={inputClass}>
              <option value="">{cities ? t('createEvent.chooseCity') : t('createEvent.loadingCities')}</option>
              {cities?.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
          )}
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-slate-800">{t('createEvent.when')}</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="startsAt" label={t('createEvent.starts')} error={errorText(errors.startsAt?.message)}>
            <input
              id="startsAt"
              type="datetime-local"
              {...register('startsAt')}
              className={inputClass}
            />
          </Field>

          <Field id="endsAt" label={t('createEvent.ends')} error={errorText(errors.endsAt?.message)}>
            <input
              id="endsAt"
              type="datetime-local"
              {...register('endsAt')}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label={t('createEvent.category')} error={errorText(errors.category?.message)}>
          <input id="category" maxLength={120} {...register('category')} placeholder={t('createEvent.categoryPlaceholder')} className={inputClass} />
        </Field>
        <Field id="visibility" label={t('createEvent.visibility')}>
          <select id="visibility" {...register('visibility')} className={inputClass}>
            <option value="Public">{t('createEvent.visibility.Public')}</option>
            <option value="Unlisted">{t('createEvent.visibility.Unlisted')}</option>
            <option value="Private">{t('createEvent.visibility.Private')}</option>
          </select>
        </Field>
        <Field id="capacity" label={t('createEvent.capacity')} error={errorText(errors.capacity?.message)}>
          <input id="capacity" type="number" min={1} step={1} {...register('capacity')} className={inputClass} />
        </Field>
        <Field id="registrationOpensAt" label={t('createEvent.opens')} error={errorText(errors.registrationOpensAt?.message)}>
          <input id="registrationOpensAt" type="datetime-local" {...register('registrationOpensAt')} className={inputClass} />
        </Field>
        <Field id="registrationClosesAt" label={t('createEvent.closes')} error={errorText(errors.registrationClosesAt?.message)}>
          <input id="registrationClosesAt" type="datetime-local" {...register('registrationClosesAt')} className={inputClass} />
        </Field>
        <Field id="imageUrls" label={t('createEvent.imageUrls')} error={errorText(errors.imageUrls?.message)}>
          <textarea id="imageUrls" rows={2} {...register('imageUrls')} className={inputClass} />
        </Field>
      </div>

      <Field id="refundPolicy" label={t('createEvent.refundPolicy')} error={errorText(errors.refundPolicy?.message)}>
        <textarea id="refundPolicy" rows={3} maxLength={2000} {...register('refundPolicy')} className={inputClass} />
      </Field>

      <label htmlFor="isPublished" className="flex items-center gap-2 text-sm">
        <input id="isPublished" type="checkbox" {...register('isPublished')} />
        {t('createEvent.publishNow')}
      </label>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting || !cities} className={buttonClass}>
        {isSubmitting ? t('common.saving') : t('createEvent.submit')}
      </button>
    </form>
  )
}
