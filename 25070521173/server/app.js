import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Appointment, MedicalRecord, Admission } from './models.js';
import { hashPassword, checkPassword, createToken } from './auth.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, label, max = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const optional = (value, label) => value === undefined || value === '' ? '' : text(value, label);
const id = (value) => { if (!mongoose.isValidObjectId(value)) throw fail(400, 'Invalid ID.'); return value; };
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : next(fail(403, 'You do not have access to this action.'));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw fail(400, 'Enter a valid date.');
  return value;
}
export const slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'];
export const beds = ['A-01', 'A-02', 'A-03', 'A-04', 'B-01', 'B-02', 'B-03', 'B-04'];
async function person(value, role) {
  const user = await User.findOne({ _id: id(value), role });
  if (!user) throw fail(400, `Select a valid ${role}.`);
  return user;
}
async function newUser(body, role) {
  const name = text(body.name, 'Name', 80);
  const email = text(body.email, 'Email', 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email.');
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw fail(400, 'Password must contain 8–128 characters.');
  return User.create({ name, email, password: hashPassword(body.password), role, specialty: optional(body.specialty, 'Specialty') || 'General medicine' });
}
const safeUser = (user) => ({ _id: user.id, name: user.name, email: user.email, role: user.role, specialty: user.specialty });
// A small in-memory throttle limits repeated authentication attempts.
const attempts = new Map();
app.use('/api/auth', (req, res, next) => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
  const entry = attempts.get(req.ip) || { count: 0, until: now + 60000 };
  attempts.set(req.ip, entry);
  if (++entry.count > 30) return next(fail(429, 'Too many attempts. Try again in one minute.'));
  next();
});
app.post('/api/auth/register', async (req, res) => {
  const user = await newUser(req.body, 'patient');
  res.status(201).json({ token: createToken(user), user: safeUser(user) });
});
app.post('/api/auth/login', async (req, res) => {
  const email = text(req.body.email, 'Email', 150).toLowerCase();
  const password = text(req.body.password, 'Password', 128);
  const user = await User.findOne({ email }).select('+password');
  if (!user || !checkPassword(password, user.password)) throw fail(401, 'Incorrect email or password.');
  res.json({ token: createToken(user), user: safeUser(user) });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ');
    if (token?.[0] !== 'Bearer' || !token[1]) throw Error();
    const payload = jwt.verify(token[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = await User.findById(payload.id);
    if (!req.user) throw Error();
    next();
  } catch { next(fail(401, 'Please log in again.')); }
});
app.get('/api/me', (req, res) => res.json(safeUser(req.user)));
app.get('/api/users', async (req, res) => {
  let query;
  if (req.user.role === 'patient') query = { role: 'doctor' };
  else if (req.user.role === 'doctor') {
    const patientIds = [...await Appointment.distinct('patient', { doctor: req.user.id }), ...await Admission.distinct('patient', { doctor: req.user.id })];
    query = { $or: [{ role: 'doctor' }, { _id: { $in: patientIds }, role: 'patient' }] };
  } else query = req.user.role === 'admin' ? {} : { role: { $in: ['patient', 'doctor'] } };
  res.json(await User.find(query).sort({ name: 1 }));
});
app.post('/api/users', roles('admin', 'staff'), async (req, res) => {
  const role = req.user.role === 'staff' ? 'patient' : req.body.role;
  if (!['patient', 'doctor', 'staff'].includes(role)) throw fail(400, 'Choose patient, doctor, or staff.');
  res.status(201).json(safeUser(await newUser(req.body, role)));
});
const scope = (user) => user.role === 'patient' ? { patient: user.id } : user.role === 'doctor' ? { doctor: user.id } : {};
app.get('/api/appointments', async (req, res) => res.json(await Appointment.find(scope(req.user)).populate('patient doctor', 'name specialty').sort({ date: -1, time: 1 })));
app.get('/api/availability', async (req, res) => {
  await person(req.query.doctor, 'doctor');
  const day = date(req.query.date);
  const booked = await Appointment.find({ doctor: req.query.doctor, date: day, status: 'Scheduled' });
  res.json(slots.filter(time => day >= today() && new Date(`${day}T${time}:00+05:30`) > new Date() && !booked.some(a => a.time === time)));
});
app.post('/api/appointments', roles('patient', 'staff', 'admin'), async (req, res) => {
  const patient = req.user.role === 'patient' ? req.user.id : (await person(req.body.patient, 'patient')).id;
  const doctor = (await person(req.body.doctor, 'doctor')).id;
  const day = date(req.body.date);
  if (!slots.includes(req.body.time) || day < today() || new Date(`${day}T${req.body.time}:00+05:30`) <= new Date()) throw fail(400, 'Choose an available future appointment slot.');
  res.status(201).json(await Appointment.create({ patient, doctor, date: day, time: req.body.time, reason: text(req.body.reason, 'Reason') }));
});
app.patch('/api/appointments/:id', async (req, res) => {
  const a = await Appointment.findOne({ _id: id(req.params.id), ...scope(req.user) });
  if (!a) throw fail(404, 'Appointment not found.');
  if (a.status !== 'Scheduled') throw fail(400, 'This appointment is already closed.');
  const allowed = req.user.role === 'patient' ? ['Cancelled'] : ['Cancelled', 'Completed'];
  if (!allowed.includes(req.body.status)) throw fail(400, 'Invalid appointment status.');
  a.status = req.body.status; await a.save(); res.json(a);
});
app.delete('/api/appointments/:id', roles('admin', 'staff'), async (req, res) => {
  const result = await Appointment.findOneAndDelete({ _id: id(req.params.id), status: 'Cancelled' });
  if (!result) throw fail(400, 'Only cancelled appointments can be deleted.');
  res.json({ message: 'Appointment deleted.' });
});
app.get('/api/records', roles('patient', 'doctor', 'admin'), async (req, res) => {
  let query = req.user.role === 'patient' ? { patient: req.user.id } : {};
  if (req.user.role === 'doctor') {
    const patients = [...await Appointment.distinct('patient', { doctor: req.user.id }), ...await Admission.distinct('patient', { doctor: req.user.id })];
    query = { patient: { $in: patients } };
  }
  res.json(await MedicalRecord.find(query).populate('patient doctor', 'name').sort({ createdAt: -1 }));
});
app.post('/api/records', roles('doctor'), async (req, res) => {
  const patient = id(req.body.patient);
  const assigned = await Appointment.exists({ patient, doctor: req.user.id, status: { $ne: 'Cancelled' } }) || await Admission.exists({ patient, doctor: req.user.id });
  if (!assigned) throw fail(403, 'You can add records only for your assigned patients.');
  const followUp = req.body.followUp ? date(req.body.followUp) : '';
  if (followUp && followUp < today()) throw fail(400, 'Follow-up date cannot be in the past.');
  res.status(201).json(await MedicalRecord.create({ patient, doctor: req.user.id, diagnosis: text(req.body.diagnosis, 'Diagnosis'), prescription: optional(req.body.prescription, 'Prescription'), notes: optional(req.body.notes, 'Notes'), followUp }));
});
app.get('/api/admissions', async (req, res) => res.json({ beds, admissions: await Admission.find(scope(req.user)).populate('patient doctor', 'name').sort({ createdAt: -1 }) }));
app.post('/api/admissions', roles('staff', 'admin'), async (req, res) => {
  await person(req.body.patient, 'patient'); await person(req.body.doctor, 'doctor');
  if (!beds.includes(req.body.bed)) throw fail(400, 'Choose a valid bed.');
  res.status(201).json(await Admission.create({ patient: req.body.patient, doctor: req.body.doctor, bed: req.body.bed, reason: text(req.body.reason, 'Reason') }));
});
app.patch('/api/admissions/:id/discharge', roles('staff', 'admin'), async (req, res) => {
  const a = await Admission.findOneAndUpdate({ _id: id(req.params.id), active: true }, { active: false, dischargedAt: new Date() }, { new: true });
  if (!a) throw fail(404, 'Active admission not found.');
  res.json(a);
});
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, req, res, next) => {
  if (error.code === 11000) return res.status(409).json({ message: 'This email, appointment slot, patient admission, or bed is already in use. Refresh and choose another.' });
  const status = error.status || (['ValidationError', 'CastError'].includes(error.name) ? 400 : 500);
  if (status === 500) console.error(error);
  res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : error.message });
});
