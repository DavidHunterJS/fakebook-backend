// types/socket.ts

import {EncryptedMessage, SignedPrekey} from './signal.types'

export interface ServerToClientEvents {
  message_received: (data: {
    chatId: string;
    senderId: string;
    encryptedPayload: EncryptedMessage;
    timestamp: Date;
    messageId: string;
  }) => void;
  
  user_online: (userId: string) => void;
  user_offline: (userId: string) => void;
  
  typing_start: (data: { chatId: string; userId: string }) => void;
  typing_stop: (data: { chatId: string; userId: string }) => void;
  
  key_rotation_complete: (userId: string) => void;
}

export interface ClientToServerEvents {
  send_message: (data: {
    chatId: string;
    recipientId: string;
    encryptedPayload: EncryptedMessage;
    tempId: string; // for optimistic UI
  }) => void;
  
  join_chat: (chatId: string) => void;
  leave_chat: (chatId: string) => void;
  
  typing_start: (chatId: string) => void;
  typing_stop: (chatId: string) => void;
  
  request_prekey_bundle: (userId: string) => void;
  upload_prekeys: (prekeys: Array<{id: number; publicKey: string}>) => void;
  rotate_signed_prekey: (newPrekey: SignedPrekey) => void;
}

export interface InterServerEvents {
  // for scaling across multiple server instances
}

export interface SocketData {
  userId: string;
  username: string;
}