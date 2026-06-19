import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { ReaderImageEntry } from "@/components/reader/ReaderImageViewer"
import type { Conversation } from "@/types/conversation"
import type { Message } from "@/types/message"
import { getMessageImages } from "@/utils/messageImages"

interface UseConversationImageViewerOptions {
  conversation: Conversation
  exportElementRef: RefObject<HTMLDivElement | null>
  pageScrollTargetRef?: RefObject<HTMLElement | null>
}

const MESSAGE_GO_TO_HIGHLIGHT_CLASS = "chat-message-go-to-highlight"
const MESSAGE_GO_TO_HIGHLIGHT_DURATION = 1400
const MESSAGE_GO_TO_SCROLL_SETTLE_DELAY = 140
const MESSAGE_GO_TO_SCROLL_MAX_WAIT = 2400

const getCenteredMessageScrollTop = (scrollRoot: HTMLElement, target: HTMLElement) => {
  const rootRect = scrollRoot.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const scaleY = rootRect.height > 0 && scrollRoot.clientHeight > 0
    ? rootRect.height / scrollRoot.clientHeight
    : 1
  const normalizedScaleY = scaleY > 0 ? scaleY : 1
  const targetTop = scrollRoot.scrollTop + (targetRect.top - rootRect.top) / normalizedScaleY
  const targetHeight = targetRect.height / normalizedScaleY
  const centeredTop = targetTop - (scrollRoot.clientHeight - targetHeight) / 2
  const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight)
  return Math.min(Math.max(0, centeredTop), maxTop)
}

export const useConversationImageViewer = ({
  conversation,
  exportElementRef,
  pageScrollTargetRef,
}: UseConversationImageViewerOptions) => {
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [enabledParticipantIds, setEnabledParticipantIds] = useState<string[]>([])
  const highlightTimeoutsRef = useRef(new Map<HTMLElement, number>())
  const pendingHighlightCleanupsRef = useRef(new Set<() => void>())

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

  const highlightMessageElement = useCallback((target: HTMLElement) => {
    const existingTimeout = highlightTimeoutsRef.current.get(target)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    target.classList.remove(MESSAGE_GO_TO_HIGHLIGHT_CLASS)
    void target.offsetWidth
    target.classList.add(MESSAGE_GO_TO_HIGHLIGHT_CLASS)

    const timeout = window.setTimeout(() => {
      target.classList.remove(MESSAGE_GO_TO_HIGHLIGHT_CLASS)
      highlightTimeoutsRef.current.delete(target)
    }, MESSAGE_GO_TO_HIGHLIGHT_DURATION)
    highlightTimeoutsRef.current.set(target, timeout)
  }, [])

  const scheduleHighlightAfterScroll = useCallback(
    (target: HTMLElement) => {
      const scrollRoot = target.closest<HTMLElement>('[data-conversation-scroll-root="true"]')
      if (!scrollRoot) {
        highlightMessageElement(target)
        return
      }

      Array.from(pendingHighlightCleanupsRef.current).forEach((cleanup) => cleanup())

      let settleTimeout = 0
      let maxTimeout = 0
      let isFinished = false

      const cleanup = () => {
        isFinished = true
        if (settleTimeout) window.clearTimeout(settleTimeout)
        if (maxTimeout) window.clearTimeout(maxTimeout)
        scrollRoot.removeEventListener("scroll", handleScroll)
        scrollRoot.removeEventListener("scrollend", finish)
        pendingHighlightCleanupsRef.current.delete(cleanup)
      }
      const finish = () => {
        if (isFinished) return
        cleanup()
        highlightMessageElement(target)
      }
      const queueSettleCheck = () => {
        if (settleTimeout) window.clearTimeout(settleTimeout)
        settleTimeout = window.setTimeout(finish, MESSAGE_GO_TO_SCROLL_SETTLE_DELAY)
      }
      const handleScroll = () => {
        queueSettleCheck()
      }

      pendingHighlightCleanupsRef.current.add(cleanup)
      scrollRoot.addEventListener("scroll", handleScroll, { passive: true })
      scrollRoot.addEventListener("scrollend", finish)
      queueSettleCheck()
      maxTimeout = window.setTimeout(finish, MESSAGE_GO_TO_SCROLL_MAX_WAIT)
    },
    [highlightMessageElement],
  )

  useEffect(
    () => () => {
      Array.from(pendingHighlightCleanupsRef.current).forEach((cleanup) => cleanup())
      pendingHighlightCleanupsRef.current.clear()
      highlightTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout))
      highlightTimeoutsRef.current.clear()
    },
    [],
  )

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

          if (!target) return

          scheduleHighlightAfterScroll(target)
          const scrollRoot = target.closest<HTMLElement>('[data-conversation-scroll-root="true"]')
          if (scrollRoot) {
            scrollRoot.scrollTo({
              top: getCenteredMessageScrollTop(scrollRoot, target),
              behavior: "smooth",
            })
          } else {
            target.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            })
          }
          pageScrollTargetRef?.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          })
        })
      })
    },
    [closeImageViewer, exportElementRef, pageScrollTargetRef, scheduleHighlightAfterScroll],
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
