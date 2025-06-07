// src/__mocks__/nodemailer.ts

// This is the actual spy function we will monitor in our tests
export const mockSendMail = jest.fn().mockImplementation((mailOptions) => {
  // Return a resolved Promise to simulate successful email sending
  return Promise.resolve({ messageId: 'mock-message-id' });
});

// We mock createTransport to return an object with our spy
const createTransport = jest.fn().mockImplementation(() => ({
  sendMail: mockSendMail, // Use the spy function
}));

// Export this structure to mimic the real nodemailer library
export default {
  createTransport,
};