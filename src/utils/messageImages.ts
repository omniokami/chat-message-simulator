import type { Message, MessageImage } from "@/types/message"

export const MAX_MESSAGE_IMAGES = 5

export const getMessageImages = (message: Message): MessageImage[] => {
  if (message.type !== "image") return []

  if (message.images?.length) {
    return message.images
      .filter((image) => Boolean(image.url))
      .slice(0, MAX_MESSAGE_IMAGES)
      .map((image, index) => ({
        ...image,
        id: image.id || `${message.id}-image-${index + 1}`,
        exportSpoiler: image.isSpoiler ? image.exportSpoiler : undefined,
      }))
  }

  if (!message.imageUrl) return []

  return [
    {
      id: `${message.id}-image-1`,
      url: message.imageUrl,
      width: message.imageWidth,
      height: message.imageHeight,
      isSpoiler: message.isSpoiler,
      exportSpoiler: message.isSpoiler ? message.exportSpoiler : undefined,
    },
  ]
}

export const getPrimaryMessageImage = (message: Message) => getMessageImages(message)[0]
