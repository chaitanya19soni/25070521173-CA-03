import mongoose from 'mongoose';
import { User } from './models.js';
import { hashPassword } from './auth.js';
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const accounts = [
    ['Chaitanya', 'admin@careline.test', 'admin', 'Administration'],
    ['Dr. Meera Shah', 'doctor@careline.test', 'doctor', 'General medicine'],
    ['Dr. Arjun Rao', 'arjun@careline.test', 'doctor', 'Orthopedics'],
    ['Priya Sharma', 'staff@careline.test', 'staff', 'Reception'],
    ['Rohan Patil', 'patient@careline.test', 'patient', '']
  ];
  for (const [name, email, role, specialty] of accounts) {
    if (!await User.exists({ email })) await User.create({ name, email, role, specialty, password: hashPassword('Careline123!') });
  }
  console.log('Demo accounts ready. Password: Careline123! (existing accounts unchanged).');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
