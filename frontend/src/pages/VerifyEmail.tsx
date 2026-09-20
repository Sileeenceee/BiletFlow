import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { verifyEmail } from '../api/auth'
import { buttonClass, inputClass } from '../components/form'

type Status = 'idle' | 'working' | 'done' | 'failed'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const autoRan = useRef(false)

  async function submit(value: string) {
    if (!value.trim()) return
    setStatus('working')
    setMessage('')
    try {
      const res = await verifyEmail(value.trim())
      setMessage(res.message)
      setStatus('done')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Verification failed')
      setStatus('failed')
    }
  }

  // Verify automatically when arriving with ?token=… , but only once —
  // StrictMode renders effects twice in development and the token is single-use.
  useEffect(() => {
    const fromUrl = params.get('token')
    if (fromUrl && !autoRan.current) {
      autoRan.current = true
      void submit(fromUrl)
    }
  }, [params])

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Verify email</h1>

      {status === 'done' ? (
        <>
          <p role="status" className="text-green-700">
            {message}
          </p>
          <Link to="/events" className="underline">
            Continue
          </Link>
        </>
      ) : (
        <>
          <label htmlFor="token" className="block text-sm mb-1">
            Verification token
          </label>
          <input
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={inputClass}
          />

          {status === 'failed' && (
            <p role="alert" className="text-sm text-red-600">
              {message}
            </p>
          )}

          <button
            onClick={() => submit(token)}
            disabled={status === 'working'}
            className={buttonClass}
          >
            {status === 'working' ? 'Verifying…' : 'Verify'}
          </button>
        </>
      )}
    </div>
  )
}
