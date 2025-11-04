import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true },
  lastSeen: { type: Date, default: Date.now },
});

export const SessionModel = mongoose.model('Session', SessionSchema);
