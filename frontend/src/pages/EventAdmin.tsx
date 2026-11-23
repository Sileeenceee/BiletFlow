import { useEffect, useRef, useState, type FormEvent } from 'react'
import { checkInTicket, getAssignedEvents, getCheckInSummary, reverseCheckIn, searchEventAttendees, validateTicket, type AssignedEvent, type CheckInSummary, type VerificationResult } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { formatDateTime } from '../lib/format'
import { isMessageKey, useLocale } from '../lib/i18n'

type CheckedAttendee = Awaited<ReturnType<typeof searchEventAttendees>>[number]
type QrDetector = {
  detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}
type QrDetectorConstructor = new (options: { formats: string[] }) => QrDetector

export default function EventAdmin() {
  const [events, setEvents] = useState<AssignedEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [summary, setSummary] = useState<CheckInSummary | null>(null)
  const [attendees, setAttendees] = useState<CheckedAttendee[]>([])
  const [search, setSearch] = useState('')
  const [ticketCode, setTicketCode] = useState('')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { t } = useLocale()
  const statusLabel = (key: string, fallback: string) => (isMessageKey(key) ? t(key) : fallback)

  useEffect(() => {
    getAssignedEvents()
      .then((rows) => {
        setEvents(rows)
        setEventId(rows[0]?.id ?? '')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('checkin.loadError')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    if (!eventId) {
      return
    }
    let active = true
    Promise.all([getCheckInSummary(eventId), searchEventAttendees(eventId, search)])
      .then(([counts, people]) => {
        if (!active) return
        setSummary(counts)
        setAttendees(people)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t('checkin.detailsError'))
      })
    return () => { active = false }
  }, [eventId, search, t])

  useEffect(() => {
    if (!cameraActive) return
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let stream: MediaStream | null = null
    let animationFrame = 0

    async function startScanner(targetVideo: HTMLVideoElement) {
      try {
        const Detector = (window as Window & { BarcodeDetector?: QrDetectorConstructor }).BarcodeDetector
        if (!Detector) throw new Error(t('checkin.unsupported'))
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('checkin.noCamera'))
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          stream = null
          return
        }
        targetVideo.srcObject = stream
        await targetVideo.play()
        const detector = new Detector({ formats: ['qr_code'] })

        async function scanFrame() {
          if (cancelled) return
          try {
            const codes = await detector.detect(targetVideo)
            if (codes[0]?.rawValue) {
              setTicketCode(codes[0].rawValue)
              setMessage(t('checkin.captured'))
              setCameraActive(false)
              return
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : t('checkin.scanError'))
            setCameraActive(false)
            return
          }
          animationFrame = requestAnimationFrame(() => { void scanFrame() })
        }
        animationFrame = requestAnimationFrame(() => { void scanFrame() })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('checkin.cameraError'))
          setCameraActive(false)
        }
      }
    }

    void startScanner(video)
    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null
    }
  }, [cameraActive, t])

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setResult(null)
    setBusy(true)
    try {
      const verified = await validateTicket(ticketCode.trim(), eventId || undefined)
      setResult(verified)
      setMessage(verified.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkin.validateError'))
    } finally {
      setBusy(false)
    }
  }

  async function checkIn() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const verified = await checkInTicket(ticketCode.trim(), eventId || undefined)
      setResult(verified)
      setMessage(verified.message)
      if (verified.result === 'CheckedIn' && eventId) {
        setSummary(await getCheckInSummary(eventId))
        setAttendees(await searchEventAttendees(eventId, search))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkin.checkInError'))
    } finally {
      setBusy(false)
    }
  }

  async function undoCheckIn() {
    if (!result?.ticketId) return
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await reverseCheckIn(result.ticketId)
      setResult({ ...result, result: 'Valid', ticketStatus: 'Valid', checkedInAt: null, message: t('checkin.reversed') })
      setMessage(t('checkin.reversed'))
      if (eventId) {
        setSummary(await getCheckInSummary(eventId))
        setAttendees(await searchEventAttendees(eventId, search))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkin.reverseError'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-slate-500">{t('checkin.loading')}</p>
  return (
    <div className="space-y-7">
      <header><p className="text-sm font-semibold text-indigo-600">{t('role.EventAdmin')}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{t('checkin.title')}</h1><p className="mt-2 text-sm text-slate-500">{t('checkin.subtitle')}</p></header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {events.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('checkin.noEvents')}</section> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div><h2 className="text-xl font-bold">{t('checkin.validateTitle')}</h2><p className="mt-1 text-sm text-slate-500">{t('checkin.validateText')}</p></div>
              <form onSubmit={(ev) => void lookup(ev)} className="flex flex-col gap-3 sm:flex-row">
                <input required maxLength={64} value={ticketCode} onChange={(ev) => setTicketCode(ev.target.value)} aria-label={t('checkin.codeLabel')} placeholder={t('checkin.codePlaceholder')} className={`${inputClass} font-mono`} />
                <button disabled={busy || !ticketCode.trim()} className={buttonClass}>{busy ? t('checkin.checking') : t('checkin.validate')}</button>
              </form>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => { setError(''); setCameraActive((active) => !active) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{cameraActive ? t('checkin.stopCamera') : t('checkin.scan')}</button>
                <span className="text-xs text-slate-400">{t('checkin.cameraHint')}</span>
              </div>
              {cameraActive && <video ref={videoRef} autoPlay muted playsInline aria-label={t('checkin.preview')} className="max-h-72 w-full rounded-2xl bg-slate-950 object-cover" />}
              {message && <p role="status" className={`rounded-xl p-3 text-sm ${result?.result === 'CheckedIn' || result?.result === 'Valid' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}`}>{message}</p>}
              {result && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{result.eventTitle ?? t('checkin.ticketDetails')}</p><h3 className="mt-1 text-lg font-bold">{result.attendeeName ?? t('role.Attendee')}</h3><p className="text-sm text-slate-500">{result.attendeeEmail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${result.result === 'Valid' ? 'bg-emerald-50 text-emerald-700' : result.result === 'CheckedIn' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}>{statusLabel(`checkin.result.${result.result}`, result.result)}</span></div>
                  <p className="mt-3 text-sm text-slate-600">{result.ticketTypeName} {result.ticketStatus ? `· ${statusLabel(`orders.ticketStatus.${result.ticketStatus}`, result.ticketStatus)}` : ''}</p>
                  {result.result === 'Valid' && <button disabled={busy} onClick={() => void checkIn()} className={`${buttonClass} mt-4`}>{t('checkin.record')}</button>}
                  {(result.result === 'CheckedIn' || result.result === 'AlreadyUsed') && result.ticketId && <button disabled={busy} onClick={() => void undoCheckIn()} className="mt-4 rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50">{t('checkin.reverse')}</button>}
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-sm font-semibold">{t('checkin.assignedEvent')}<select value={eventId} onChange={(ev) => { setEventId(ev.target.value); setResult(null); setSummary(null); setAttendees([]) }} className={`${inputClass} mt-1.5`}>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
              {summary && <div className="mt-6"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('checkin.live')}</p><p className="mt-1 text-3xl font-black">{summary.checkedIn}<span className="text-lg font-semibold text-slate-400"> / {summary.registered}</span></p></div><span className="text-sm font-bold text-indigo-700">{summary.checkInPercentage.toFixed(0)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(summary.checkInPercentage, 100)}%` }} /></div><div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm"><p className="rounded-xl bg-slate-50 p-3"><strong className="block">{summary.remaining}</strong><span className="text-xs text-slate-500">{t('checkin.expected')}</span></p><p className="rounded-xl bg-slate-50 p-3"><strong className="block">{summary.registered}</strong><span className="text-xs text-slate-500">{t('checkin.registered')}</span></p></div></div>}
            </section>
          </div>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">{t('checkin.lookupTitle')}</h2><p className="mt-1 text-sm text-slate-500">{events.find((event) => event.id === eventId)?.title} · {formatDateTime(events.find((event) => event.id === eventId)?.startDateUtc ?? '')}</p></div><input aria-label={t('checkin.searchLabel')} value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder={t('checkin.searchPlaceholder')} className={`${inputClass} max-w-sm`} /></div>
            {attendees.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">{t('checkin.noMatch')}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">{t('role.Attendee')}</th><th className="p-3">{t('analytics.ticketType')}</th><th className="p-3">{t('common.status')}</th><th className="p-3">{t('common.action')}</th></tr></thead><tbody>{attendees.map((attendee) => <tr key={attendee.ticketId} className="border-t border-slate-100"><td className="p-3"><strong>{attendee.attendeeName}</strong><span className="block text-xs text-slate-500">{attendee.attendeeEmail}</span></td><td className="p-3">{attendee.ticketTypeName}</td><td className="p-3">{statusLabel(`orders.ticketStatus.${attendee.status}`, attendee.status)}</td><td className="p-3">{attendee.status === 'CheckedIn' && <button onClick={() => void (async () => { setBusy(true); setError(''); try { await reverseCheckIn(attendee.ticketId); setMessage(t('checkin.reversedFor', { name: attendee.attendeeName })); setSummary(await getCheckInSummary(eventId)); setAttendees(await searchEventAttendees(eventId, search)); } catch (err) { setError(err instanceof Error ? err.message : t('checkin.reverseError')); } finally { setBusy(false); } })()} disabled={busy} className="text-xs font-semibold text-indigo-700 hover:underline">{t('checkin.reverse')}</button>}</td></tr>)}</tbody></table></div>}
          </section>
        </>
      )}
    </div>
  )
}
