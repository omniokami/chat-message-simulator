import { useCallback, useMemo, useState, type RefObject } from "react"
import type { ReaderImageEntry } from "@/components/reader/ReaderImageViewer"
import type { Conversation } from "@/types/conversation"
import type { Message } from "@/types/message"
import { getMessageImages } from "@/utils/messageImages"

interface UseConversationImageViewerOptions {
  conversation: Conversation
  exportElementRef: RefObject<HTMLDivElement | null>
}

export const useConversationImageViewer = ({
  conversation,
  exportElementRef,
}: UseConversationImageViewerOptions) => {
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [enabledParticipantIds, setEnabledParticipantIds] = useState<string[]>([])

  const images = useMemo<ReaderImageEntry[]>(
    () =>
      conversation.messages
        .filter((message) => !message.isHidden && message.type === "image")
        .flatMap((message) => {
          const sender = conversation.participants.find((participant) => participant.id === message.senderId)
          return getMessageImages(message).map((image) => ({
            id: `${message.id}:${image.id}`,
            image,
            message,
            sender,
          }))
        }),
    [conversation.messages, conversation.participants],
  )

  const imageParticipantIds = useMemo(
    () => Array.from(new Set(images.map((image) => image.message.senderId))),
    [images],
  )
  const resolvedActiveImageId = useMemo(
    () =>
      activeImageId && images.some((image) => image.id === activeImageId)
        ? activeImageId
        : null,
    [activeImageId, images],
  )
  const resolvedEnabledParticipantIds = resolvedActiveImageId ? enabledParticipantIds : []

  const openImageViewer = useCallback(
    (message: Message, imageId?: string) => {
      if (message.type !== "image") return
      const messageImages = getMessageImages(message)
      const selectedImage =
        messageImages.find((image) => image.id === imageId) ?? messageImages[0]
      if (!selectedImage) return
      setEnabledParticipantIds(imageParticipantIds)
      setActiveImageId(`${message.id}:${selectedImage.id}`)
    },
    [imageParticipantIds],
  )

  const closeImageViewer = useCallback(() => {
    setActiveImageId(null)
    setEnabledParticipantIds([])
  }, [])

  const scrollToMessage = useCallback(
    (messageId: string) => {
      closeImageViewer()

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const root = exportElementRef.current
          if (!root) return

          const escapedMessageId =
            typeof window.CSS?.escape === "function"
              ? window.CSS.escape(messageId)
              : messageId.replace(/["\\]/g, "\\$&")
          const target = root.querySelector<HTMLElement>(`[data-message-id="${escapedMessageId}"]`)

          target?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          })
        })
      })
    },
    [closeImageViewer, exportElementRef],
  )

  return {
    images,
    activeImageId: resolvedActiveImageId,
    enabledParticipantIds: resolvedEnabledParticipantIds,
    openImageViewer,
    closeImageViewer,
    scrollToMessage,
    setActiveImageId,
    setEnabledParticipantIds,
  }
}
