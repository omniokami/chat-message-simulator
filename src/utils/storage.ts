import type { Conversation } from "../types/conversation"
import type { ConversationWithAppearance } from "../store/conversationStore"

export const downloadJson = (data: ConversationWithAppearance | Conversation, filename: string) => {
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

export const readJsonFile = (file: File): Promise<ConversationWithAppearance | Conversation> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const content = JSON.parse(reader.result as string)
        resolve(content as ConversationWithAppearance | Conversation)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })