import Conversation, { IConversationParticipant } from '../models/Conversation';

export type ChatPermission = 
  | 'canAddMembers' 
  | 'canRemoveMembers' 
  | 'canChangeSettings' 
  | 'canDeleteMessages';

export const checkPermission = async (
  userId: string,
  conversationId: string,
  permission: ChatPermission
): Promise<boolean> => {
  try {
    const conversation = await Conversation.findById(conversationId).select('participants');
    if (!conversation) {
      return false;
    }

    const participant = conversation.participants.find(p => p.userId.toString() === userId);
    if (!participant) {
      return false;
    }

    const permissions = participant.permissions;

    if (participant.role === 'admin') {
      // Admins have permission unless it's explicitly set to false
      return !permissions || permissions[permission] !== false;
    }

    if (participant.role === 'member') {
      // Members only have permission if it's explicitly set to true
      return !!permissions && permissions[permission] === true;
    }

    return false;
    
  } catch (error) {
    console.error(`Error checking permission '${permission}':`, error);
    return false;
  }
};