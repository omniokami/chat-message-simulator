export type MessageType = "text" | "system" | "image"
export type MessageStatus = "sent" | "delivered" | "read" | "error"

export interface Message {
  id: string
  senderId: string
  content: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  timestamp: string
  type: MessageType
  status: MessageStatus
  isHidden?: boolean
  isSpoiler?: boolean
  exportSpoiler?: boolean
}
