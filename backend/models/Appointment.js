import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    appointmentCode: {
      type: String,
      unique: true,
      default: () => `APT-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
    },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
    },
    patientName: {
      type: String,
      required: true,
    },
    patientEmail: {
      type: String,
      required: true,
    },
    patientPhone: {
      type: String,
      required: true,
    },
    patientGender: {
      type: String,
      default: 'Not Specified',
    },
    patientAge: {
      type: Number,
      default: 30,
    },
    date: {
      type: String,
      required: true,
    },
    timeSlot: {
      type: String,
      required: true,
    },
    consultationType: {
      type: String,
      enum: ['In-Person Consultation', 'Video Consultation'],
      default: 'In-Person Consultation',
    },
    symptoms: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'],
      default: 'Confirmed',
    },
    cancelReason: {
      type: String,
      default: '',
    },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    fee: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Appointment = mongoose.model('Appointment', appointmentSchema);
