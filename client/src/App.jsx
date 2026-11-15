import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('YOUR-PROJECT')
const sb = DEMO_MODE ? null : createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const SLOTS = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '04:00 PM', '04:30 PM', '05:00 PM']
const DEMO_DOCTORS = [
  { id: 1, name: 'Dr. Ravi Kumar', specialty: 'Cardiology', available_days: 'Mon, Wed, Fri', fee: 500 },
  { id: 2, name: 'Dr. Priya Sharma', specialty: 'Dermatology', available_days: 'Tue, Thu', fee: 400 },
  { id: 3, name: 'Dr. Arun Raj', specialty: 'Orthopedics', available_days: 'Mon, Sat', fee: 600 }
]
const DEMO_USERS_KEY = 'medicare-grand-demo-users'
const DEMO_SESSION_KEY = 'medicare-grand-demo-session'
const DEMO_APPOINTMENTS_KEY = 'medicare-grand-demo-appointments'

function readDemoData(key) {
  const value = localStorage.getItem(key)
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch (error) {
    console.error(`Could not read demo data from ${key}.`, error)
    return []
  }
}

function writeDemoData(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function demoSignIn(email, password) {
  const user = readDemoData(DEMO_USERS_KEY).find(u => u.email === email.trim().toLowerCase() && u.password === password)
  if (!user) return { error: new Error('Invalid email or password.') }
  localStorage.setItem(DEMO_SESSION_KEY, user.email)
  return { error: null }
}

async function demoApi(path, body) {
  if (path === '/doctors') return { ok: true, doctors: DEMO_DOCTORS }
  if (path === '/register') {
    const { name, email, phone, password } = body
    if (!name?.trim() || !email?.trim() || !phone?.trim() || !password) return { ok: false, error: 'All fields are required.' }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^\+?[0-9 ()-]{7,15}$/.test(phone) || password.length < 8) {
      return { ok: false, error: 'Enter a valid email, phone and a password of 8+ characters.' }
    }
    const users = readDemoData(DEMO_USERS_KEY)
    const normalizedEmail = email.trim().toLowerCase()
    if (users.some(u => u.email === normalizedEmail)) return { ok: false, error: 'That email is already registered.' }
    users.push({ name: name.trim(), email: normalizedEmail, phone: phone.trim(), password })
    writeDemoData(DEMO_USERS_KEY, users)
    return { ok: true }
  }

  const email = localStorage.getItem(DEMO_SESSION_KEY)
  const user = readDemoData(DEMO_USERS_KEY).find(u => u.email === email)
  if (path === '/me') return { ok: true, patient: user ? { id: user.email, name: user.name, email: user.email } : null }
  if (!user) return { ok: false, error: 'Please sign in.' }

  const appointments = readDemoData(DEMO_APPOINTMENTS_KEY)
  if (path === '/appointments' && !body) {
    return { ok: true, appointments: appointments.filter(a => a.patient_email === user.email)
      .map(a => ({ ...a, doctors: DEMO_DOCTORS.find(d => d.id === a.doctor_id) })) }
  }
  if (path.startsWith('/booked-slots?')) {
    const query = new URLSearchParams(path.slice(path.indexOf('?') + 1))
    const doctorId = Number(query.get('doctor_id'))
    const date = query.get('date')
    return { ok: true, booked: appointments.filter(a => a.doctor_id === doctorId && a.appointment_date === date && a.status === 'BOOKED').map(a => a.time_slot) }
  }
  if (path === '/appointments' && body) {
    const doctor = DEMO_DOCTORS.find(d => d.id === body.doctor_id)
    if (!doctor || !body.date || !SLOTS.includes(body.time_slot) || body.date < iso(new Date())) {
      return { ok: false, error: 'Booking failed. Please check the date and slot, then try again.' }
    }
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(body.date + 'T00:00:00Z').getUTCDay()]
    if (!doctor.available_days.split(', ').includes(day)) {
      return { ok: false, error: `${doctor.name} is not available on ${day}. Available: ${doctor.available_days}.` }
    }
    if (appointments.some(a => a.doctor_id === doctor.id && a.appointment_date === body.date && a.time_slot === body.time_slot && a.status === 'BOOKED')) {
      return { ok: false, error: 'That time slot was just taken. Please choose another one.' }
    }
    appointments.push({ id: Date.now(), doctor_id: doctor.id, patient_email: user.email, appointment_date: body.date, time_slot: body.time_slot, status: 'BOOKED' })
    writeDemoData(DEMO_APPOINTMENTS_KEY, appointments)
    return { ok: true }
  }
  const cancelMatch = path.match(/^\/appointments\/(\d+)\/cancel$/)
  if (cancelMatch && body) {
    const appointment = appointments.find(a => a.id === Number(cancelMatch[1]) && a.patient_email === user.email && a.status === 'BOOKED')
    if (!appointment) return { ok: false, error: 'Could not cancel that appointment. Please try again.' }
    appointment.status = 'CANCELLED'
    writeDemoData(DEMO_APPOINTMENTS_KEY, appointments)
    return { ok: true }
  }
  return { ok: false, error: 'This action is not available in demo mode.' }
}

async function api(path, body) {
  if (DEMO_MODE) return demoApi(path, body)
  const { data: { session } } = await sb.auth.getSession()
  try {
    const r = await fetch(API + '/api' + path, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(session && { Authorization: 'Bearer ' + session.access_token }) } })
    return { ...(await r.json().catch(() => ({}))), ok: r.ok }
  } catch { return { ok: false, error: 'Cannot reach the server. Start the Node API and retry.' } }
}
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
const fmtDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const t24 = s => { const [t, p] = s.split(' '); let [h, m] = t.split(':').map(Number); if (p === 'PM' && h < 12) h += 12; if (p === 'AM' && h === 12) h = 0; return h * 60 + m }
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening' }
const initials = n => n.replace('Dr. ', '').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
const first = n => (n || 'Guest').split(' ')[0]

function Tilt({ className = '', children, onClick }) {  // "hover any card to see it tilt in 3D"
  const ref = useRef()
  const move = e => { const b = ref.current.getBoundingClientRect(), x = (e.clientX - b.left) / b.width - .5, y = (e.clientY - b.top) / b.height - .5
    ref.current.style.transform = `perspective(900px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg) translateY(-3px)` }
  return <div ref={ref} className={'glass ' + className} onClick={onClick} onMouseMove={move} onMouseLeave={() => ref.current.style.transform = ''}>{children}</div>
}
function Clock() {
  const [n, setN] = useState(new Date()); useEffect(() => { const t = setInterval(() => setN(new Date()), 1000); return () => clearInterval(t) }, [])
  return <span className="pill">🕒 {n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} • {n.toLocaleTimeString('en-US')}</span>
}

export default function App() {
  const [me, setMe] = useState(undefined), [view, setView] = useState('dashboard'), [toast, setToast] = useState(null)
  const [docs, setDocs] = useState([]), [apps, setApps] = useState([]), [pre, setPre] = useState(null)
  const say = (text, ok = true) => { setToast({ text, ok }); setTimeout(() => setToast(null), 5000) }
  const refresh = useCallback(async () => {
    const [d, a] = await Promise.all([api('/doctors'), api('/appointments')]); setDocs(d.doctors || []); setApps(a.appointments || [])
  }, [])
  const boot = useCallback(async () => { const r = await api('/me'); setMe(r.patient || null); if (r.patient) refresh() }, [refresh])
  useEffect(() => { boot() }, [boot])
  if (me === undefined) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Loading…</div>
  if (!me) return <><Login onDone={boot} say={say} /><Toast t={toast} /></>
  const today = iso(new Date()), upcoming = apps.filter(a => a.status === 'BOOKED' && a.appointment_date >= today)
  const nav = [['dashboard', '🏠 Dashboard'], ['book', '📅 Book Appointment'], ['my', '📋 My Appointments']]
  const go = (v, doc) => { setPre(doc || null); setView(v) }
  const P = { me, docs, apps, upcoming, today, say, refresh, go, pre }
  return <div className="shell">
    <aside className="side"><div className="logo"><i>✚</i><div><b style={{ color: '#fff', fontSize: 18 }}>MediCare</b><br /><small>PREMIUM</small></div></div>
      <div className="ml">MAIN MENU</div>
      {nav.map(([k, l]) => <button key={k} className={'nav' + (view === k ? ' on' : '')} onClick={() => go(k)}>{l}</button>)}
      <button className="nav" onClick={async () => { if (DEMO_MODE) localStorage.removeItem(DEMO_SESSION_KEY); else await sb.auth.signOut(); setMe(null); setApps([]); setView('dashboard') }}>🚪 Logout</button>
      <div className="status"><b>● {DEMO_MODE ? 'Local demo mode' : 'Supabase connected'}</b><br />{DEMO_MODE ? 'Data saved in this browser' : 'Systems normal'}<br /><span className="muted">v4.0 Royal Aurora</span></div></aside>
    <section className="content">
      <div className="top"><div><div className="crumb">MediCare Grand › {nav.find(n => n[0] === view)[1].slice(3)}</div><h2>{greet()}, {first(me.name)}</h2></div>
        <div className="chips"><Clock /><span className="pill" title="Upcoming reminders">🔔{upcoming.length > 0 && <span className="badge">{upcoming.length}</span>}</span><span className="pill">👤 {me.name}</span></div></div>
      {view === 'dashboard' && <Dashboard {...P} />}{view === 'book' && <Book {...P} key={pre?.id || 'b'} />}{view === 'my' && <My {...P} />}
      <p className="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 30 }}>MediCare Grand • Hospital Appointment System • v4.0 Royal Aurora</p>
    </section><Toast t={toast} /></div>
}
const Toast = ({ t }) => t ? <div className={'toast ' + (t.ok ? 'ok' : 'bad')} role="status" aria-live="polite">{t.text}</div> : null

function Login({ onDone, say }) {
  const [reg, setReg] = useState(false), [f, setF] = useState({ name: '', email: '', phone: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault(); setErr('')
    if (!f.email || !f.password || (reg && (!f.name || !f.phone))) return setErr('All fields are required.')
    setBusy(true)
    if (reg) { const r = await api('/register', f); setBusy(false); if (!r.ok) return setErr(r.error || 'Registration failed.'); say('Account created! You can sign in now.'); setReg(false); setF({ ...f, name: '', phone: '', password: '' }); return }
    const { error } = DEMO_MODE
      ? demoSignIn(f.email, f.password)
      : await sb.auth.signInWithPassword({ email: f.email, password: f.password })
    setBusy(false)
    if (error) return setErr('Invalid email or password. Please try again.')
    await onDone(); say('Welcome back!')
  }
  return <div className="login">
    <div className="brand"><div className="tag">PREMIUM CARE PLATFORM</div><h1>MediCare Grand</h1><div className="muted" style={{ fontSize: 18 }}>Hospital Appointment System</div>
      <p>Book your doctor in seconds — no queues, no waiting rooms, no paperwork.</p>
      <div className="feat"><div className="ico">🔍</div><div><b style={{ color: '#fff' }}>Find Specialists</b><br /><span className="muted">Browse every consultant with live fees</span></div></div>
      <div className="feat"><div className="ico" style={{ background: 'linear-gradient(135deg,#14b8a6,#16a34a)' }}>📅</div><div><b style={{ color: '#fff' }}>Instant Booking</b><br /><span className="muted">Pick a date and a time slot that fits</span></div></div>
      <div className="kpis">{[['24/7', 'Care access'], ['120+', 'Specialists'], ['15 min', 'Avg. slot']].map(([a, b]) => <div key={a} className="glass kpi"><b>{a}</b><span className="muted">{b}</span></div>)}</div></div>
    <form className="glass" onSubmit={submit} style={{ padding: 28 }}>
      <h2 style={{ fontSize: 28 }}>{reg ? 'Create your account' : 'Welcome back'}</h2><div className="muted">{reg ? 'Join MediCare Grand' : 'Sign in to manage your appointments'}</div>
      {reg && <><label className="f" htmlFor="n">FULL NAME</label><input id="n" value={f.name} onChange={set('name')} placeholder="Full name" /><label className="f" htmlFor="ph">PHONE</label><input id="ph" value={f.phone} onChange={set('phone')} placeholder="Phone" /></>}
      <label className="f" htmlFor="em">EMAIL ADDRESS</label><input id="em" type="email" value={f.email} onChange={set('email')} placeholder="Email address" autoComplete="username" />
      <label className="f" htmlFor="pw">PASSWORD</label><input id="pw" type="password" value={f.password} onChange={set('password')} placeholder={reg ? 'Min 8 characters' : 'Password'} autoComplete={reg ? 'new-password' : 'current-password'} />
      <div className="err" role="alert">{err}</div>
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create Account' : 'Sign In'}</button>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {!reg && <button type="button" className="link" onClick={() => say('Password resets are handled at the hospital front desk.', false)}>Forgot password?</button>}
        <span className="muted">{reg ? 'Already registered?' : 'New patient?'} <button type="button" className="link" onClick={() => { setReg(!reg); setErr('') }}>{reg ? 'Sign in' : 'Create an account'}</button></span></div>
    </form><div className="copy">MediCare Grand • Hospital Appointment System • v4.0 Royal Aurora</div></div>
}

function Dashboard({ me, docs, apps, upcoming, go, refresh, say }) {
  const next = [...upcoming].sort((a, b) => (a.appointment_date + String(t24(a.time_slot)).padStart(4, '0')).localeCompare(b.appointment_date + String(t24(b.time_slot)).padStart(4, '0')))[0]
  const stats = [['👤', apps.length, 'Total Appointments', 'Lifetime bookings'], ['⏳', upcoming.length, 'Upcoming', 'Confirmed & waiting'], ['✖', apps.filter(a => a.status === 'CANCELLED').length, 'Cancelled', 'You released these'], ['🩺', docs.length, 'Specialists', 'Available right now']]
  return <>
    <div className="hero glass"><div><div className="muted">{greet()},</div><h1>{me.name}</h1><p className="muted">Here is your health dashboard — everything in one calm place.</p>
      <div className="row"><button className="btn btn-gold" onClick={() => go('book')}>📅 Book Appointment</button><button className="btn btn-ghost" onClick={() => go('my')}>My Appointments</button></div></div>
      <div className="glass next"><div className="muted" style={{ letterSpacing: '.12em', fontSize: 12 }}>NEXT APPOINTMENT</div>
        {next ? <><h3>{next.doctors.name}</h3><div>{fmtDate(next.appointment_date)} • {next.time_slot}</div></> : <h3>Nothing scheduled yet</h3>}</div></div>
    <div className="grid">{stats.map(([i, v, t, s]) => <Tilt key={t} className="stat"><div className="ico">{i}</div><b>{v}</b><div style={{ color: '#fff', fontWeight: 700 }}>{t}</div><span className="muted">{s}</span></Tilt>)}</div>
    <div className="grid">{[['Book a new visit', 'Choose a specialist, date and time slot.', () => go('book')], ['Review appointments', 'See, filter and cancel your bookings.', () => go('my')], ['Refresh data', 'Reload the dashboard from the database.', async () => { await refresh(); say('Appointment list refreshed.') }]]
      .map(([t, s, f]) => <Tilt key={t}><b style={{ color: '#fff' }}>{t}</b><div className="muted">{s}</div><button className="btn btn-ghost sm" style={{ marginTop: 10 }} onClick={f}>Open</button></Tilt>)}</div>
    <div className="sec"><div><h2>Our Specialists</h2><span className="muted">Tap any card to book instantly</span></div></div>
    <div className="grid">{docs.length ? docs.map(d => <Tilt key={d.id} onClick={() => go('book', d)}><div className="row" style={{ margin: 0, alignItems: 'center' }}><div className="avatar">{initials(d.name)}</div><div><b style={{ color: '#fff' }}>{d.name}</b><br /><span className="chip">{d.specialty}</span></div></div>
      <p className="muted" style={{ margin: '12px 0 4px' }}>🕒 Available: {d.available_days}</p><p className="muted" style={{ margin: 0 }}>💳 Consultation fee: Rs. {Number(d.fee)}</p>
      <button className="btn btn-primary sm" style={{ marginTop: 12, width: '100%' }}>📅 Book Now</button></Tilt>) : <p className="muted">No specialists found. Run supabase/database.sql to load the sample doctors.</p>}</div></>
}

function Book({ docs, today, say, refresh, go, pre }) {
  const [doc, setDoc] = useState(pre), [date, setDate] = useState(''), [slot, setSlot] = useState(''), [taken, setTaken] = useState([]), [busy, setBusy] = useState(false)
  useEffect(() => { setSlot(''); if (doc && date) api(`/booked-slots?doctor_id=${doc.id}&date=${date}`).then(r => setTaken(r.booked || [])); else setTaken([]) }, [doc, date])
  async function confirm() {
    setBusy(true); const r = await api('/appointments', { doctor_id: doc.id, date, time_slot: slot }); setBusy(false)
    if (!r.ok) { say(r.error || 'Booking failed. Please check the date and slot, then try again.', false); api(`/booked-slots?doctor_id=${doc.id}&date=${date}`).then(x => { setTaken(x.booked || []); setSlot('') }); return }
    say('Appointment booked with ' + doc.name + ' on ' + fmtDate(date) + ' at ' + slot); await refresh(); go('my')
  }
  return <><div className="sec"><div><h2>Book a new appointment</h2><span className="muted">Review the details before confirming.</span></div><button className="btn btn-ghost sm" onClick={() => go('dashboard')}>← Back to Dashboard</button></div>
    <div className="two"><div>
      <Tilt><h3>Choose your specialist</h3><div className="muted">Pick the doctor you want to consult</div>
        {docs.length ? docs.map(d => <div key={d.id} role="radio" aria-checked={doc?.id === d.id} tabIndex={0} className={'pick' + (doc?.id === d.id ? ' on' : '')} onClick={() => setDoc(d)} onKeyDown={e => e.key === 'Enter' && setDoc(d)}>
          <div className="avatar" style={{ width: 42, height: 42, fontSize: 14 }}>{initials(d.name)}</div><div style={{ flex: 1 }}><b style={{ color: '#fff' }}>{d.name}</b> <span className="chip">{d.specialty}</span><div className="muted">Available: {d.available_days}</div></div><b style={{ color: '#ffd98a' }}>Rs. {Number(d.fee)}</b></div>)
          : <p className="muted">No doctors loaded. Run supabase/database.sql first.</p>}</Tilt>
      <Tilt className="x"><h3>Pick a date</h3><div className="muted">Past dates are disabled automatically</div><label className="f" htmlFor="dt">SELECT APPOINTMENT DATE</label><input id="dt" type="date" min={today} value={date} onChange={e => setDate(e.target.value)} /></Tilt>
      <Tilt><h3>Choose a time slot</h3><div className="muted">Available consultation windows</div><div className="slots" style={{ marginTop: 12 }}>
        {SLOTS.map(s => <button key={s} className={'slot' + (slot === s ? ' on' : '')} disabled={!doc || !date || taken.includes(s)} onClick={() => setSlot(s)} title={taken.includes(s) ? 'Already booked' : ''}>{s}</button>)}</div></Tilt></div>
    <Tilt className="sum"><h3>Booking summary</h3><div className="muted" style={{ marginBottom: 8 }}>Review the details before confirming.</div>
      <div><span className="muted">Doctor</span><b>{doc?.name || '—'}</b></div><div><span className="muted">Specialty</span><b>{doc?.specialty || '—'}</b></div><div><span className="muted">Date</span><b>{date ? fmtDate(date) : '—'}</b></div>
      <div><span className="muted">Time</span><b>{slot || '—'}</b></div><div><span className="muted">Fee payable</span><b style={{ color: '#ffd98a' }}>Rs. {doc ? Number(doc.fee) : 0}</b></div>
      <div className="row"><button className="btn btn-gold" disabled={!doc || !date || !slot || busy} onClick={confirm}>{busy ? 'Booking…' : 'Confirm Booking'}</button><button className="btn btn-ghost" onClick={() => { setDoc(null); setDate(''); setSlot('') }}>Clear selection</button></div></Tilt></div></>
}

function My({ apps, refresh, say, go }) {
  const [f, setF] = useState('ALL'), [ask, setAsk] = useState(null)
  const list = apps.filter(a => f === 'ALL' || a.status === f), n = s => apps.filter(a => a.status === s).length
  async function doCancel() {
    const a = ask; setAsk(null); const r = await api(`/appointments/${a.id}/cancel`, {})
    if (r.ok) say('Appointment with ' + a.doctors.name + ' was cancelled.'); else say(r.error || 'Could not cancel that appointment. Please try again.', false); refresh()
  }
  return <><div className="sec"><div><h2>My Appointments</h2><span className="muted">Every visit you booked with MediCare Grand.</span></div><button className="btn btn-gold sm" onClick={() => go('book')}>Book Appointment</button></div>
    <div className="glass"><div className="row" style={{ marginTop: 0, alignItems: 'center' }}><span className="muted">Filter:</span>
      {[['ALL', 'All'], ['BOOKED', 'Booked'], ['CANCELLED', 'Cancelled']].map(([k, l]) => <button key={k} className={'btn sm ' + (f === k ? 'btn-primary' : 'btn-ghost')} onClick={() => setF(k)}>{l}</button>)}
      <span className="muted" style={{ marginLeft: 'auto' }}>{apps.length} total • {n('BOOKED')} booked • {n('CANCELLED')} cancelled</span><button className="btn btn-ghost sm" onClick={async () => { await refresh(); say('Appointment list refreshed.') }}>Refresh</button></div>
      {list.length ? <div className="w"><table><thead><tr><th>Doctor</th><th>Date</th><th>Time Slot</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {list.map(a => <tr key={a.id}><td><b style={{ color: '#fff' }}>{a.doctors.name}</b><br /><span className="muted">{a.doctors.specialty}</span></td><td>{fmtDate(a.appointment_date)}</td><td>{a.time_slot}</td>
          <td><span className={'st ' + a.status}>{a.status === 'BOOKED' ? 'Booked' : 'Cancelled'}</span></td><td>{a.status === 'BOOKED' && <button className="btn btn-danger sm" onClick={() => setAsk(a)}>Cancel</button>}</td></tr>)}</tbody></table></div>
        : <p className="muted" style={{ textAlign: 'center', padding: 30 }}>No appointments to show.<br />Press “Book Appointment” to schedule your first visit.</p>}</div>
    {ask && <div className="modal" role="dialog" aria-modal="true"><div className="glass"><h3>Cancel this appointment?</h3><p className="muted">{ask.doctors.name} · {fmtDate(ask.appointment_date)} · {ask.time_slot}<br />This cannot be undone.</p>
      <div className="row"><button className="btn btn-danger" onClick={doCancel}>Yes, cancel it</button><button className="btn btn-ghost" onClick={() => setAsk(null)}>Keep it</button></div></div></div>}</>
}
