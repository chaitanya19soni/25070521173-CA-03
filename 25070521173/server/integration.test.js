import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { app } from './app.js';
import { User, Appointment, Admission, MedicalRecord } from './models.js';
import { hashPassword } from './auth.js';

test('hospital workflow: booking, privacy, records, admissions, conflicts and CRUD', { skip: !process.env.MONGODB_URI }, async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Appointment.init(), Admission.init(), MedicalRecord.init()]);
  const ids = [], marker = `test-${Date.now()}`, password = 'Workflow123!';
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, method = 'GET', body, token, expected = 200) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    return result;
  }
  async function signup(suffix) {
    const data = await request('/auth/register', 'POST', { name: `Test ${suffix}`, email: `${marker}-${suffix}@example.test`, password, role: 'admin' }, null, 201);
    ids.push(data.user._id);
    assert.equal(data.user.role, 'patient');
    return data;
  }
  try {
    const admin = await User.create({ name: 'Workflow admin', email: `${marker}-admin@example.test`, password: hashPassword(password), role: 'admin' });
    ids.push(admin.id);
    const adminLogin = await request('/auth/login', 'POST', { email: admin.email, password });
    const patient = await signup('patient'), other = await signup('other');
    const doctor = await request('/users', 'POST', { name: 'Workflow doctor', email: `${marker}-doctor@example.test`, password, role: 'doctor' }, adminLogin.token, 201);
    ids.push(doctor._id);
    const staff = await request('/users', 'POST', { name: 'Workflow staff', email: `${marker}-staff@example.test`, password, role: 'staff' }, adminLogin.token, 201);
    ids.push(staff._id);
    const doctorLogin = await request('/auth/login', 'POST', { email: doctor.email, password });
    const staffLogin = await request('/auth/login', 'POST', { email: staff.email, password });
    await request('/records', 'GET', null, staffLogin.token, 403);
    await request('/admissions', 'POST', {}, patient.token, 403);
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0,10);
    assert.ok((await request(`/availability?doctor=${doctor._id}&date=${date}`, 'GET', null, patient.token)).includes('09:00'));
    const booking = { doctor: doctor._id, date, time: '09:00', reason: 'Fictional test consultation', patient: other.user._id };
    const appointment = await request('/appointments', 'POST', booking, patient.token, 201);
    assert.equal(appointment.patient, patient.user._id, 'Patient cannot book on another patient’s behalf');
    await request('/appointments', 'POST', booking, other.token, 409);
    assert.equal((await request('/appointments', 'GET', null, other.token)).length, 0);
    assert.equal((await request('/appointments', 'GET', null, doctorLogin.token)).length, 1);
    assert.ok(!(await request(`/availability?doctor=${doctor._id}&date=${date}`, 'GET', null, patient.token)).includes('09:00'));
    await request('/records', 'POST', { patient: patient.user._id, diagnosis: 'Fictional test diagnosis', prescription: 'Test prescription', followUp: date }, doctorLogin.token, 201);
    assert.equal((await request('/records', 'GET', null, patient.token)).length, 1);
    assert.equal((await request('/records', 'GET', null, other.token)).length, 0);
    const bedData = await request('/admissions', 'GET', null, staffLogin.token);
    const free = bedData.beds.filter(b => !bedData.admissions.some(a => a.active && a.bed === b));
    assert.ok(free.length, 'At least one free bed is needed to test admissions');
    const admission = await request('/admissions', 'POST', { patient: patient.user._id, doctor: doctor._id, bed: free[0], reason: 'Fictional test admission' }, staffLogin.token, 201);
    await request('/admissions', 'POST', { patient: other.user._id, doctor: doctor._id, bed: free[0], reason: 'Bed conflict test' }, staffLogin.token, 409);
    if (free[1]) await request('/admissions', 'POST', { patient: patient.user._id, doctor: doctor._id, bed: free[1], reason: 'Duplicate patient test' }, staffLogin.token, 409);
    assert.equal((await request('/admissions', 'GET', null, patient.token)).admissions.length, 1);
    assert.equal((await request('/admissions', 'GET', null, other.token)).admissions.length, 0);
    assert.equal((await request(`/admissions/${admission._id}/discharge`, 'PATCH', null, staffLogin.token)).active, false);
    await request(`/admissions/${admission._id}/discharge`, 'PATCH', null, staffLogin.token, 404);
    await request(`/appointments/${appointment._id}`, 'PATCH', { status: 'Cancelled' }, patient.token);
    assert.ok((await request(`/availability?doctor=${doctor._id}&date=${date}`, 'GET', null, patient.token)).includes('09:00'));
    await request(`/appointments/${appointment._id}`, 'DELETE', null, staffLogin.token);
    const next = await request('/appointments', 'POST', { ...booking, time: '09:30' }, patient.token, 201);
    assert.equal((await request(`/appointments/${next._id}`, 'PATCH', { status: 'Completed' }, doctorLogin.token)).status, 'Completed');
  } finally {
    // Clean up only this test's new fixtures; never clear the database.
    await Appointment.deleteMany({ patient: { $in: ids } });
    await MedicalRecord.deleteMany({ patient: { $in: ids } });
    await Admission.deleteMany({ patient: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  }
});
