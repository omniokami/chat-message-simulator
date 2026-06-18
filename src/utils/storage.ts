import type { Conversation } from "../types/conversation"
import type { ConversationWithAppearance } from "../store/conversationStore"

export type ConversationImportData = ConversationWithAppearance | Conversation
export type LoadConversation = (
  conversation: Conversation,
  appearance?: Partial<ConversationWithAppearance>,
) => void

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === "string"

const validateConversation = (value: unknown): Conversation => {
  if (!isRecord(value)) {
    throw new Error("Save file must contain a conversation object.")
  }

  if (!hasString(value, "id")) {
    throw new Error("Conversation is missing an id.")
  }

  if (!Array.isArray(value.participants)) {
    throw new Error("Conversation is missing participants.")
  }

  if (!Array.isArray(value.messages)) {
    throw new Error("Conversation is missing messages.")
  }

  if (!isRecord(value.metadata) || !hasString(value.metadata, "createdAt") || !hasString(value.metadata, "updatedAt")) {
    throw new Error("Conversation is missing metadata.")
  }

  const hasInvalidParticipant = value.participants.some(
    (participant) =>
      !isRecord(participant) ||
      !hasString(participant, "id") ||
      !hasString(participant, "name"),
  )
  if (hasInvalidParticipant) {
    throw new Error("Conversation participants are not valid.")
  }

  const hasInvalidMessage = value.messages.some(
    (message) =>
      !isRecord(message) ||
      !hasString(message, "id") ||
      !hasString(message, "senderId") ||
      !hasString(message, "timestamp"),
  )
  if (hasInvalidMessage) {
    throw new Error("Conversation messages are not valid.")
  }

  return value as unknown as Conversation
}

export const validateConversationData = (data: unknown): ConversationImportData => {
  if (!isRecord(data)) {
    throw new Error("Save file must be a JSON object.")
  }

  if ("conversation" in data) {
    validateConversation(data.conversation)
    return data as unknown as ConversationWithAppearance
  }

  return validateConversation(data)
}

export const loadConversationData = (
  data: ConversationImportData,
  loadConversation: LoadConversation,
) => {
  const validData = validateConversationData(data)
  if ("conversation" in validData) {
    const { conversation, ...appearance } = validData
    loadConversation(conversation, appearance)
    return
  }

  loadConversation(validData)
}

export const downloadJson = (data: ConversationImportData, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const readJsonFile = (file: File): Promise<ConversationImportData> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const content = JSON.parse(reader.result as string)
        resolve(validateConversationData(content))
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
