import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { ReaderImageEntry } from "@/components/reader/ReaderImageViewer"
import type { Conversation } from "@/types/conversation"
import type { Message } from "@/types/message"
import { getMessageImages } from "@/utils/messageImages"
import { animateElementIntoWindowView, animateElementScrollTop } from "@/utils/scrollAnimation"

interface UseConversationImageViewerOptions {
  conversation: Conversation
  exportElementRef: RefObject<HTMLDivElement | null>
  pageScrollTargetRef?: RefObject<HTMLElement | null>
  scrollAnimation?: "native" | "snappy"
}

const MESSAGE_GO_TO_HIGHLIGHT_CLASS = "chat-message-go-to-highlight"
const MESSAGE_GO_TO_HIGHLIGHT_DURATION = 1400
const MESSAGE_GO_TO_SCROLL_SETTLE_DELAY = 140
const MESSAGE_GO_TO_SCROLL_MAX_WAIT = 2400
const PARTICIPANT_FILTER_STORAGE_PREFIX = "chat-sim-image-viewer-participant-filters"

const getParticipantFilterStorageKey = (conversationId: string) =>
  `${PARTICIPANT_FILTER_STORAGE_PREFIX}:${conversationId}`

const readStoredParticipantFilterIds = (storageKey: string) => {
  if (typeof window === "undefined") return null

  try {
    const value = window.sessionStorage.getItem(storageKey)
    if (!value) return null

    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return null

    return parsed.filter(
      (participantId): participantId is string => typeof participantId === "string",
    )
  } catch {
    return null
  }
}

const writeStoredParticipantFilterIds = (storageKey: string, participantIds: string[]) => {
  if (typeof window === "undefined") return

  try {
    if (participantIds.length === 0) {
      window.sessionStorage.removeItem(storageKey)
      return
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify(participantIds))
  } catch {
    // Session persistence is a convenience; blocked storage should not break the viewer.
  }
}

const resolveEnabledParticipantIds = (
  participantIds: string[] | null,
  imageParticipantIds: string[],
) => {
  if (imageParticipantIds.length === 0) return []
  if (!participantIds?.length) return imageParticipantIds

  const participantIdSet = new Set(participantIds)
  const enabledIds = imageParticipantIds.filter((participantId) =>
    participantIdSet.has(participantId),
  )
  return enabledIds.length > 0 ? enabledIds : imageParticipantIds
}

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
  scrollAnimation = "snappy",
}: UseConversationImageViewerOptions) => {
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [enabledParticipantIds, setEnabledParticipantIdsState] = useState<string[]>([])
  const highlightTimeoutsRef = useRef(new Map<HTMLElement, number>())
  const pendingHighlightCleanupsRef = useRef(new Set<() => void>())
  const participantFilterStorageKey = useMemo(
    () => getParticipantFilterStorageKey(conversation.id),
    [conversation.id],
  )

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
  const readEnabledParticipantIds = useCallback(
    () =>
      resolveEnabledParticipantIds(
        readStoredParticipantFilterIds(participantFilterStorageKey),
        imageParticipantIds,
      ),
    [imageParticipantIds, participantFilterStorageKey],
  )
  const setEnabledParticipantIds = useCallback(
    (participantIds: string[]) => {
      const nextParticipantIds = resolveEnabledParticipantIds(
        participantIds,
        imageParticipantIds,
      )
      writeStoredParticipantFilterIds(participantFilterStorageKey, nextParticipantIds)
      setEnabledParticipantIdsState(nextParticipantIds)
    },
    [imageParticipantIds, participantFilterStorageKey],
  )

  const openImageViewer = useCallback(
    (message: Message, imageId?: string) => {
      if (message.type !== "image") return
      const messageImages = getMessageImages(message)
      const selectedImage =
        messageImages.find((image) => image.id === imageId) ?? messageImages[0]
      if (!selectedImage) return
      const nextParticipantIds = resolveEnabledParticipantIds(
        [...readEnabledParticipantIds(), message.senderId],
        imageParticipantIds,
      )
      writeStoredParticipantFilterIds(participantFilterStorageKey, nextParticipantIds)
      setEnabledParticipantIdsState(nextParticipantIds)
      setActiveImageId(`${message.id}:${selectedImage.id}`)
    },
    [imageParticipantIds, participantFilterStorageKey, readEnabledParticipantIds],
  )

  const closeImageViewer = useCallback(() => {
    setActiveImageId(null)
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
            const top = getCenteredMessageScrollTop(scrollRoot, target)
            if (scrollAnimation === "native") {
              scrollRoot.scrollTo({ top, behavior: "smooth" })
            } else {
              animateElementScrollTop(scrollRoot, top)
            }
          } else {
            if (scrollAnimation === "native") {
              target.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
              })
            } else {
              animateElementIntoWindowView(target)
            }
          }
          const pageScrollTarget = pageScrollTargetRef?.current
          if (pageScrollTarget) {
            if (scrollAnimation === "native") {
              pageScrollTarget.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
              })
            } else {
              animateElementIntoWindowView(pageScrollTarget)
            }
          }
        })
      })
    },
    [
      closeImageViewer,
      exportElementRef,
      pageScrollTargetRef,
      scheduleHighlightAfterScroll,
      scrollAnimation,
    ],
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
