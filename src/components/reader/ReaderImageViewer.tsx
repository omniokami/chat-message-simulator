import * as DialogPrimitive from "@radix-ui/react-dialog"
import { format } from "date-fns"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  MessageSquareText,
  Users,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { AvatarImage } from "@/components/ui/avatar-image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import type { Participant } from "@/types/conversation"
import type { Message, MessageImage } from "@/types/message"
import { cn } from "@/utils/cn"

const UI_HIDE_DELAY_MS = 2600
const MAX_CAPTION_LENGTH = 100
const OPEN_IN_NEW_TAB_OBJECT_URL_LIFETIME_MS = 60_000
const MOBILE_IMAGE_VIEWER_MEDIA_QUERY = "(max-width: 1023px) and (pointer: coarse)"
const viewerButtonPointerClass =
  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
const viewerControlSelector = "[data-viewer-control]"

export interface ReaderImageEntry {
  id: string
  image: MessageImage
  message: Message
  sender?: Participant
}

interface ReaderImageViewerProps {
  open: boolean
  activeImageId: string | null
  images: ReaderImageEntry[]
  participants: Participant[]
  enabledParticipantIds: string[]
  onEnabledParticipantIdsChange: (participantIds: string[]) => void
  onActiveImageChange: (imageId: string) => void
  onClose: () => void
  onGoToMessage: (messageId: string) => void
}

const formatViewerTimestamp = (timestamp: string) => {
  try {
    return format(new Date(timestamp), "MMM d, yyyy - p")
  } catch {
    return ""
  }
}

const truncateCaption = (value: string, maxLength = MAX_CAPTION_LENGTH) =>
  value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}...` : value

const sanitizeFileSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image"

const inferImageExtension = (imageUrl: string) => {
  const dataUrlMatch = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(imageUrl)
  if (dataUrlMatch) {
    const extension = dataUrlMatch[1].toLowerCase()
    return extension === "jpeg" ? "jpg" : extension
  }

  try {
    const pathname = new URL(imageUrl, window.location.href).pathname
    const extensionMatch = /\.([a-z0-9]{2,5})$/i.exec(pathname)
    if (extensionMatch) {
      return extensionMatch[1].toLowerCase()
    }
  } catch {
    return "png"
  }

  return "png"
}

const shouldUseObjectUrl = (imageUrl?: string): imageUrl is string =>
  Boolean(imageUrl?.startsWith("data:image/"))

const buildDownloadName = (image: ReaderImageEntry) => {
  const senderName = sanitizeFileSegment(image.sender?.name ?? "participant")
  const extension = inferImageExtension(image.image.url)
  return `chat-image-${senderName}-${image.id.replace(/[^a-z0-9-]+/gi, "-")}.${extension}`
}

const ViewerAvatar = ({
  participant,
  className,
}: {
  participant?: Participant
  className?: string
}) => {
  const fallback = (participant?.name || "??").slice(0, 2).toUpperCase()

  if (participant?.avatarUrl) {
    return <AvatarImage src={participant.avatarUrl} alt={participant.name} className={className} />
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-white/12 text-[0.62rem] font-semibold text-white/80",
        className,
      )}
    >
      {fallback}
    </div>
  )
}

const isViewerControlTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest(viewerControlSelector))

const getIsMobileImageViewer = () =>
  typeof window !== "undefined" && window.matchMedia(MOBILE_IMAGE_VIEWER_MEDIA_QUERY).matches

const useIsMobileImageViewer = () => {
  const [isMobileImageViewer, setIsMobileImageViewer] = useState(getIsMobileImageViewer)

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia(MOBILE_IMAGE_VIEWER_MEDIA_QUERY)
    const syncIsMobileImageViewer = () => {
      setIsMobileImageViewer((current) =>
        current === mediaQuery.matches ? current : mediaQuery.matches,
      )
    }

    syncIsMobileImageViewer()
    mediaQuery.addEventListener("change", syncIsMobileImageViewer)

    return () => {
      mediaQuery.removeEventListener("change", syncIsMobileImageViewer)
    }
  }, [])

  return isMobileImageViewer
}

export const ReaderImageViewer = ({
  open,
  activeImageId,
  images,
  participants,
  enabledParticipantIds,
  onEnabledParticipantIdsChange,
  onActiveImageChange,
  onClose,
  onGoToMessage,
}: ReaderImageViewerProps) => {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const mobilePreviewScrollerRef = useRef<HTMLDivElement | null>(null)
  const mobileCurrentPreviewButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobilePointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const hideUiTimeoutRef = useRef<number | null>(null)
  const mobileHistoryEntryIdRef = useRef<string | null>(null)
  const mobileFiltersHistoryEntryIdRef = useRef<string | null>(null)
  const isMobileImageViewer = useIsMobileImageViewer()
  const [isUiVisible, setIsUiVisible] = useState(true)
  const [isMobileParticipantFiltersOpen, setIsMobileParticipantFiltersOpen] = useState(false)

  const imagesById = useMemo(
    () => new Map(images.map((image) => [image.id, image])),
    [images],
  )
  const activeImage = activeImageId ? imagesById.get(activeImageId) : undefined
  const displayImage = activeImage
  const enabledParticipantIdSet = useMemo(
    () => new Set(enabledParticipantIds),
    [enabledParticipantIds],
  )
  const participantOptions = useMemo(() => {
    const imageCountByParticipant = new Map<string, number>()
    const senderByParticipantId = new Map<string, Participant | undefined>()
    const participantIndex = new Map(
      participants.map((participant, index) => [participant.id, index]),
    )

    for (const image of images) {
      const senderId = image.message.senderId
      imageCountByParticipant.set(senderId, (imageCountByParticipant.get(senderId) ?? 0) + 1)
      if (!senderByParticipantId.has(senderId)) {
        senderByParticipantId.set(senderId, image.sender)
      }
    }

    return Array.from(imageCountByParticipant.entries())
      .map(([participantId, imageCount]) => ({
        participantId,
        imageCount,
        participant:
          participants.find((participant) => participant.id === participantId) ??
          senderByParticipantId.get(participantId),
      }))
      .sort((left, right) => {
        const leftIndex = participantIndex.get(left.participantId) ?? Number.MAX_SAFE_INTEGER
        const rightIndex = participantIndex.get(right.participantId) ?? Number.MAX_SAFE_INTEGER
        return leftIndex - rightIndex
      })
  }, [images, participants])
  const filteredImages = useMemo(
    () => images.filter((image) => enabledParticipantIdSet.has(image.message.senderId)),
    [enabledParticipantIdSet, images],
  )
  const currentFilteredIndex = filteredImages.findIndex(
    (image) => image.id === activeImageId,
  )
  const previewWindow = useMemo(() => {
    if (currentFilteredIndex < 0) {
      return {
        images: [],
        hasMoreOnLeft: false,
        hasMoreOnRight: false,
      }
    }

    if (filteredImages.length <= 9) {
      return {
        images: filteredImages.map((image, index) => ({
          image,
          isCurrent: index === currentFilteredIndex,
        })),
        hasMoreOnLeft: false,
        hasMoreOnRight: false,
      }
    }

    const maxStart = Math.max(0, filteredImages.length - 9)
    const start = Math.min(Math.max(0, currentFilteredIndex - 4), maxStart)
    const end = start + 9

    return {
      images: filteredImages.slice(start, end).map((image, index) => {
        const actualIndex = start + index
        return {
          image,
          isCurrent: actualIndex === currentFilteredIndex,
        }
      }),
      hasMoreOnLeft: start > 0,
      hasMoreOnRight: end < filteredImages.length,
    }
  }, [currentFilteredIndex, filteredImages])
  const mobilePreviewImages = useMemo(
    () =>
      filteredImages.map((image, index) => ({
        image,
        isCurrent: index === currentFilteredIndex,
      })),
    [currentFilteredIndex, filteredImages],
  )
  const imagePositionLabel =
    currentFilteredIndex >= 0 && filteredImages.length > 0
      ? `${currentFilteredIndex + 1} / ${filteredImages.length}`
      : ""
  const previousImage =
    currentFilteredIndex > 0 ? filteredImages[currentFilteredIndex - 1] : undefined
  const nextImage =
    currentFilteredIndex >= 0 && currentFilteredIndex < filteredImages.length - 1
      ? filteredImages[currentFilteredIndex + 1]
      : undefined

  const clearHideUiTimeout = useCallback(() => {
    if (!hideUiTimeoutRef.current) return
    window.clearTimeout(hideUiTimeoutRef.current)
    hideUiTimeoutRef.current = null
  }, [])

  const scheduleUiHide = useCallback(() => {
    clearHideUiTimeout()
    hideUiTimeoutRef.current = window.setTimeout(() => {
      setIsUiVisible(false)
      hideUiTimeoutRef.current = null
    }, UI_HIDE_DELAY_MS)
  }, [clearHideUiTimeout])

  const revealUi = useCallback(() => {
    setIsUiVisible(true)
    if (!isMobileImageViewer) {
      scheduleUiHide()
    } else {
      clearHideUiTimeout()
    }
  }, [clearHideUiTimeout, isMobileImageViewer, scheduleUiHide])

  const toggleMobileUi = useCallback(() => {
    clearHideUiTimeout()
    setIsUiVisible((visible) => !visible)
  }, [clearHideUiTimeout])

  const closeViewer = useCallback(() => {
    setIsMobileParticipantFiltersOpen(false)
    onClose()
  }, [onClose])

  const closeViewerSoon = useCallback(() => {
    const timeoutId = window.setTimeout(closeViewer, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [closeViewer])

  const goToPreviousImage = useCallback(() => {
    if (!previousImage) return
    revealUi()
    onActiveImageChange(previousImage.id)
  }, [onActiveImageChange, previousImage, revealUi])

  const goToNextImage = useCallback(() => {
    if (!nextImage) return
    revealUi()
    onActiveImageChange(nextImage.id)
  }, [nextImage, onActiveImageChange, revealUi])

  const handleImageStageMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isViewerControlTarget(event.target)) return
    event.preventDefault()
  }, [])

  const handleImageStageClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isViewerControlTarget(event.target)) return

      const bounds = event.currentTarget.getBoundingClientRect()
      const isLeftHalf = event.clientX < bounds.left + bounds.width / 2

      if (isLeftHalf) {
        goToPreviousImage()
        return
      }

      goToNextImage()
    },
    [goToNextImage, goToPreviousImage],
  )

  const handleMobileImageStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobileImageViewer || isViewerControlTarget(event.target)) return
      mobilePointerStartRef.current = { x: event.clientX, y: event.clientY }
    },
    [isMobileImageViewer],
  )

  const handleMobileImageStagePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobileImageViewer || isViewerControlTarget(event.target)) return
      const start = mobilePointerStartRef.current
      mobilePointerStartRef.current = null
      if (!start) return

      const deltaX = event.clientX - start.x
      const deltaY = event.clientY - start.y
      const movedDistance = Math.hypot(deltaX, deltaY)
      const isHorizontalSwipe = Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25

      if (isHorizontalSwipe) {
        const targetImage = deltaX < 0 ? nextImage : previousImage
        if (targetImage) {
          onActiveImageChange(targetImage.id)
        }
        return
      }

      if (movedDistance > 10) return

      toggleMobileUi()
    },
    [isMobileImageViewer, nextImage, onActiveImageChange, previousImage, toggleMobileUi],
  )

  const handleMobileImageStagePointerCancel = useCallback(() => {
    mobilePointerStartRef.current = null
  }, [])

  const findNearestFilteredImage = useCallback(
    (fromImageId: string) => {
      const originIndex = images.findIndex((image) => image.id === fromImageId)
      if (originIndex === -1) return undefined

      for (let offset = 1; offset < images.length; offset += 1) {
        const nextCandidate = images[originIndex + offset]
        if (nextCandidate && enabledParticipantIdSet.has(nextCandidate.message.senderId)) {
          return nextCandidate
        }

        const previousCandidate = images[originIndex - offset]
        if (previousCandidate && enabledParticipantIdSet.has(previousCandidate.message.senderId)) {
          return previousCandidate
        }
      }

      return undefined
    },
    [enabledParticipantIdSet, images],
  )

  useEffect(() => {
    if (!open) {
      clearHideUiTimeout()
      return
    }

    if (!activeImage) {
      return closeViewerSoon()
    }
  }, [activeImage, clearHideUiTimeout, closeViewerSoon, open])

  useEffect(() => {
    if (!open || isMobileImageViewer) return

    const handleWindowBlur = () => scheduleUiHide()
    const handleWindowFocus = () => revealUi()

    window.addEventListener("blur", handleWindowBlur)
    window.addEventListener("focus", handleWindowFocus)

    return () => {
      window.removeEventListener("blur", handleWindowBlur)
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [isMobileImageViewer, open, revealUi, scheduleUiHide])

  useEffect(() => {
    if (!open || !isMobileImageViewer || currentFilteredIndex < 0) return

    const preloadIndexes = [
      currentFilteredIndex - 1,
      currentFilteredIndex,
      currentFilteredIndex + 1,
    ]

    preloadIndexes.forEach((index) => {
      const image = filteredImages[index]
      if (!image) return

      const preloadImage = new Image()
      preloadImage.decoding = "async"
      preloadImage.src = image.image.url
      void preloadImage.decode?.().catch(() => undefined)
    })
  }, [currentFilteredIndex, filteredImages, isMobileImageViewer, open])

  useEffect(() => {
    if (!open || !isMobileImageViewer || !isUiVisible || currentFilteredIndex < 0) return

    const animationFrameId = window.requestAnimationFrame(() => {
      const scroller = mobilePreviewScrollerRef.current
      const currentPreview = mobileCurrentPreviewButtonRef.current
      if (!scroller || !currentPreview) return

      const scrollerRect = scroller.getBoundingClientRect()
      const previewRect = currentPreview.getBoundingClientRect()
      const isFullyVisible =
        previewRect.left >= scrollerRect.left && previewRect.right <= scrollerRect.right

      if (isFullyVisible) return

      const scrollDelta =
        previewRect.left < scrollerRect.left
          ? previewRect.left - scrollerRect.left
          : previewRect.right - scrollerRect.right

      scroller.scrollTo({
        left: scroller.scrollLeft + scrollDelta,
        behavior: "auto",
      })
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [currentFilteredIndex, isMobileImageViewer, isUiVisible, open])

  useEffect(() => {
    if (!open || !isMobileImageViewer || typeof window === "undefined") return

    const entryId = `reader-image-viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const previousState = window.history.state
    const nextState =
      previousState && typeof previousState === "object"
        ? { ...previousState, readerImageViewerEntryId: entryId }
        : { readerImageViewerEntryId: entryId }

    try {
      window.history.pushState(nextState, "", window.location.href)
      mobileHistoryEntryIdRef.current = entryId
    } catch {
      mobileHistoryEntryIdRef.current = null
      return
    }

    const handlePopState = (event: PopStateEvent) => {
      if (mobileHistoryEntryIdRef.current !== entryId) return
      if (
        event.state &&
        typeof event.state === "object" &&
        event.state.readerImageViewerEntryId === entryId
      ) {
        return
      }
      mobileHistoryEntryIdRef.current = null
      closeViewer()
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (mobileHistoryEntryIdRef.current === entryId) {
        mobileHistoryEntryIdRef.current = null
        window.history.back()
      }
    }
  }, [closeViewer, isMobileImageViewer, open])

  useEffect(() => {
    if (
      !open ||
      !isMobileImageViewer ||
      !isMobileParticipantFiltersOpen ||
      typeof window === "undefined"
    ) {
      return
    }

    const entryId = `reader-image-filters-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const previousState = window.history.state
    const nextState =
      previousState && typeof previousState === "object"
        ? { ...previousState, readerImageViewerFilterEntryId: entryId }
        : { readerImageViewerFilterEntryId: entryId }

    try {
      window.history.pushState(nextState, "", window.location.href)
      mobileFiltersHistoryEntryIdRef.current = entryId
    } catch {
      mobileFiltersHistoryEntryIdRef.current = null
      return
    }

    const handlePopState = (event: PopStateEvent) => {
      if (mobileFiltersHistoryEntryIdRef.current !== entryId) return
      if (
        event.state &&
        typeof event.state === "object" &&
        event.state.readerImageViewerFilterEntryId === entryId
      ) {
        return
      }
      mobileFiltersHistoryEntryIdRef.current = null
      setIsMobileParticipantFiltersOpen(false)
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (mobileFiltersHistoryEntryIdRef.current === entryId) {
        mobileFiltersHistoryEntryIdRef.current = null
        window.history.back()
      }
    }
  }, [isMobileImageViewer, isMobileParticipantFiltersOpen, open])

  useEffect(() => {
    if (!open || !activeImageId) return

    if (enabledParticipantIds.length === 0) {
      return
    }

    if (filteredImages.length === 0) {
      return closeViewerSoon()
    }

    const isCurrentImageVisible = filteredImages.some((image) => image.id === activeImageId)
    if (isCurrentImageVisible) return

    const fallbackImage = findNearestFilteredImage(activeImageId)
    if (fallbackImage) {
      onActiveImageChange(fallbackImage.id)
      return
    }

    return closeViewerSoon()
  }, [
    activeImageId,
    closeViewerSoon,
    enabledParticipantIds.length,
    filteredImages,
    findNearestFilteredImage,
    onActiveImageChange,
    open,
  ])

  useEffect(
    () => () => {
      clearHideUiTimeout()
    },
    [clearHideUiTimeout],
  )

  const handleParticipantToggle = (participantId: string, checked: boolean) => {
    revealUi()

    if (
      !checked &&
      enabledParticipantIds.includes(participantId) &&
      enabledParticipantIds.length === 1
    ) {
      return
    }

    const nextParticipantIds = checked
      ? enabledParticipantIds.includes(participantId)
        ? enabledParticipantIds
        : [...enabledParticipantIds, participantId]
      : enabledParticipantIds.filter((currentId) => currentId !== participantId)

    onEnabledParticipantIdsChange(nextParticipantIds)
  }

  const handleOpenImageInNewTab = () => {
    const imageUrl = displayImage?.image.url
    if (!imageUrl) return
    revealUi()

    const openImage = async (sourceUrl: string) => {
      let targetUrl = sourceUrl

      if (shouldUseObjectUrl(sourceUrl)) {
        try {
          const response = await fetch(sourceUrl)
          const blob = await response.blob()
          targetUrl = URL.createObjectURL(blob)
        } catch (error) {
          console.error("Failed to prepare image for new tab", error)
          targetUrl = sourceUrl
        }
      }

      const popup = window.open(targetUrl, "_blank", "noopener,noreferrer")
      if (!popup) {
        const link = document.createElement("a")
        link.href = targetUrl
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.click()
      }

      if (targetUrl !== sourceUrl) {
        window.setTimeout(() => {
          URL.revokeObjectURL(targetUrl)
        }, OPEN_IN_NEW_TAB_OBJECT_URL_LIFETIME_MS)
      }
    }

    void openImage(imageUrl)
  }

  const handleDownloadImage = () => {
    if (!displayImage?.image.url) return
    revealUi()

    const link = document.createElement("a")
    link.href = displayImage.image.url
    link.download = buildDownloadName(displayImage)
    link.rel = "noopener"
    link.click()
  }

  const handleGoToMessage = () => {
    if (!displayImage) return
    onGoToMessage(displayImage.message.id)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? closeViewer() : undefined)}>
      <DialogPortal>
        <DialogOverlay
          className={cn(
            "z-[70] bg-[#050507]",
            !isMobileImageViewer &&
              "lg:bg-black/84 lg:backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          ref={contentRef}
          className={cn(
            "fixed inset-0 z-[71] h-[100dvh] w-screen outline-none",
            isMobileImageViewer
              ? "bg-[#050507] data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
              : "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
            revealUi()
          }}
          onPointerMove={isMobileImageViewer ? undefined : revealUi}
          onPointerDown={isMobileImageViewer ? undefined : revealUi}
          onPointerLeave={isMobileImageViewer ? undefined : scheduleUiHide}
          onFocusCapture={isMobileImageViewer ? undefined : revealUi}
          onBlurCapture={isMobileImageViewer ? undefined : scheduleUiHide}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && previousImage) {
              event.preventDefault()
              goToPreviousImage()
              return
            }

            if (event.key === "ArrowRight" && nextImage) {
              event.preventDefault()
              goToNextImage()
              return
            }

            if (event.key === "Escape") {
              revealUi()
            }
          }}
          tabIndex={-1}
        >
          <DialogTitle className="sr-only">Image viewer</DialogTitle>
          <DialogDescription className="sr-only">
            Fullscreen image viewer for reader mode.
          </DialogDescription>
          {displayImage ? (
            <div
              className={cn(
                "relative h-full w-full overflow-hidden text-white",
                isMobileImageViewer ? "bg-[#050507]" : "bg-transparent",
              )}
            >
              <div className={cn("absolute inset-0", isMobileImageViewer ? "right-0" : "lg:right-[22rem]")}>
                <div className="flex h-full flex-col">
                  <div
                    className="relative min-h-0 flex-1 select-none"
                    onMouseDown={isMobileImageViewer ? undefined : handleImageStageMouseDown}
                    onClick={isMobileImageViewer ? undefined : handleImageStageClick}
                    onPointerDown={
                      isMobileImageViewer ? handleMobileImageStagePointerDown : undefined
                    }
                    onPointerUp={isMobileImageViewer ? handleMobileImageStagePointerUp : undefined}
                    onPointerCancel={
                      isMobileImageViewer ? handleMobileImageStagePointerCancel : undefined
                    }
                  >
                    {isMobileImageViewer ? (
                      <div
                        className={cn(
                          "flex h-full w-full touch-pan-y items-center justify-center px-3",
                          isUiVisible ? "pb-[12.5rem] pt-[4.5rem]" : "py-5",
                        )}
                      >
                        <img
                          src={displayImage.image.url}
                          alt={displayImage.message.content || "Chat image"}
                          draggable={false}
                          loading="eager"
                          decoding="async"
                          className="max-h-full max-w-full select-none rounded-xl object-contain"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-8">
                          <img
                            src={displayImage.image.url}
                            alt={displayImage.message.content || "Chat image"}
                            draggable={false}
                            className="max-h-full max-w-full select-none rounded-2xl object-contain shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
                          />
                        </div>
                        <div
                          className={cn(
                            "pointer-events-none absolute inset-0 transition-opacity duration-200",
                            isUiVisible ? "opacity-100" : "opacity-0",
                          )}
                        >
                          <div className="absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-5">
                            <button
                              type="button"
                              data-viewer-control
                              aria-label="View previous image"
                              disabled={!previousImage}
                              onClick={goToPreviousImage}
                              className={cn(
                                viewerButtonPointerClass,
                                "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-black/40 text-white shadow-lg transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-35",
                              )}
                            >
                              <ChevronLeft className="h-6 w-6" />
                            </button>
                          </div>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 sm:pr-5 lg:pr-7">
                            <button
                              type="button"
                              data-viewer-control
                              aria-label="View next image"
                              disabled={!nextImage}
                              onClick={goToNextImage}
                              className={cn(
                                viewerButtonPointerClass,
                                "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-black/40 text-white shadow-lg transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-35",
                              )}
                            >
                              <ChevronRight className="h-6 w-6" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {!isMobileImageViewer ? (
                    <div
                      className={cn(
                        "pointer-events-none shrink-0 px-3 pb-3 pt-1 transition-opacity duration-200 sm:px-5 sm:pb-4 lg:px-8 lg:pb-5",
                        isUiVisible ? "opacity-100" : "opacity-0",
                      )}
                    >
                      <div className="pointer-events-auto mx-auto w-fit max-w-full overflow-x-auto hide-scrollbar rounded-[1.75rem] border border-white/10 bg-black/30 px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:px-4 lg:backdrop-blur-xl">
                        <div className="flex w-fit items-center justify-center gap-2 sm:gap-3">
                          <span
                            aria-label={
                              previewWindow.hasMoreOnLeft
                                ? "More images on the left"
                                : "No more images on the left"
                            }
                            className="inline-flex h-10 w-8 shrink-0 items-center justify-center select-none text-center text-sm font-semibold tracking-[0.2em] text-white/55 sm:h-12 sm:w-10 sm:text-base"
                          >
                            {previewWindow.hasMoreOnLeft ? "..." : "|"}
                          </span>
                          {previewWindow.images.map(({ image, isCurrent }) => (
                            <button
                              key={image.id}
                              type="button"
                              aria-label={
                                isCurrent ? "Current image preview" : "Open image preview"
                              }
                              onClick={() => {
                                revealUi()
                                onActiveImageChange(image.id)
                              }}
                              className={cn(
                                viewerButtonPointerClass,
                                "group relative overflow-hidden rounded-2xl border bg-white/5 shadow-lg transition duration-200",
                                isCurrent
                                  ? "h-16 w-16 border-white/30 sm:h-[4.5rem] sm:w-[4.5rem] lg:h-20 lg:w-20"
                                  : "h-14 w-14 border-white/8 sm:h-16 sm:w-16 lg:h-[4.25rem] lg:w-[4.25rem] hover:scale-[1.02]",
                              )}
                            >
                              <img
                                src={image.image.url}
                                alt={image.message.content || "Image preview"}
                                draggable={false}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full select-none object-cover"
                              />
                              {!isCurrent ? (
                                <span
                                  aria-hidden="true"
                                  className="absolute inset-0 bg-black/55 transition-colors duration-200 group-hover:bg-black/40"
                                />
                              ) : null}
                            </button>
                          ))}
                          <span
                            aria-label={
                              previewWindow.hasMoreOnRight
                                ? "More images on the right"
                                : "No more images on the right"
                            }
                            className="inline-flex h-10 w-8 shrink-0 items-center justify-center select-none text-center text-sm font-semibold tracking-[0.2em] text-white/55 sm:h-12 sm:w-10 sm:text-base"
                          >
                            {previewWindow.hasMoreOnRight ? "..." : "|"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {isMobileImageViewer ? (
                <>
                  {isUiVisible ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                      <div className="relative h-11">
                        <div className="pointer-events-auto absolute left-0 top-0 flex items-center gap-2">
                          <button
                            type="button"
                            data-viewer-control
                            aria-label="Open image in a new tab"
                            onClick={handleOpenImageInNewTab}
                            className={cn(
                              viewerButtonPointerClass,
                              "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#111114] text-white",
                            )}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            data-viewer-control
                            aria-label="Download image"
                            onClick={handleDownloadImage}
                            className={cn(
                              viewerButtonPointerClass,
                              "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#111114] text-white",
                            )}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            data-viewer-control
                            aria-label="Filter participants"
                            onClick={() => setIsMobileParticipantFiltersOpen(true)}
                            className={cn(
                              viewerButtonPointerClass,
                              "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#111114] text-white",
                            )}
                          >
                            <Users className="h-4 w-4" />
                          </button>
                        </div>
                        {imagePositionLabel ? (
                          <div
                            data-viewer-control
                            className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[#111114] px-3 py-1.5 text-xs font-medium tabular-nums text-white/82"
                          >
                            {imagePositionLabel}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          data-viewer-control
                          aria-label="Close image viewer"
                          onClick={closeViewer}
                          className={cn(
                            viewerButtonPointerClass,
                            "pointer-events-auto absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#111114] text-white",
                          )}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isUiVisible ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
                      <div className="space-y-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                        <div
                          ref={mobilePreviewScrollerRef}
                          data-viewer-control
                          className="pointer-events-auto overflow-x-auto hide-scrollbar rounded-[1.35rem] border border-white/10 bg-[#0c0c0f] px-2 py-2"
                        >
                          <div className="flex w-max items-center gap-2">
                            {mobilePreviewImages.map(({ image, isCurrent }) => (
                              <button
                                key={image.id}
                                ref={isCurrent ? mobileCurrentPreviewButtonRef : undefined}
                                type="button"
                                aria-label={
                                  isCurrent ? "Current image preview" : "Open image preview"
                                }
                                onClick={() => {
                                  revealUi()
                                  onActiveImageChange(image.id)
                                }}
                                className={cn(
                                  viewerButtonPointerClass,
                                  "relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-white/5",
                                  isCurrent ? "border-white/70" : "border-white/10",
                                )}
                              >
                                <img
                                  src={image.image.url}
                                  alt={image.message.content || "Image preview"}
                                  draggable={false}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full select-none object-cover"
                                />
                                {!isCurrent ? (
                                  <span aria-hidden="true" className="absolute inset-0 bg-black/45" />
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div
                          data-viewer-control
                          className="pointer-events-auto max-h-[43dvh] overflow-y-auto rounded-[1.35rem] border border-white/10 bg-[#0c0c0f] p-3"
                        >
                          <div className="flex items-stretch gap-3">
                            <ViewerAvatar
                              participant={displayImage.sender}
                              className="mt-0.5 h-10 w-10"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-white">
                                {displayImage.sender?.name ?? "Unknown participant"}
                              </div>
                              <div className="text-xs text-white/62">
                                {formatViewerTimestamp(displayImage.message.timestamp)}
                              </div>
                              <div className="mt-2 min-h-5">
                                {displayImage.message.content ? (
                                  <p
                                    className="block max-w-full truncate text-sm leading-5 text-white/82"
                                    title={displayImage.message.content}
                                  >
                                    {truncateCaption(displayImage.message.content, 140)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              aria-label="Go to message"
                              className="h-auto w-12 shrink-0 self-stretch rounded-2xl border border-white/12 bg-[#1a1a1f] text-white hover:bg-[#24242a] focus-visible:ring-white/70 focus-visible:ring-offset-transparent"
                              onClick={handleGoToMessage}
                            >
                              <MessageSquareText className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {isMobileParticipantFiltersOpen ? (
                    <div
                      data-viewer-control
                      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[78dvh] rounded-t-[1.6rem] border-t border-white/10 bg-[#0c0c0f] px-3 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] pt-3 text-white"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">Participants</div>
                          <div className="text-xs text-white/55">
                            Choose whose images appear in the viewer.
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Close participant filters"
                          onClick={() => setIsMobileParticipantFiltersOpen(false)}
                          className={cn(
                            viewerButtonPointerClass,
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#111114] text-white",
                          )}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="max-h-[58dvh] space-y-2 overflow-y-auto pr-1">
                        {participantOptions.map(({ participantId, imageCount, participant }) => (
                          <div
                            key={participantId}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111114] px-3 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <ViewerAvatar participant={participant} className="h-9 w-9" />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-white">
                                  {participant?.name ?? "Unknown participant"}
                                </div>
                                <div className="text-xs text-white/55">
                                  {imageCount} image{imageCount === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>
                            <Switch
                              checked={enabledParticipantIdSet.has(participantId)}
                              disabled={
                                enabledParticipantIds.length === 1 &&
                                enabledParticipantIdSet.has(participantId)
                              }
                              onCheckedChange={(checked) =>
                                handleParticipantToggle(participantId, checked)
                              }
                              aria-label={`Toggle images from ${participant?.name ?? "participant"}`}
                              className="bg-white/15 data-[state=checked]:bg-white"
                              thumbClassName="bg-white text-black data-[state=checked]:bg-black"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-4 right-4 top-4 flex w-[min(18rem,calc(100vw-2rem))] flex-col justify-between transition-opacity duration-200 sm:bottom-5 sm:right-5 sm:top-5 lg:bottom-6 lg:right-6 lg:top-6",
                    isUiVisible ? "opacity-100" : "opacity-0",
                  )}
                >
                  <div className="flex min-h-0 flex-col items-end gap-4">
                    <div className="pointer-events-auto flex flex-col items-end">
                      <button
                        type="button"
                        aria-label="Close image viewer"
                        onClick={closeViewer}
                        className={cn(
                          viewerButtonPointerClass,
                          "flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white shadow-lg transition hover:bg-black/65",
                        )}
                      >
                        <X className="h-6 w-6" />
                      </button>
                      <div className="mt-5 flex flex-col gap-2">
                        <button
                          type="button"
                          aria-label="Open image in a new tab"
                          onClick={handleOpenImageInNewTab}
                          className={cn(
                            viewerButtonPointerClass,
                            "flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white shadow-lg transition hover:bg-black/65",
                          )}
                        >
                          <ExternalLink className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Download image"
                          onClick={handleDownloadImage}
                          className={cn(
                            viewerButtonPointerClass,
                            "flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white shadow-lg transition hover:bg-black/65",
                          )}
                        >
                          <Download className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                  <aside className="pointer-events-auto w-full min-h-0 rounded-3xl border border-white/10 bg-black/45 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] lg:backdrop-blur-xl">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-white">Visible participants</div>
                      <div className="text-xs text-white/60">
                        Choose whose images are available in the viewer.
                      </div>
                    </div>
                    <div className="max-h-[min(40vh,26rem)] space-y-3 overflow-y-auto pr-1">
                      {participantOptions.map(({ participantId, imageCount, participant }) => (
                        <div
                          key={participantId}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <ViewerAvatar participant={participant} className="h-9 w-9" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">
                                {participant?.name ?? "Unknown participant"}
                              </div>
                              <div className="text-xs text-white/55">
                                {imageCount} image{imageCount === 1 ? "" : "s"}
                              </div>
                            </div>
                          </div>
                          <Switch
                            checked={enabledParticipantIdSet.has(participantId)}
                            disabled={
                              enabledParticipantIds.length === 1 &&
                              enabledParticipantIdSet.has(participantId)
                            }
                            onCheckedChange={(checked) =>
                              handleParticipantToggle(participantId, checked)
                            }
                            aria-label={`Toggle images from ${participant?.name ?? "participant"}`}
                            className="bg-white/15 data-[state=checked]:bg-white"
                            thumbClassName="bg-white text-black data-[state=checked]:bg-black"
                          />
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>

                <div className="pointer-events-auto w-full rounded-3xl border border-white/10 bg-black/45 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] lg:backdrop-blur-xl">
                  <div className="flex items-start gap-3">
                    <ViewerAvatar participant={displayImage.sender} className="h-11 w-11" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {displayImage.sender?.name ?? "Unknown participant"}
                      </div>
                      <div className="text-xs text-white/65">
                        {formatViewerTimestamp(displayImage.message.timestamp)}
                      </div>
                    </div>
                  </div>
                  {displayImage.message.content ? (
                    <p className="mt-3 text-sm text-white/85" title={displayImage.message.content}>
                      {truncateCaption(displayImage.message.content)}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-4 w-full rounded-full border border-white/12 bg-white/10 px-4 text-white hover:bg-white/18 focus-visible:ring-white/70 focus-visible:ring-offset-transparent"
                    onClick={handleGoToMessage}
                  >
                    Go to message
                  </Button>
                </div>
              </div>
              )}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
