import { useEffect, useRef, useState, type FormEvent } from 'react'
import { checkInTicket, getAssignedEvents, getCheckInSummary, reverseCheckIn, searchEventAttendees, validateTicket, type AssignedEvent, type CheckInSummary, type VerificationResult } from '../api/workflows'
import { buttonClass, inputClass } from '../components/form'
import { formatDateTime } from '../lib/format'

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

  useEffect(() => {
    getAssignedEvents()
      .then((rows) => {
        setEvents(rows)
        setEventId(rows[0]?.id ?? '')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load assigned events.'))
      .finally(() => setLoading(false))
  }, [])

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
        if (active) setError(err instanceof Error ? err.message : 'Could not load event check-in details.')
      })
    return () => { active = false }
  }, [eventId, search])

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
        if (!Detector) throw new Error('QR camera scanning is not supported in this browser. Enter the ticket code manually.')
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available. Enter the ticket code manually.')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (cancelled) return
        targetVideo.srcObject = stream
        await targetVideo.play()
        const detector = new Detector({ formats: ['qr_code'] })

        async function scanFrame() {
          if (cancelled) return
          try {
            const codes = await detector.detect(targetVideo)
            if (codes[0]?.rawValue) {
              setTicketCode(codes[0].rawValue)
              setMessage('QR captured. Validate the ticket before recording entry.')
              setCameraActive(false)
              return
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not scan this QR code.')
            setCameraActive(false)
            return
          }
          animationFrame = requestAnimationFrame(() => { void scanFrame() })
        }
        animationFrame = requestAnimationFrame(() => { void scanFrame() })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not access the camera.')
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
  }, [cameraActive])

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setResult(null)
    setBusy(true)
    try {
      const verified = await validateTicket(ticketCode.trim())
      setResult(verified)
      setMessage(verified.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This ticket could not be validated.')
    } finally {
      setBusy(false)
    }
  }

  async function checkIn() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const verified = await checkInTicket(ticketCode.trim())
      setResult(verified)
      setMessage(verified.message)
      if (verified.result === 'CheckedIn' && eventId) {
        setSummary(await getCheckInSummary(eventId))
        setAttendees(await searchEventAttendees(eventId, search))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check in this ticket.')
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
      setResult({ ...result, result: 'Valid', ticketStatus: 'Valid', checkedInAt: null, message: 'Check-in reversed.' })
      setMessage('Check-in reversed.')
      if (eventId) {
        setSummary(await getCheckInSummary(eventId))
        setAttendees(await searchEventAttendees(eventId, search))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reverse the check-in.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-slate-500">Loading assigned events…</p>
  return (
    <div className="space-y-7">
      <header><p className="text-sm font-semibold text-indigo-600">Event staff</p><h1 className="mt-1 text-3xl font-black tracking-tight">Ticket check-in</h1><p className="mt-2 text-sm text-slate-500">Validate admission tickets online and record authorized entries.</p></header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {events.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">There are no active events assigned to this account.</section> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div><h2 className="text-xl font-bold">Validate a ticket</h2><p className="mt-1 text-sm text-slate-500">Enter or paste the admission ticket code. Campaign QR codes are not admission tickets.</p></div>
              <form onSubmit={(ev) => void lookup(ev)} className="flex flex-col gap-3 sm:flex-row">
                <input required maxLength={64} value={ticketCode} onChange={(ev) => setTicketCode(ev.target.value)} aria-label="Ticket QR code" placeholder="Enter ticket code" className={`${inputClass} font-mono`} />
                <button disabled={busy || !ticketCode.trim()} className={buttonClass}>{busy ? 'Checking…' : 'Validate ticket'}</button>
              </form>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => { setError(''); setCameraActive((active) => !active) }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{cameraActive ? 'Stop camera' : 'Scan ticket QR'}</button>
                <span className="text-xs text-slate-400">Camera scan requires browser permission; code entry is always available.</span>
              </div>
              {cameraActive && <video ref={videoRef} autoPlay muted playsInline aria-label="Camera QR preview" className="max-h-72 w-full rounded-2xl bg-slate-950 object-cover" />}
              {message && <p role="status" className={`rounded-xl p-3 text-sm ${result?.result === 'CheckedIn' || result?.result === 'Valid' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700'}`}>{message}</p>}
              {result && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{result.eventTitle ?? 'Ticket details'}</p><h3 className="mt-1 text-lg font-bold">{result.attendeeName ?? 'Attendee'}</h3><p className="text-sm text-slate-500">{result.attendeeEmail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${result.result === 'Valid' ? 'bg-emerald-50 text-emerald-700' : result.result === 'CheckedIn' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}>{result.result}</span></div>
                  <p className="mt-3 text-sm text-slate-600">{result.ticketTypeName} {result.ticketStatus ? `· ${result.ticketStatus}` : ''}</p>
                  {result.result === 'Valid' && <button disabled={busy} onClick={() => void checkIn()} className={`${buttonClass} mt-4`}>Record check-in</button>}
                  {result.result === 'CheckedIn' && result.ticketId && <button disabled={busy} onClick={() => void undoCheckIn()} className="mt-4 rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50">Reverse check-in</button>}
                </div>
              )}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-sm font-semibold">Assigned event<select value={eventId} onChange={(ev) => { setEventId(ev.target.value); setResult(null); setSummary(null); setAttendees([]) }} className={`${inputClass} mt-1.5`}>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
              {summary && <div className="mt-6"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Live check-in</p><p className="mt-1 text-3xl font-black">{summary.checkedIn}<span className="text-lg font-semibold text-slate-400"> / {summary.registered}</span></p></div><span className="text-sm font-bold text-indigo-700">{summary.checkInPercentage.toFixed(0)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(summary.checkInPercentage, 100)}%` }} /></div><div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm"><p className="rounded-xl bg-slate-50 p-3"><strong className="block">{summary.remaining}</strong><span className="text-xs text-slate-500">Expected</span></p><p className="rounded-xl bg-slate-50 p-3"><strong className="block">{summary.registered}</strong><span className="text-xs text-slate-500">Registered</span></p></div></div>}
            </section>
          </div>

          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Attendee lookup</h2><p className="mt-1 text-sm text-slate-500">{events.find((event) => event.id === eventId)?.title} · {formatDateTime(events.find((event) => event.id === eventId)?.startDateUtc ?? '')}</p></div><input aria-label="Search assigned event attendees" value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Search name or email" className={`${inputClass} max-w-sm`} /></div>
            {attendees.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">No attendee tickets match this search.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="p-3">Attendee</th><th className="p-3">Ticket type</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{attendees.map((attendee) => <tr key={attendee.ticketId} className="border-t border-slate-100"><td className="p-3"><strong>{attendee.attendeeName}</strong><span className="block text-xs text-slate-500">{attendee.attendeeEmail}</span></td><td className="p-3">{attendee.ticketTypeName}</td><td className="p-3">{attendee.status}</td><td className="p-3">{attendee.status === 'CheckedIn' && <button onClick={() => void (async () => { setBusy(true); setError(''); try { await reverseCheckIn(attendee.ticketId); setMessage(`Check-in reversed for ${attendee.attendeeName}.`); setSummary(await getCheckInSummary(eventId)); setAttendees(await searchEventAttendees(eventId, search)); } catch (err) { setError(err instanceof Error ? err.message : 'Could not reverse the check-in.'); } finally { setBusy(false); } })()} disabled={busy} className="text-xs font-semibold text-indigo-700 hover:underline">Reverse check-in</button>}</td></tr>)}</tbody></table></div>}
          </section>
        </>
      )}
    </div>
  )
}
