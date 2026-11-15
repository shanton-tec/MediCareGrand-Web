import 'dotenv/config'
import express from 'express'; import cors from 'cors'; import helmet from 'helmet'; import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SLOTS = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '04:00 PM', '04:30 PM', '05:00 PM']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TZ = +(process.env.HOSPITAL_TZ_OFFSET_MIN ?? 330)
const today = () => new Date(Date.now() + TZ * 6e4).toISOString().slice(0, 10)
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/, PHONE = /^\+?[0-9 ()-]{7,15}$/, DATE = /^\d{4}-\d\d-\d\d$/
const fail = (status, message) => Object.assign(new Error(message), { status })
const must = ({ data, error }) => { if (error) { console.error(error); throw fail(500, 'Database error') } return data }

const app = express()
app.use(helmet(), cors({ origin: process.env.CLIENT_ORIGIN }), express.json({ limit: '50kb' }))
app.use(async (q, _r, next) => {  // verify Supabase login token
  try {
    const t = (q.headers.authorization || '').replace('Bearer ', '')
    if (t) { const { data } = await sb.auth.getUser(t)
      if (data?.user) q.user = (await sb.from('patients').select('*').eq('id', data.user.id).maybeSingle()).data }
  } catch {} next()
})
const route = (m, p, h) => app[m](p, (q, r) => h(q, r).catch(e => e.status ? r.status(e.status).json({ error: e.message }) : (console.error(e), r.status(500).json({ error: 'Internal server error' }))))
const authed = q => { if (!q.user) throw fail(401, 'Please sign in.') }

app.use('/api/register', rateLimit({ windowMs: 15 * 60e3, max: 20 }))
route('post', '/api/register', async (q, r) => {
  const { name, email, phone, password } = q.body
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password) throw fail(400, 'All fields are required.')
  if (!EMAIL.test(email) || !PHONE.test(phone) || password.length < 8) throw fail(400, 'Enter a valid email, phone and a password of 8+ characters.')
  const { data, error } = await sb.auth.admin.createUser({ email: email.trim().toLowerCase(), password, email_confirm: true })
  if (error) throw fail(409, 'That email is already registered.')
  const { error: e2 } = await sb.from('patients').insert({ id: data.user.id, name: name.trim().slice(0, 100), email: email.trim().toLowerCase(), phone: phone.trim() })
  if (e2) { await sb.auth.admin.deleteUser(data.user.id); throw fail(500, 'Could not create the account.') }
  r.json({ ok: true })
})
route('get', '/api/me', async (q, r) => { authed(q); r.json({ patient: { id: q.user.id, name: q.user.name, email: q.user.email } }) })
route('get', '/api/doctors', async (_q, r) => r.json({ doctors: must(await sb.from('doctors').select('*').order('id')) }))
route('get', '/api/booked-slots', async (q, r) => {
  authed(q); const { doctor_id, date } = q.query
  if (!/^\d+$/.test(doctor_id || '') || !DATE.test(date || '')) throw fail(400, 'doctor_id and date required')
  const rows = must(await sb.from('appointments').select('time_slot').eq('doctor_id', doctor_id).eq('appointment_date', date).eq('status', 'BOOKED'))
  r.json({ booked: rows.map(x => x.time_slot) })
})
route('post', '/api/appointments', async (q, r) => {
  authed(q); const { doctor_id, date, time_slot } = q.body
  if (!Number.isInteger(doctor_id) || !DATE.test(date || '') || !SLOTS.includes(time_slot)) throw fail(400, 'Booking failed. Please check the date and slot, then try again.')
  if (date < today()) throw fail(400, 'Past dates cannot be booked.')
  const d = (await sb.from('doctors').select('*').eq('id', doctor_id).maybeSingle()).data
  if (!d) throw fail(404, 'Doctor not found.')
  const day = WD[new Date(date + 'T00:00:00Z').getUTCDay()]
  if (!d.available_days.split(',').map(s => s.trim()).includes(day)) throw fail(400, `${d.name} is not available on ${day}. Available: ${d.available_days}.`)
  const { error } = await sb.from('appointments').insert({ patient_id: q.user.id, doctor_id, appointment_date: date, time_slot })
  if (error) throw fail(error.code === '23505' ? 409 : 500, error.code === '23505' ? 'That time slot was just taken. Please choose another one.' : 'Booking failed. Please try again.')
  r.json({ ok: true, doctor: d.name })
})
route('get', '/api/appointments', async (q, r) => {
  authed(q)
  r.json({ appointments: must(await sb.from('appointments').select('id,appointment_date,time_slot,status,doctors(name,specialty,fee)').eq('patient_id', q.user.id).order('appointment_date', { ascending: false })) })
})
route('post', '/api/appointments/:id/cancel', async (q, r) => {
  authed(q); if (!/^\d+$/.test(q.params.id)) throw fail(400, 'Invalid id')
  const rows = must(await sb.from('appointments').update({ status: 'CANCELLED' }).eq('id', q.params.id).eq('patient_id', q.user.id).eq('status', 'BOOKED').select('id'))
  if (!rows.length) throw fail(409, 'Could not cancel that appointment. Please try again.')
  r.json({ ok: true })
})
app.listen(process.env.PORT || 4000, () => console.log('MediCare Grand API on :' + (process.env.PORT || 4000)))
