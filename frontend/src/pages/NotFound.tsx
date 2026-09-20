import { Link } from 'react-router'

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-gray-600">That page doesn't exist or has moved.</p>
      <Link to="/events" className="underline">
        Back to events
      </Link>
    </div>
  )
}
