import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { createEvent } from '../api/events'
import { Field, buttonClass, inputClass } from '../components/form'

const schema = z
  .object({
    title: z.string().min(3, 'At least 3 characters').max(120, 'At most 120 characters'),
    description: z.string().min(20, 'At least 20 characters'),
    venue: z.string().min(1, 'Required'),
    city: z.string().min(1, 'Required'),
    startsAt: z.string().min(1, 'Required'),
    endsAt: z.string().min(1, 'Required'),
    isPublished: z.boolean(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'End must be after start',
    path: ['endsAt'],
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
    defaultValues: { isPublished: false },
  })

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await createEvent({
        title: values.title,
        description: values.description,
        venue: values.venue,
        city: values.city,
        startDateUtc: new Date(values.startsAt).toISOString(),
        endDateUtc: new Date(values.endsAt).toISOString(),
        isPublished: values.isPublished,
      })
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

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium mb-1">Venue</legend>

        <Field id="venue" label="Name" error={errors.venue?.message}>
          <input id="venue" {...register('venue')} className={inputClass} />
        </Field>

        <Field id="city" label="City" error={errors.city?.message}>
          <input
            id="city"
            {...register('city')}
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

      <label htmlFor="isPublished" className="flex items-center gap-2 text-sm">
        <input id="isPublished" type="checkbox" {...register('isPublished')} />
        Publish event now
      </label>

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
