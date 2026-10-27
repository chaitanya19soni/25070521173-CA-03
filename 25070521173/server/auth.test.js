import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { hashPassword, checkPassword, createToken } from './auth.js';
import { app } from './app.js';
import { User, Appointment, Admission } from './models.js';

process.env.JWT_SECRET = 'test-secret-only-01234567890123456789';
test('passwords use different salts and verify correctly', () => {
  const a = hashPassword('Careline123!');
  const b = hashPassword('Careline123!');
  assert.notEqual(a, b);
  assert.equal(checkPassword('Careline123!', a), true);
  assert.equal(checkPassword('wrong-password', a), false);
});
test('JWT contains an identity, expires, and rejects another secret', () => {
  const token = createToken({ id: 'patient-id' });
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(claims.id, 'patient-id');
  assert.equal(claims.exp - claims.iat, 8 * 3600);
  assert.throws(() => jwt.verify(token, 'another-secret'));
});
test('API rejects unauthenticated, tampered, and expired tokens', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const tokens = ['', 'not-a-token', jwt.sign({ id: 'x' }, 'wrong-secret'), jwt.sign({ id: 'x' }, process.env.JWT_SECRET, { expiresIn: -1 })];
    for (const token of tokens) {
      for (const path of ['/me', '/users', '/records', '/appointments', '/admissions']) {
        assert.equal((await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
      }
    }
    assert.equal((await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test', email: 'invalid', password: 'short' }) })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('backend enforces role permissions and ignores privileged signup roles', async () => {
  // Isolate authorization from database availability; persistence needs a live MongoDB test.
  const originalFind = User.findById, originalCreate = User.create;
  const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  let role = 'patient', created;
  User.findById = async () => ({ id: userId, role });
  User.create = async body => { created = body; return { ...body, id: userId }; };
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${createToken({ id: userId })}` };
  try {
    for (const [accountRole, path] of [['patient', '/records'], ['patient', '/admissions'], ['doctor', '/users'], ['doctor', '/appointments'], ['staff', '/records']]) {
      role = accountRole;
      assert.equal((await fetch(`${base}${path}`, { method: 'POST', headers, body: '{}' })).status, 403);
    }
    const data = { name: 'Test Patient', email: 'test@example.com', password: 'Password123!', role: 'admin' };
    const signup = await fetch(`${base}/auth/register`, { method: 'POST', headers, body: JSON.stringify(data) });
    assert.equal(signup.status, 201);
    assert.equal(created.role, 'patient');
    assert.notEqual(created.password, data.password);
    assert.equal((await signup.json()).user.password, undefined);
    role = 'staff';
    const staffCreate = await fetch(`${base}/users`, { method: 'POST', headers, body: JSON.stringify(data) });
    assert.equal(staffCreate.status, 201);
    assert.equal(created.role, 'patient');
  } finally {
    User.findById = originalFind; User.create = originalCreate;
    await new Promise(resolve => server.close(resolve));
  }
});

test('patient list endpoints always scope records to the signed-in patient', async () => {
  const originalUser = User.findById, originalAppointments = Appointment.find, originalAdmissions = Admission.find;
  const userId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  User.findById = async () => ({ id: userId, role: 'patient' });
  const queries = [];
  const scopedFind = query => { queries.push(query); return { populate: () => ({ sort: async () => [] }) }; };
  Appointment.find = scopedFind; Admission.find = scopedFind;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const headers = { Authorization: `Bearer ${createToken({ id: userId })}` };
    for (const path of ['/appointments', '/admissions']) {
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api${path}?patient=someone-else`, { headers })).status, 200);
    }
    assert.deepEqual(queries, [{ patient: userId }, { patient: userId }]);
  } finally {
    User.findById = originalUser; Appointment.find = originalAppointments; Admission.find = originalAdmissions;
    await new Promise(resolve => server.close(resolve));
  }
});
