import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from "lucide-react"
import { format } from "date-fns"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Participant } from "@/types/conversation"
import type { Message } from "@/types/message"
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
import { cn } from "@/utils/cn"

const UI_HIDE_DELAY_MS = 2600
const MAX_CAPTION_LENGTH = 30

export interface ReaderImageEntry {
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
    return format(new Date(timestamp), "MMM d, yyyy · p")
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

const buildDownloadName = (image: ReaderImageEntry) => {
  const senderName = sanitizeFileSegment(image.sender?.name ?? "participant")
  const extension = inferImageExtension(image.message.imageUrl ?? "")
  return `chat-image-${senderName}-${image.message.id}.${extension}`
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
  const hideUiTimeoutRef = useRef<number | null>(null)
  const [isUiVisible, setIsUiVisible] = useState(true)

  const imagesById = useMemo(
    () => new Map(images.map((image) => [image.message.id, image])),
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
    const participantIndex = new Map(participants.map((participant, index) => [participant.id, index]))

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
    () =>
      images.filter((image) =>
        enabledParticipantIdSet.has(image.message.senderId),
      ),
    [enabledParticipantIdSet, images],
  )
  const currentFilteredIndex = filteredImages.findIndex(
    (image) => image.message.id === activeImageId,
  )
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
    scheduleUiHide()
  }, [scheduleUiHide])

  const findNearestFilteredImage = useCallback(
    (fromImageId: string) => {
      const originIndex = images.findIndex((image) => image.message.id === fromImageId)
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
      onClose()
    }
  }, [activeImage, clearHideUiTimeout, onClose, open, scheduleUiHide])

  useEffect(() => {
    if (!open) return

    const handleWindowBlur = () => scheduleUiHide()
    const handleWindowFocus = () => revealUi()

    window.addEventListener("blur", handleWindowBlur)
    window.addEventListener("focus", handleWindowFocus)

    return () => {
      window.removeEventListener("blur", handleWindowBlur)
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [open, revealUi, scheduleUiHide])

  useEffect(() => {
    if (!open || !activeImageId) return

    if (enabledParticipantIds.length === 0) {
      return
    }

    if (filteredImages.length === 0) {
      onClose()
      return
    }

    const isCurrentImageVisible = filteredImages.some((image) => image.message.id === activeImageId)
    if (isCurrentImageVisible) return

    const fallbackImage = findNearestFilteredImage(activeImageId)
    if (fallbackImage) {
      onActiveImageChange(fallbackImage.message.id)
      return
    }

    onClose()
  }, [
    activeImageId,
    enabledParticipantIds.length,
    filteredImages,
    findNearestFilteredImage,
    onActiveImageChange,
    onClose,
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

    if (!checked && enabledParticipantIds.includes(participantId) && enabledParticipantIds.length === 1) {
      onClose()
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
    if (!displayImage?.message.imageUrl) return
    revealUi()
    window.open(displayImage.message.imageUrl, "_blank", "noopener,noreferrer")
  }

  const handleDownloadImage = () => {
    if (!displayImage?.message.imageUrl) return
    revealUi()

    const link = document.createElement("a")
    link.href = displayImage.message.imageUrl
    link.download = buildDownloadName(displayImage)
    link.rel = "noopener"
    link.click()
  }

  const handleGoToMessage = () => {
    if (!displayImage) return
    onGoToMessage(displayImage.message.id)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/84 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          className="fixed inset-0 z-[71] h-[100dvh] w-screen outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
            revealUi()
          }}
          onPointerMove={revealUi}
          onPointerDown={revealUi}
          onPointerLeave={scheduleUiHide}
          onFocusCapture={revealUi}
          onBlurCapture={scheduleUiHide}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && previousImage) {
              event.preventDefault()
              revealUi()
              onActiveImageChange(previousImage.message.id)
              return
            }

            if (event.key === "ArrowRight" && nextImage) {
              event.preventDefault()
              revealUi()
              onActiveImageChange(nextImage.message.id)
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
            <div className="relative h-full w-full overflow-hidden bg-transparent text-white">
              <div className="absolute inset-0 lg:right-[22rem]">
                <div className="absolute inset-0 flex items-center justify-center px-6 pb-28 pt-8 sm:px-10 sm:pb-32 sm:pt-10 lg:px-14 lg:pb-16 lg:pt-14">
                  <img
                    src={displayImage.message.imageUrl}
                    alt={displayImage.message.content || "Chat image"}
                    className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
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
                      aria-label="View previous image"
                      disabled={!previousImage}
                      onClick={() => previousImage && onActiveImageChange(previousImage.message.id)}
                      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/40 text-white shadow-lg transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 sm:pr-5 lg:pr-7">
                    <button
                      type="button"
                      aria-label="View next image"
                      disabled={!nextImage}
                      onClick={() => nextImage && onActiveImageChange(nextImage.message.id)}
                      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/40 text-white shadow-lg transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 sm:bottom-5 sm:left-5 sm:right-5 lg:right-8">
                    <div className="pointer-events-auto flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/45 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <ViewerAvatar participant={displayImage.sender} className="h-11 w-11" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">
                                {displayImage.sender?.name ?? "Unknown participant"}
                              </div>
                              <div className="text-xs text-white/65">
                                {formatViewerTimestamp(displayImage.message.timestamp)}
                              </div>
                            </div>
                          </div>
                          {displayImage.message.content ? (
                            <p
                              className="mt-3 text-sm text-white/85"
                              title={displayImage.message.content}
                            >
                              {truncateCaption(displayImage.message.content)}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="shrink-0 rounded-full border border-white/12 bg-white/10 px-4 text-white hover:bg-white/18 focus-visible:ring-white/70 focus-visible:ring-offset-transparent"
                          onClick={handleGoToMessage}
                        >
                          Go to message
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-4 transition-opacity duration-200 sm:right-5 sm:top-5 lg:right-6 lg:top-6",
                  isUiVisible ? "opacity-100" : "opacity-0",
                )}
              >
                <div className="pointer-events-auto flex flex-col gap-2">
                  <button
                    type="button"
                    aria-label="Close image viewer"
                    onClick={onClose}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white shadow-lg transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Open image in a new tab"
                    onClick={handleOpenImageInNewTab}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white shadow-lg transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <ExternalLink className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Download image"
                    onClick={handleDownloadImage}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white shadow-lg transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </div>

                <aside className="pointer-events-auto w-[min(18rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-black/45 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-white">Visible participants</div>
                    <div className="text-xs text-white/60">
                      Choose whose images are available in the viewer.
                    </div>
                  </div>
                  <div className="max-h-[min(45vh,26rem)] space-y-3 overflow-y-auto pr-1">
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
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
