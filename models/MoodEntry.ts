import mongoose, { Schema, type Types } from 'mongoose';
import { moodValues, type MoodValue } from '@/lib/mood/constants';

export interface IMoodEntry {
  userId: Types.ObjectId;
  mood: MoodValue;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const moodEntrySchema = new Schema<IMoodEntry>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mood: {
      type: String,
      enum: moodValues,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 280,
    },
  },
  { timestamps: true },
);

moodEntrySchema.index({ userId: 1, createdAt: -1 });

const MoodEntryModel = mongoose.models.MoodEntry || mongoose.model<IMoodEntry>('MoodEntry', moodEntrySchema);

export default MoodEntryModel;