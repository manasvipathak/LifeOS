import mongoose, { Schema, type Types } from 'mongoose';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 160,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    timezone: {
      type: String,
      default: 'UTC',
      trim: true,
      maxlength: 64,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const json = { ...ret } as Record<string, unknown>;

    delete json.passwordHash;
    delete json.__v;

    return json as unknown as typeof ret;
  },
});

const UserModel = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default UserModel;
