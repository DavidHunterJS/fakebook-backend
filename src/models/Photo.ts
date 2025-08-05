import mongoose, { Document, Schema, Model } from 'mongoose';

// Interface describing the properties of a Photo document
export interface IPhoto extends Document {
  user: mongoose.Types.ObjectId;
  album: mongoose.Types.ObjectId;
  filename: string; // The key/filename stored in your S3 bucket
  caption: string;
  likes: mongoose.Types.ObjectId[];
  comments: mongoose.Types.ObjectId[]; // Assuming you have a Comment model
}

const photoSchema: Schema<IPhoto> = new Schema({
  // The user who uploaded the photo. This is a reference to the User model.
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // The album this photo belongs to.
  album: {
    type: Schema.Types.ObjectId,
    ref: 'Album',
    required: true,
  },
  // The unique filename/key from your S3 storage.
  // This is used with getFullImageUrl() on the frontend.
  filename: {
    type: String,
    required: true,
  },
  // An optional caption for the individual photo.
  caption: {
    type: String,
    trim: true,
    maxlength: 2200,
  },
  // An array of User IDs who have liked this photo.
  likes: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  // An array of Comment IDs related to this photo.
  comments: [{
    type: Schema.Types.ObjectId,
    ref: 'Comment' // Make sure you have a 'Comment' model for this to work
  }]
}, {
  // Automatically adds `createdAt` and `updatedAt` fields
  timestamps: true,
});

const Photo: Model<IPhoto> = mongoose.model<IPhoto>('Photo', photoSchema);

export default Photo;