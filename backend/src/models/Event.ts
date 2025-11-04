import mongoose from 'mongoose';

const EventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, sparse: true },
  type: { type: String, required: true, enum: ['pageview', 'action', 'performance'] },
  payload: { type: Object, required: true },
  sessionId: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const EventModel = mongoose.model('Event', EventSchema);
