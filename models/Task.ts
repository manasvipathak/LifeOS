import mongoose, { Schema, type Types } from 'mongoose';

export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface ITask {
  userId: Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate?: Date | null;
  source: 'manual' | 'ai';
  subtasks: Array<{
    title: string;
    done: boolean;
    createdAt: Date;
  }>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'completed'],
      default: 'todo',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    category: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 64,
      default: 'personal',
    },
    dueDate: Date,
    source: {
      type: String,
      enum: ['manual', 'ai'],
      default: 'manual',
    },
    subtasks: {
      type: [
        new Schema(
          {
            title: { type: String, required: true, trim: true, maxlength: 200 },
            done: { type: Boolean, default: false },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    completedAt: Date,
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, dueDate: 1 });

const TaskModel = mongoose.models.Task || mongoose.model<ITask>('Task', taskSchema);

export default TaskModel;