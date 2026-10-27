import mongoose from 'mongoose';
const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model, required: true });
export const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['patient', 'doctor', 'staff', 'admin'], default: 'patient' },
  specialty: { type: String, default: 'General medicine' }
}, { timestamps: true }));
const appointmentSchema = new Schema({
  patient: ref('User'), doctor: ref('User'), date: { type: String, required: true },
  time: { type: String, required: true }, reason: { type: String, required: true },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Cancelled'], default: 'Scheduled' }
}, { timestamps: true });
appointmentSchema.index({ doctor: 1, date: 1, time: 1 }, { unique: true, partialFilterExpression: { status: 'Scheduled' } });
export const Appointment = mongoose.model('Appointment', appointmentSchema);
export const MedicalRecord = mongoose.model('MedicalRecord', new Schema({
  patient: ref('User'), doctor: ref('User'), diagnosis: { type: String, required: true },
  prescription: { type: String, default: '' }, notes: { type: String, default: '' },
  followUp: { type: String, default: '' }
}, { timestamps: true }));
const admissionSchema = new Schema({
  patient: ref('User'), doctor: ref('User'), bed: { type: String, required: true },
  reason: { type: String, required: true }, active: { type: Boolean, default: true }, dischargedAt: Date
}, { timestamps: true });
admissionSchema.index({ bed: 1 }, { unique: true, partialFilterExpression: { active: true } });
admissionSchema.index({ patient: 1 }, { unique: true, partialFilterExpression: { active: true } });
export const Admission = mongoose.model('Admission', admissionSchema);
