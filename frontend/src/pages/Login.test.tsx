import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { login } from '../api/auth'
import Login from './Login'
import { AuthProvider } from '../lib/auth'

vi.mock('../api/auth', () => ({
	login: vi.fn(),
}))

function renderLogin() {
	return render(
		<AuthProvider>
			<MemoryRouter initialEntries={['/login']}>
				<Routes>
					<Route path="/login" element={<Login />} />
					<Route path="/events" element={<h1>Events</h1>} />
				</Routes>
			</MemoryRouter>
		</AuthProvider>,
	)
}

describe('Login', () => {
	beforeEach(() => {
		localStorage.clear()
		vi.mocked(login).mockReset()
	})

	it('shows validation messages without calling the API', async () => {
		const user = userEvent.setup()
		renderLogin()

		await user.click(screen.getByRole('button', { name: 'Sign in' }))

		expect(screen.getAllByText('Required')).toHaveLength(2)
		expect(login).not.toHaveBeenCalled()
	})

	it('signs in and navigates to events after a successful login', async () => {
		const user = userEvent.setup()
		vi.mocked(login).mockResolvedValue({
			token: 'test-token',
			expiresAt: '2099-01-01T00:00:00.000Z',
			user: {
				id: 'user-1',
				email: 'attendee@example.com',
				role: 'Attendee',
				emailConfirmed: true,
			},
		})
		renderLogin()

		await user.type(screen.getByLabelText('Email'), 'attendee@example.com')
		await user.type(screen.getByLabelText('Password'), 'password123')
		await user.click(screen.getByRole('button', { name: 'Sign in' }))

		expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument()
		expect(localStorage.getItem('biletflow.session')).toContain('test-token')
	})

	it('shows an API error and stays on the form when login fails', async () => {
		const user = userEvent.setup()
		vi.mocked(login).mockRejectedValue(new Error('Invalid email or password'))
		renderLogin()

		await user.type(screen.getByLabelText('Email'), 'attendee@example.com')
		await user.type(screen.getByLabelText('Password'), 'wrongpass')
		await user.click(screen.getByRole('button', { name: 'Sign in' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
		expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
	})
})
