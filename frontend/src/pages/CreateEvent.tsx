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
    category: z.string().max(80, 'At most 80 characters'),
    capacity: z.string(),
    registrationOpensAt: z.string(),
    registrationClosesAt: z.string(),
    visibility: z.enum(['Public', 'Unlisted', 'Private']),
    imageUrls: z.string(),
    isPublished: z.boolean(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'End must be after start',
    path: ['endsAt'],
  })
  .refine((d) => !d.capacity || (Number.isInteger(Number(d.capacity)) && Number(d.capacity) > 0), {
    message: 'Capacity must be a positive whole number',
    path: ['capacity'],
  })
  .refine((d) => !d.registrationOpensAt || !d.registrationClosesAt || new Date(d.registrationClosesAt) > new Date(d.registrationOpensAt), {
    message: 'Registration close must be after open',
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
    defaultValues: {
      isPublished: false,
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
        city: values.city,
        startDateUtc: new Date(values.startsAt).toISOString(),
        endDateUtc: new Date(values.endsAt).toISOString(),
        isPublished: values.isPublished,
        ...(values.category.trim() ? { category: values.category.trim() } : {}),
        ...(values.capacity ? { capacity: Number(values.capacity) } : {}),
        ...(values.registrationOpensAt ? { registrationOpensAt: new Date(values.registrationOpensAt).toISOString() } : {}),
        ...(values.registrationClosesAt ? { registrationClosesAt: new Date(values.registrationClosesAt).toISOString() } : {}),
        ...(values.visibility !== 'Public' ? { visibility: values.visibility } : {}),
        ...(values.imageUrls.trim() ? { imageUrls: values.imageUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean) } : {}),
      })
      navigate('/events')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the event')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <div><p className="text-sm font-semibold text-indigo-600">Organizer workspace</p><h1 className="mt-1 text-3xl font-black tracking-tight">Create an event</h1><p className="mt-2 text-sm text-slate-500">Set up the basics now. You can configure ticket types, campaigns, and event staff after saving.</p></div>

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
        <legend className="mb-1 text-sm font-semibold text-slate-800">Venue</legend>

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
        <legend className="mb-1 text-sm font-semibold text-slate-800">When</legend>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label="Category">
          <input id="category" {...register('category')} placeholder="Music, community, workshop…" className={inputClass} />
        </Field>
        <Field id="visibility" label="Visibility">
          <select id="visibility" {...register('visibility')} className={inputClass}>
            <option value="Public">Public — listed for everyone</option>
            <option value="Unlisted">Unlisted — share a direct link</option>
            <option value="Private">Private — organizer only</option>
          </select>
        </Field>
        <Field id="capacity" label="Event capacity (optional)" error={errors.capacity?.message}>
          <input id="capacity" type="number" min={1} step={1} {...register('capacity')} className={inputClass} />
        </Field>
        <Field id="registrationOpensAt" label="Registration opens (optional)">
          <input id="registrationOpensAt" type="datetime-local" {...register('registrationOpensAt')} className={inputClass} />
        </Field>
        <Field id="registrationClosesAt" label="Registration closes (optional)" error={errors.registrationClosesAt?.message}>
          <input id="registrationClosesAt" type="datetime-local" {...register('registrationClosesAt')} className={inputClass} />
        </Field>
        <Field id="imageUrls" label="Image URLs (optional, one per line)">
          <textarea id="imageUrls" rows={2} {...register('imageUrls')} className={inputClass} />
        </Field>
      </div>

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
