import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('an attendee registers, verifies their email, reserves a free ticket, and downloads it', async ({ page, request }) => {
  const id = randomUUID()
  const organizer = { email: `e2e-organizer-${id}@example.test`, password: 'BrowserTestPassword123!' }
  const title = `Browser test event ${id}`
  const registration = await request.post('/api/auth/register', {
    data: { ...organizer, createOrganizerProfile: true },
  })
  expect(registration.status()).toBe(201)
  const { verificationToken } = await registration.json()
  expect(verificationToken).toBeTruthy()
  await expect(await request.post('/api/auth/verify-email', { data: { token: verificationToken } })).toBeOK()
  const login = await request.post('/api/auth/login', { data: organizer })
  await expect(login).toBeOK()
  const { accessToken } = await login.json()
  const headers = { Authorization: `Bearer ${accessToken}` }

  const cities = await request.get('/api/cities')
  await expect(cities).toBeOK()
  const [city] = await cities.json()
  const event = await request.post('/api/events', {
    headers,
    data: {
      title, description: 'End-to-end checkout test', venue: 'Browser Test Hall', cityId: city.id,
      startDateUtc: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endDateUtc: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      isPublished: true,
    },
  })
  expect(event.status()).toBe(201)
  const { id: eventId } = await event.json()
  const ticketType = await request.post(`/api/events/${eventId}/ticket-types`, {
    headers, data: { name: 'General admission', price: 0, quantity: 1 },
  })
  expect(ticketType.status()).toBe(201)

  await page.goto('/register')
  await page.getByLabel('First name').fill('Browser')
  await page.getByLabel('Last name').fill('Attendee')
  await page.getByLabel('Email', { exact: true }).fill(`e2e-attendee-${id}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('BrowserTestPassword123!')
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('link', { name: 'Verify email now' }).click()
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible()

  await page.goto('/events')
  await page.getByRole('textbox', { name: 'Search events' }).fill(title)
  await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })
    .getByRole('link', { name: 'View event' }).click()
  await page.getByRole('button', { name: 'Add one General admission' }).click()
  await page.getByRole('button', { name: 'Get tickets' }).click()
  await page.getByLabel('Full name').fill('Browser Attendee')
  await page.getByRole('button', { name: 'Reserve free ticket' }).click()
  await expect(page.getByRole('heading', { name: 'You are going!' })).toBeVisible()
  await page.goto('/orders')
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible()
  const ticketRow = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) })
  await expect(ticketRow).toBeVisible()

  const downloadStarted = page.waitForEvent('download')
  await ticketRow.getByRole('button', { name: 'PDF' }).click()
  const download = await downloadStarted
  expect(download.suggestedFilename()).toMatch(/^biletflow-ticket-.*\.pdf$/)
  const pdf = await readFile(await download.path())
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
})

test('a signed-out visitor is redirected from their orders to sign in', async ({ page }) => {
  await page.goto('/orders')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
})
