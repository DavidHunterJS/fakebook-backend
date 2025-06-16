// FILE PATH: src/middlewares/__mocks__/s3-upload.middleware.ts

import { Request, Response, NextFunction } from 'express';

// This is a dummy function that will be used for all middleware implementations.
// It calls next() immediately to prevent timeouts and let the request continue.
const dummyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  next();
};

// This is our mock object. It will be the default export.
// The error messages show that your code uses it in two ways:
// 1. As a function directly (e.g., for post creation)
// 2. As an object with methods (e.g., s3UploadMiddleware.profilePicture)
//
// To handle both cases, we make our main export a function, and then
// attach the other methods as properties to that function.
const mock = dummyMiddleware;

// Attach the named properties that your routes and controllers need.
Object.assign(mock, {
  profilePicture: dummyMiddleware,
  deleteFile: jest.fn().mockResolvedValue(undefined),
  // Add any other properties if needed, e.g., coverPhoto: dummyMiddleware
});

export default mock;