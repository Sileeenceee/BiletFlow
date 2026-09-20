import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { fakeCreateEvent } from '../api/events'
import { Field, buttonClass, inputClass } from '../components/form'

const CATEGORIES = [
  'Concert',
  'Conference',
  'Workshop',
  'Sport',
  'Theatre',
  'Meetup',
  'Other',
] as const

const schema = z
  .object({
    title: z.string().min(3, 'At least 3 characters').max(120, 'At most 120 characters'),
    description: z.string().min(20, 'At least 20 characters'),
    category: z.string().min(1, 'Pick a category'),
    venueName: z.string().min(1, 'Required'),
    venueAddress: z.string().min(1, 'Required'),
    startsAt: z.string().min(1, 'Required'),
    endsAt: z.string().min(1, 'Required'),
    registrationOpensAt: z.string().min(1, 'Required'),
    registrationClosesAt: z.string().min(1, 'Required'),
    visibility: z.enum(['public', 'unlisted', 'private']),
    capacity: z.number().int('Whole numbers only').positive('Must be greater than 0'),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'End must be after start',
    path: ['endsAt'],
  })
  .refine(
    (d) => new Date(d.registrationClosesAt) > new Date(d.registrationOpensAt),
    {
      message: 'Registration must close after it opens',
      path: ['registrationClosesAt'],
    },
  )
  .refine((d) => new Date(d.registrationClosesAt) <= new Date(d.startsAt), {
    message: 'Registration must close before the event starts',
    path: ['registrationClosesAt'],
  })

type FormValues = z.infer<typeof schema>

export default function CreateEvent() {
  const [formError, setFormError] = useState('')
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { visibility: 'public', capacity: 100, category: '' },
  })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await fakeCreateEvent(values)
      navigate('/events')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the event')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Create event</h1>

      <Field id="title" label="Title" error={errors.title?.message}>
        <input id="title" {...register('title')} className={inputClass} />
      </Field>

      <Field id="description" label="Description" error={errors.description?.message}>
        <textarea
          id="description"
          rows={5}
          {...register('description')}
          className={inputClass}
        />
      </Field>

      <Field id="category" label="Category" error={errors.category?.message}>
        <select id="category" {...register('category')} className={inputClass}>
          <option value="">Select a category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium mb-1">Venue</legend>

        <Field id="venueName" label="Name" error={errors.venueName?.message}>
          <input id="venueName" {...register('venueName')} className={inputClass} />
        </Field>

        <Field id="venueAddress" label="Address" error={errors.venueAddress?.message}>
          <input
            id="venueAddress"
            {...register('venueAddress')}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium mb-1">When</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="startsAt" label="Starts" error={errors.startsAt?.message}>
            <input
              id="startsAt"
              type="datetime-local"
              {...register('startsAt')}
              className={inputClass}
            />
          </Field>

          <Field id="endsAt" label="Ends" error={errors.endsAt?.message}>
            <input
              id="endsAt"
              type="datetime-local"
              {...register('endsAt')}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium mb-1">Registration window</legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="registrationOpensAt"
            label="Opens"
            error={errors.registrationOpensAt?.message}
          >
            <input
              id="registrationOpensAt"
              type="datetime-local"
              {...register('registrationOpensAt')}
              className={inputClass}
            />
          </Field>

          <Field
            id="registrationClosesAt"
            label="Closes"
            error={errors.registrationClosesAt?.message}
          >
            <input
              id="registrationClosesAt"
              type="datetime-local"
              {...register('registrationClosesAt')}
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="visibility" label="Visibility">
          <select id="visibility" {...register('visibility')} className={inputClass}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </Field>

        <Field id="capacity" label="Capacity" error={errors.capacity?.message}>
          <input
            id="capacity"
            type="number"
            {...register('capacity', { valueAsNumber: true })}
            className={inputClass}
          />
        </Field>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={buttonClass}>
        {isSubmitting ? 'Saving…' : 'Create event'}
      </button>
    </form>
  )
}
