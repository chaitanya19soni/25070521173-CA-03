import mongoose from 'mongoose';
import { app } from './app.js';
import { User, Appointment, Admission, MedicalRecord } from './models.js';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-')) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters in server/.env.');
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Appointment.init(), Admission.init(), MedicalRecord.init()]);
  app.listen(process.env.PORT || 5000, '127.0.0.1', () => console.log(`Hospital API running at http://localhost:${process.env.PORT || 5000}`));
} catch (error) { console.error('Cannot connect to MongoDB. Start MongoDB and check MONGODB_URI.', error.message); process.exit(1); }
