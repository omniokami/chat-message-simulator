export type MessageType = "text" | "system" | "image"
export type MessageStatus = "sent" | "delivered" | "read" | "error"

export interface MessageImage {
  id: string
  url: string
  width?: number
  height?: number
  isSpoiler?: boolean
  exportSpoiler?: boolean
}

export interface Message {
  id: string
  senderId: string
  content: string
  images?: MessageImage[]
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
