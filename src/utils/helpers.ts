import { format } from "date-fns"
import type { Conversation } from "@/types/conversation"

export const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2, 10)}`
}

export const formatTimestamp = (timestamp: string) => {
  try {
    return format(new Date(timestamp), "p")
  } catch {
    return ""
  }
}

export const formatDateSeparator = (timestamp: string) => {
  try {
    return format(new Date(timestamp), "MMM d, yyyy")
  } catch {
    return ""
  }
}

export const formatInstagramDateSeparator = (timestamp: string, showYear = false) => {
  try {
    return format(new Date(timestamp), showYear ? "d MMM yyyy 'AT' HH:mm" : "d MMM 'AT' HH:mm").toUpperCase()
  } catch {
    return ""
  }
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const getConversationTitle = (conversation: Conversation) => {
  const names = conversation.participants.map((participant) => participant.name).filter(Boolean)
  if (conversation.participants.length > 2) {
    return conversation.groupName?.trim() || "Group Chat"
  }
  if (names.length === 0) return "New Chat"
  if (names.length === 1) return names[0]
  return `${names[0]} & ${names[1]}`
}

const PNG_MIME_TYPE = "image/png"
const WEBP_MIME_TYPE = "image/webp"
const WEBP_QUALITY = 0.9

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
    }

    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error("Could not load the selected image."))
    }
    image.src = objectUrl
  })

const convertPngFileToWebpDataUrl = async (file: File): Promise<string | null> => {
  const image = await loadImageFromFile(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) {
    return null
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }

  context.drawImage(image, 0, 0, width, height)

  const webpDataUrl = canvas.toDataURL(WEBP_MIME_TYPE, WEBP_QUALITY)
  return webpDataUrl.startsWith(`data:${WEBP_MIME_TYPE}`) ? webpDataUrl : null
}

export const readFileAsDataUrl = (file: File): Promise<string> =>
  (async () => {
    if (file.type === PNG_MIME_TYPE) {
      try {
        const converted = await convertPngFileToWebpDataUrl(file)
        if (converted) {
          return converted
        }
      } catch (error) {
        console.error("Failed to convert PNG to WebP", error)
      }
    }

    return readBlobAsDataUrl(file)
  })()
