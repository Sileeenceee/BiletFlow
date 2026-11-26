import { useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { createEvent, getCities, type City, type EventSummary } from '../api/events'
import { EventArt } from '../components/EventCard'
import { Field, inputClass } from '../components/form'
import { CalendarIcon, CheckIcon, PinIcon } from '../components/icons'
import { StepProgress } from '../components/StepProgress'
import { formatEventDate } from '../lib/format'
import { useLocale, type MessageKey } from '../lib/i18n'

const isValidDate = (v: string) => !Number.isNaN(Date.parse(v))
const parseImageUrls = (v: string) => v.split(/\r?\n/).map((u) => u.trim()).filter(Boolean)
// Suggestions only: the category stays free text.
const CATEGORY_SUGGESTIONS = ['Music', 'Business', 'Community', 'Arts', 'Food', 'Technology', 'Cinema', 'Sports', 'Education']

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

/** Step 1 of creating an event (design 4.2). The event is saved as a draft; tickets and publishing follow. */
export default function CreateEvent() {
  const [formError, setFormError] = useState('')
  const [cities, setCities] = useState<City[] | null>(null)
  const [citiesError, setCitiesError] = useState('')
  const [intent, setIntent] = useState<'continue' | 'draft'>('continue')
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

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      cityId: '', venueAddress: '', refundPolicy: '', category: '', capacity: '',
      registrationOpensAt: '', registrationClosesAt: '', visibility: 'Public', imageUrls: '',
    },
  })
  const values = useWatch({ control })

  async function onSubmit(form: FormValues) {
    setFormError('')
    try {
      const created = await createEvent({
        title: form.title,
        description: form.description,
        venue: form.venue,
        cityId: Number(form.cityId),
        startDateUtc: new Date(form.startsAt).toISOString(),
        endDateUtc: new Date(form.endsAt).toISOString(),
        // Publishing happens in the last step, once tickets exist.
        isPublished: false,
        ...(form.venueAddress.trim() ? { venueAddress: form.venueAddress.trim() } : {}),
        ...(form.refundPolicy.trim() ? { refundPolicy: form.refundPolicy.trim() } : {}),
        ...(form.category.trim() ? { category: form.category.trim() } : {}),
        ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
        ...(form.registrationOpensAt ? { registrationOpensAt: new Date(form.registrationOpensAt).toISOString() } : {}),
        ...(form.registrationClosesAt ? { registrationClosesAt: new Date(form.registrationClosesAt).toISOString() } : {}),
        ...(form.visibility !== 'Public' ? { visibility: form.visibility } : {}),
        ...(form.imageUrls.trim() ? { imageUrls: parseImageUrls(form.imageUrls) } : {}),
      })
      void navigate(intent === 'draft' ? `/events/${created.id}/manage` : `/events/${created.id}/setup`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('createEvent.createError'))
    }
  }

  const cityName = cities?.find((city) => String(city.id) === values.cityId)?.name ?? ''
  const preview: EventSummary = {
    id: 'preview', title: values.title?.trim() || t('createEvent.previewTitle'), description: '', venue: values.venue ?? '', city: cityName, cityId: 0,
    startDateUtc: values.startsAt && isValidDate(values.startsAt) ? new Date(values.startsAt).toISOString() : '', endDateUtc: '', isPublished: false,
    category: values.category?.trim() || null, imageUrls: parseImageUrls(values.imageUrls ?? '').slice(0, 1),
  }
  const checks: [MessageKey, boolean][] = [
    ['createEvent.check.basics', (values.title?.trim().length ?? 0) >= 3 && (values.description?.trim().length ?? 0) >= 20],
    ['createEvent.check.when', !!values.startsAt && !!values.endsAt && !!values.venue?.trim() && !!values.cityId],
    ['createEvent.check.visibility', !!values.visibility],
    ['createEvent.check.tickets', false],
    ['createEvent.check.cover', parseImageUrls(values.imageUrls ?? '').length > 0],
  ]
  const section = 'rounded-2xl border border-slate-200 bg-white p-7'
  const sectionTitle = 'font-display text-[23px] font-bold text-slate-900'

  return (
    <div className="mx-auto max-w-[1100px]">
      <StepProgress label={t('createEvent.progress')} current={1} steps={[t('createEvent.step.details'), t('createEvent.step.tickets'), t('createEvent.step.review')]} />
      <h1 className="mt-6 font-display text-[30px] font-bold text-slate-900">{t('createEvent.heading')}</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className={section}>
            <h2 className={sectionTitle}>{t('createEvent.basics')}</h2>
            <div className="mt-5 space-y-5">
              <Field id="title" label={t('createEvent.titleLabel')} error={errorText(errors.title?.message)}>
                <input id="title" {...register('title')} className={inputClass} />
              </Field>
              <div className="sm:max-w-sm">
                <Field id="category" label={t('createEvent.category')} error={errorText(errors.category?.message)}>
                  <input id="category" list="category-suggestions" maxLength={120} {...register('category')} placeholder={t('createEvent.categoryPlaceholder')} className={inputClass} />
                  <datalist id="category-suggestions">{CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
                </Field>
              </div>
              <Field id="description" label={t('createEvent.description')} error={errorText(errors.description?.message)}>
                <textarea id="description" rows={5} {...register('description')} className={inputClass} />
              </Field>
              <Field id="imageUrls" label={t('createEvent.coverImage')} error={errorText(errors.imageUrls?.message)}>
                <textarea id="imageUrls" rows={2} {...register('imageUrls')} placeholder="https://" className={`${inputClass} border-dashed bg-[#F6F8FB]`} />
                <p className="mt-1.5 text-xs text-slate-500">{t('createEvent.coverHint')}</p>
              </Field>
            </div>
          </section>

          <section className={section}>
            <h2 className={sectionTitle}>{t('createEvent.dateVenue')}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field id="startsAt" label={t('createEvent.starts')} error={errorText(errors.startsAt?.message)}>
                <input id="startsAt" type="datetime-local" {...register('startsAt')} className={inputClass} />
              </Field>
              <Field id="endsAt" label={t('createEvent.ends')} error={errorText(errors.endsAt?.message)}>
                <input id="endsAt" type="datetime-local" {...register('endsAt')} className={inputClass} />
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
              <Field id="venue" label={t('createEvent.venueName')} error={errorText(errors.venue?.message)}>
                <input id="venue" {...register('venue')} className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="venueAddress" label={t('createEvent.address')} error={errorText(errors.venueAddress?.message)}>
                  <input id="venueAddress" maxLength={300} {...register('venueAddress')} className={inputClass} />
                </Field>
              </div>
            </div>
          </section>

          <section className={section}>
            <h2 className={sectionTitle}>{t('createEvent.visibilityTitle')}</h2>
            <fieldset className="mt-5 space-y-4">
              <legend className="sr-only">{t('createEvent.visibility')}</legend>
              {(['Public', 'Unlisted', 'Private'] as const).map((value) => (
                <label key={value} className="flex cursor-pointer gap-3">
                  <input type="radio" value={value} {...register('visibility')} className="mt-1 size-[18px] accent-brand-500" />
                  <span><span className="block font-bold text-slate-900">{t(`createEvent.visibility.${value}`)}</span><span className="block text-[13px] text-slate-600">{t(`createEvent.visibilityHint.${value}`)}</span></span>
                </label>
              ))}
            </fieldset>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field id="registrationOpensAt" label={t('createEvent.opens')} error={errorText(errors.registrationOpensAt?.message)}>
                <input id="registrationOpensAt" type="datetime-local" {...register('registrationOpensAt')} className={inputClass} />
              </Field>
              <Field id="registrationClosesAt" label={t('createEvent.closes')} error={errorText(errors.registrationClosesAt?.message)}>
                <input id="registrationClosesAt" type="datetime-local" {...register('registrationClosesAt')} className={inputClass} />
              </Field>
              <Field id="capacity" label={t('createEvent.capacity')} error={errorText(errors.capacity?.message)}>
                <input id="capacity" type="number" min={1} step={1} {...register('capacity')} className={inputClass} />
              </Field>
            </div>
            <div className="mt-5">
              <Field id="refundPolicy" label={t('createEvent.refundPolicy')} error={errorText(errors.refundPolicy?.message)}>
                <textarea id="refundPolicy" rows={3} maxLength={2000} {...register('refundPolicy')} className={inputClass} />
              </Field>
            </div>
          </section>

          {formError && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{formError}</p>}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <button type="submit" onClick={() => setIntent('draft')} disabled={isSubmitting || !cities} className="h-12 rounded-lg border border-slate-300 bg-white px-8 text-[15px] font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-50">{t('createEvent.saveDraft')}</button>
            <button type="submit" onClick={() => setIntent('continue')} disabled={isSubmitting || !cities} className="h-12 rounded-lg bg-brand-500 px-16 text-[15px] font-bold text-white hover:bg-brand-600 disabled:opacity-50">{isSubmitting ? t('common.saving') : t('createEvent.submit')}</button>
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-[17px] font-bold text-slate-900">{t('createEvent.preview')}</h2>
            <div className="mt-3 rounded-2xl border border-slate-200 p-2">
              <EventArt event={preview} className="h-[150px]" />
              <div className="px-3 pb-2 pt-3">
                {preview.category && <p className="text-[13px] font-bold text-brand-500">{preview.category}</p>}
                <p className="font-display text-lg font-bold leading-snug text-slate-900">{preview.title}</p>
                {preview.startDateUtc && <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-600"><CalendarIcon className="size-4" />{formatEventDate(preview.startDateUtc)}</p>}
                {(preview.venue || cityName) && <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><PinIcon className="size-4" />{[preview.venue, cityName].filter(Boolean).join(', ')}</p>}
              </div>
            </div>
          </section>
          <Checklist title={t('createEvent.beforePublish')}>
            {checks.map(([label, done]) => <CheckRow key={label} done={done}>{t(label)}</CheckRow>)}
          </Checklist>
        </aside>
      </form>
    </div>
  )
}

function Checklist({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-display text-[17px] font-bold text-slate-900">{title}</h2>
      <ul className="mt-4 space-y-3">{children}</ul>
    </section>
  )
}

function CheckRow({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[15px] text-slate-700">
      {done
        ? <span className="grid size-5 place-items-center rounded-full bg-[#DCFCE7] text-[#15803D]"><CheckIcon className="size-3.5" /></span>
        : <span className="size-5 rounded-full border-2 border-slate-300" />}
      {children}
    </li>
  )
}
