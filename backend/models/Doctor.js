import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    specialization: {
      type: String,
      required: [true, 'Please provide specialization'],
      trim: true,
    },
    qualifications: {
      type: String,
      required: true,
    },
    experience: {
      type: String,
      required: true,
    },
    consultationFee: {
      type: Number,
      required: true,
      default: 499,
    },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
    },
    about: {
      type: String,
      default: '',
    },
    verified: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 4.8,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    availableDays: {
      type: [String],
      default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
    slots: {
      morning: {
        type: [String],
        default: ['09:00 AM', '10:00 AM', '11:00 AM'],
      },
      afternoon: {
        type: [String],
        default: ['01:30 PM', '02:30 PM', '03:30 PM'],
      },
      evening: {
        type: [String],
        default: ['05:00 PM', '06:00 PM'],
      },
    },
  },
  {
    timestamps: true,
  }
);

export const Doctor = mongoose.model('Doctor', doctorSchema);
