
import mongoose, { Schema, type Types } from "mongoose";

export interface IJournalEntry {
  userId: Types.ObjectId;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const journalEntrySchema = new Schema<IJournalEntry>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
    },
    content: {
      type: String,
      trim: true,
      required: true,
      maxlength: 10000,
    },
  },
  { timestamps: true },
);

journalEntrySchema.index({ userId: 1, createdAt: -1 });

const JournalEntryModel =
  mongoose.models.JournalEntry ||
  mongoose.model<IJournalEntry>("JournalEntry", journalEntrySchema);

export default JournalEntryModel;
