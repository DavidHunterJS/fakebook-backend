// types/database.ts
import { ObjectId } from 'mongodb';

export interface User {
  _id: ObjectId;
  username: string;
  email: string;
  signalKeys: {
    identityKey: string;
    signedPrekey: {
      id: number;
      publicKey: string;
      signature: string;
      timestamp: Date;
    };
    registrationId: number;
  };
  keyRotationSchedule: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OneTimePrekeyDocument {
  _id: ObjectId;
  userId: ObjectId;
  prekeyId: number;
  publicKey: string;
  used: boolean;
  createdAt: Date;
}

export interface SessionDocument {
  _id: ObjectId;
  participants: ObjectId[]; // always sorted
  sessionData: Record<string, string>; // encrypted session states
  lastActivity: Date;
}