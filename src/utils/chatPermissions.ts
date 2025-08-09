// src/utils/chatPermissions.ts
import Conversation from '../models/Conversation';

export async function checkAdminPermission(
  userId: string, 
  conversationId: string, 
  permission: 'canKickUsers' | 'canDeleteMessages' | 'canChangeSettings' | 'canAddMembers'
): Promise<boolean> {
  try {
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) return false;
    
    const participant = conversation.participants.find(
      p => p.userId.toString() === userId
    );
    
    if (!participant || participant.role !== 'admin') {
      return false;
    }
    
    // If no specific permissions set, admins can do everything
    if (!participant.permissions) return true;
    
    return participant.permissions[permission] || false;
  } catch (error) {
    console.error('Error checking admin permission:', error);
    return false;
  }
}

export async function isConversationParticipant(
  userId: string, 
  conversationId: string
): Promise<boolean> {
  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.userId': userId
    });
    
    return !!conversation;
  } catch (error) {
    console.error('Error checking conversation participation:', error);
    return false;
  }
}