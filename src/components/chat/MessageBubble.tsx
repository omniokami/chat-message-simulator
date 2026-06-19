import { useEffect, useRef, useState } from "react"
import { Check, CheckCheck, Expand, EyeOff } from "lucide-react"
import type { Message, MessageImage } from "@/types/message"
import type { Participant } from "@/types/conversation"
import type { LayoutConfig } from "@/types/layout"
import { normalizeSpoilerBlur } from "@/constants/spoiler"
import { cn } from "@/utils/cn"
import { formatTimestamp } from "@/utils/helpers"
import { getMessageImages } from "@/utils/messageImages"
import { VerifiedBadge } from "@/components/ui/verified-badge"
import { AvatarImage } from "@/components/ui/avatar-image"

interface MessageBubbleProps {
  message: Message
  sender: Participant | undefined
  isOwn: boolean
  layout: LayoutConfig
  isGroup: boolean
  spoilerBlur: number
  showAvatar?: boolean
  onImageActivate?: (message: Message, imageId?: string) => void
}

const ErrorStatusIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 2.75C17.11 2.75 21.25 6.89 21.25 12S17.11 21.25 12 21.25 2.75 17.11 2.75 12 6.89 2.75 12 2.75Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12.2 7.85V12.55" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12.2" cy="16.15" r="1.05" fill="currentColor" />
  </svg>
)

const statusIcon = (status: Message["status"], className?: string) => {
  const iconClass = cn("h-3.5 w-3.5", className)
  if (status === "read") return <CheckCheck className={iconClass} />
  if (status === "delivered") return <CheckCheck className={cn(iconClass, "opacity-70")} />
  if (status === "sent") return <Check className={cn(iconClass, "opacity-70")} />
  return null
}

const shouldUseObjectUrl = (url?: string): url is string => Boolean(url?.startsWith("data:image/"))
const MAX_MESSAGE_IMAGE_WIDTH = 240

const dataUrlToBlob = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex === -1) return null

  const metadata = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  const mimeType = /^data:([^;,]+)/i.exec(metadata)?.[1] ?? "application/octet-stream"

  try {
    if (metadata.includes(";base64")) {
      const binary = window.atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return new Blob([bytes], { type: mimeType })
    }

    return new Blob([decodeURIComponent(payload)], { type: mimeType })
  } catch (error) {
    console.error("Failed to convert image data URL", error)
    return null
  }
}

const getImageRevealKey = (image: MessageImage) =>
  `${image.id}:${image.url}:${image.isSpoiler ? "spoiler" : "plain"}`

const getMultiImageGridClass = (imageCount: number) =>
  imageCount === 2
    ? "grid-cols-2"
    : imageCount === 3 || imageCount === 4
      ? "grid-cols-2 grid-rows-2"
      : "grid-cols-6 grid-rows-4"

const getMultiImageTileClass = (index: number, imageCount: number) => {
  if (imageCount === 3 && index === 0) return "row-span-2"
  if (imageCount === 5) {
    if (index < 2) return "col-span-3 row-span-2"
    return "col-span-2 row-span-2"
  }
  return ""
}

const getMultiImageGridStyle = (imageCount: number): React.CSSProperties => ({
  width: MAX_MESSAGE_IMAGE_WIDTH,
  height: imageCount === 2 ? 156 : imageCount === 5 ? 240 : 220,
})

interface MessageImageTileProps {
  message: Message
  image: MessageImage
  imageKey: string
  imageRadius: string
  className?: string
  imageClassName?: string
  imageWidth?: number
  imageHeight?: number
  compactSpoilerBadge?: boolean
  spoilerBlur: number
  isSpoilerRevealed: boolean
  onSpoilerRevealChange: (imageKey: string, isRevealed: boolean) => void
  onActivate?: () => void
}

const MessageImageTile = ({
  message,
  image,
  imageKey,
  imageRadius,
  className,
  imageClassName,
  imageWidth,
  imageHeight,
  compactSpoilerBadge,
  spoilerBlur,
  isSpoilerRevealed,
  onSpoilerRevealChange,
  onActivate,
}: MessageImageTileProps) => {
  const showSpoiler = Boolean(image.url && image.isSpoiler)
  const shouldExportSpoiler = showSpoiler && Boolean(image.exportSpoiler)
  const isSpoilerCovered = showSpoiler && !isSpoilerRevealed
  const canActivateImage = Boolean(image.url && !isSpoilerCovered && onActivate)
  const spoilerImageStyle: React.CSSProperties | undefined =
    showSpoiler
      ? {
          filter:
            isSpoilerCovered && spoilerBlur > 0 ? `blur(${spoilerBlur}px)` : "blur(0px)",
          transition: "filter 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }
      : undefined
  const imageRef = useRef<HTMLImageElement | null>(null)
  const imageObjectUrlRef = useRef<{
    source?: string
    url?: string
  }>({})

  const prepareImageObjectUrl = (preferSync = false) => {
    const source = image.url
    if (!shouldUseObjectUrl(source)) return

    const prepared = imageObjectUrlRef.current
    if (prepared.source === source) {
      if (prepared.url && imageRef.current && imageRef.current.src !== prepared.url) {
        imageRef.current.src = prepared.url
      }
      return
    }

    if (prepared.url) {
      URL.revokeObjectURL(prepared.url)
    }
    imageObjectUrlRef.current = { source }

    if (preferSync) {
      const blob = dataUrlToBlob(source)
      if (blob) {
        const objectUrl = URL.createObjectURL(blob)
        imageObjectUrlRef.current = { source, url: objectUrl }
        if (imageRef.current && image.url === source) {
          imageRef.current.src = objectUrl
        }
        return
      }
    }

    fetch(source)
      .then((response) => response.blob())
      .then((blob) => {
        if (imageObjectUrlRef.current.source !== source) return
        const objectUrl = URL.createObjectURL(blob)
        imageObjectUrlRef.current = { source, url: objectUrl }
        if (imageRef.current && image.url === source) {
          imageRef.current.src = objectUrl
        }
      })
      .catch((error) => {
        console.error("Failed to prepare image object URL", error)
        if (imageObjectUrlRef.current.source === source) {
          imageObjectUrlRef.current = {}
        }
      })
  }

  useEffect(() => {
    return () => {
      const prepared = imageObjectUrlRef.current
      if (prepared.url) {
        URL.revokeObjectURL(prepared.url)
      }
      imageObjectUrlRef.current = {}
    }
  }, [image.url])

  return (
    <div
      className={cn(
        "group relative overflow-hidden",
        (isSpoilerCovered || canActivateImage) && "cursor-pointer",
        imageRadius,
        className,
      )}
      data-image-spoiler={showSpoiler ? "true" : undefined}
      data-export-spoiler={showSpoiler ? String(shouldExportSpoiler) : undefined}
      data-spoiler-blur={showSpoiler ? spoilerBlur : undefined}
      data-preview-message-action={isSpoilerCovered || canActivateImage ? "true" : undefined}
      onClick={() => {
        if (isSpoilerCovered) {
          onSpoilerRevealChange(imageKey, true)
          return
        }

        if (canActivateImage) {
          onActivate?.()
        }
      }}
      onPointerDown={(event) => {
        if (event.button === 2) {
          prepareImageObjectUrl(true)
        }
      }}
      onContextMenu={() => prepareImageObjectUrl(true)}
      onKeyDown={
        isSpoilerCovered || canActivateImage
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()

              if (isSpoilerCovered) {
                onSpoilerRevealChange(imageKey, true)
                return
              }

              onActivate?.()
            }
          : undefined
      }
      role={isSpoilerCovered || canActivateImage ? "button" : undefined}
      tabIndex={isSpoilerCovered || canActivateImage ? 0 : undefined}
      aria-label={
        isSpoilerCovered ? "Reveal spoiler image" : canActivateImage ? "Open image viewer" : undefined
      }
    >
      <img
        ref={imageRef}
        src={image.url}
        width={imageWidth}
        height={imageHeight}
        alt={message.content || "Uploaded message"}
        data-spoiler-image={showSpoiler ? "true" : undefined}
        style={spoilerImageStyle}
        className={cn("block", imageClassName)}
      />
      {showSpoiler ? (
        <div
          aria-hidden="true"
          data-spoiler-cover-overlay="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/25 text-white/80 transition-opacity duration-200 ease-out",
            isSpoilerCovered ? "opacity-100" : "opacity-0",
          )}
        >
          <span
            className={cn(
              "flex max-h-[calc(100%-0.5rem)] max-w-[calc(100%-0.5rem)] flex-col items-center justify-center overflow-hidden rounded-full bg-black/35 transition-all duration-200 ease-out",
              compactSpoilerBadge ? "gap-0.5 px-2 py-1.5" : "gap-1 px-3 py-2.5",
              isSpoilerCovered ? "scale-100 opacity-100" : "scale-95 opacity-0",
            )}
          >
            <EyeOff
              className={cn(compactSpoilerBadge ? "h-4 w-4" : "h-6 w-6", "opacity-75")}
              strokeWidth={1.55}
            />
            <span
              className={cn(
                "max-w-full truncate uppercase opacity-75",
                compactSpoilerBadge
                  ? "text-[0.48rem] font-medium tracking-[0.08em]"
                  : "text-[0.58rem] font-medium tracking-[0.14em]",
              )}
            >
              spoiler
            </span>
          </span>
        </div>
      ) : null}
      {showSpoiler && isSpoilerCovered ? (
        <div
          aria-hidden="true"
          data-export-spoiler-corner="true"
          className="pointer-events-none absolute right-2 top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/80 shadow-sm"
        >
          <EyeOff className="h-4 w-4" />
        </div>
      ) : null}
      {showSpoiler ? (
        <button
          type="button"
          aria-label="Hide spoiler image"
          data-spoiler-reveal-control="true"
          aria-hidden={isSpoilerCovered}
          tabIndex={isSpoilerCovered ? -1 : undefined}
          className={cn(
            "absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/80 shadow-sm transition-all duration-200 ease-out hover:bg-black/60",
            isSpoilerCovered ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation()
            onSpoilerRevealChange(imageKey, false)
          }}
        >
          <EyeOff className="h-4 w-4" />
        </button>
      ) : null}
      {canActivateImage ? (
        <div
          aria-hidden="true"
          className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/80 shadow-sm transition-all duration-200 ease-out opacity-0 scale-95 hover:bg-black/60 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100"
        >
          <Expand className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  )
}

export const MessageBubble = ({
  message,
  sender,
  isOwn,
  layout,
  isGroup,
  spoilerBlur,
  showAvatar,
  onImageActivate,
}: MessageBubbleProps) => {
  const isWhatsApp = layout.id === "whatsapp"
  const isIMessage = layout.id === "imessage"
  const isSnapchat = layout.id === "snapchat"
  const isMessenger = layout.id === "messenger"
  const isInstagram = layout.id === "instagram"
  const isTinder = layout.id === "tinder"
  const isError = message.status === "error"
  const showWhatsAppError = isWhatsApp && isOwn && isError
  const showIMessageError = isIMessage && isOwn && isError
  const showMessengerError = isMessenger && isOwn && isError
  const showInstagramError = isInstagram && isOwn && isError
  const showSnapchatError = isSnapchat && isOwn && isError
  const showTinderError = isTinder && isOwn && isError
  const messageImages = getMessageImages(message)
  const imageStateKey = messageImages.map(getImageRevealKey).join("|")
  const [revealedImageKeys, setRevealedImageKeys] = useState<string[]>([])
  const resolvedSpoilerBlur = normalizeSpoilerBlur(spoilerBlur)
  const setImageSpoilerRevealed = (imageKey: string, isRevealed: boolean) => {
    setRevealedImageKeys((current) => {
      const nextSet = new Set(current)
      if (isRevealed) {
        nextSet.add(imageKey)
      } else {
        nextSet.delete(imageKey)
      }
      return Array.from(nextSet)
    })
  }

  useEffect(() => {
    setRevealedImageKeys([])
  }, [imageStateKey, message.id])

  const primaryImage = messageImages[0]
  const hasImageDimensions = Boolean(
    primaryImage?.width && primaryImage.width > 0 && primaryImage?.height && primaryImage.height > 0,
  )
  const imageWidth = hasImageDimensions ? primaryImage?.width : undefined
  const imageHeight = hasImageDimensions ? primaryImage?.height : undefined
  const showBubbleSideError = showInstagramError || showIMessageError
  const showMessengerAvatar = isMessenger && !isOwn && Boolean(showAvatar)
  const showInstagramAvatar = isInstagram && !isOwn && Boolean(showAvatar)
  const avatarFallback = (sender?.name || "??").slice(0, 2).toUpperCase()
  const showSender = isWhatsApp
    ? isGroup
    : isSnapchat
      ? true
      : isMessenger
        ? isGroup
        : isInstagram
          ? isGroup
          : layout.showAvatars
  const verifiedBadge = sender?.isVerified ? (
    <VerifiedBadge className="h-3.5 w-3.5" variant={isWhatsApp ? "whatsapp" : "default"} />
  ) : null
  const bubbleRadius =
    isWhatsApp
      ? "rounded-[16px]"
      : isIMessage
        ? "rounded-[18px]"
        : isSnapchat
          ? "rounded-none"
          : isMessenger
            ? "rounded-[20px]"
            : isInstagram
              ? "rounded-[20px]"
              : isTinder
                ? "rounded-[22px]"
                : layout.bubbleStyle === "sharp"
                  ? "rounded-md"
                  : layout.bubbleStyle === "minimal"
                    ? "rounded-lg"
                    : "rounded-2xl"
  const bubbleColor = isOwn ? "var(--bubble-sent)" : "var(--bubble-received)"
  const textColor = isOwn ? "var(--bubble-sent-text)" : "var(--bubble-received-text)"
  const snapBorderColor =
    isSnapchat && isOwn && isError
      ? "#ff3b6d"
      : isOwn
        ? "var(--bubble-sent)"
        : "var(--bubble-received)"
  const bubbleStyle: React.CSSProperties & Record<string, string> = {
    backgroundColor: bubbleColor,
    color: textColor,
  }

  if (isWhatsApp) {
    bubbleStyle["--bubble-color"] = bubbleColor
  }
  if (isInstagram && isOwn) {
    bubbleStyle.backgroundImage =
      "linear-gradient(135deg, #7c3aed 0%, #6366f1 55%, #3b82f6 100%)"
  }
  if (isSnapchat) {
    bubbleStyle.backgroundColor = "transparent"
    bubbleStyle.color = snapBorderColor
    bubbleStyle.borderLeftColor = snapBorderColor
    bubbleStyle.borderLeftStyle = "solid"
    bubbleStyle.borderLeftWidth = "3px"
  }
  if (isTinder) {
    if (isOwn) {
      bubbleStyle.backgroundImage = "linear-gradient(135deg, #fd5068 0%, #ff7a59 100%)"
    } else {
      bubbleStyle.border = "1px solid var(--chat-border)"
    }
  }

  const imageRadius = isWhatsApp
    ? "rounded-[12px]"
    : isIMessage
      ? "rounded-[16px]"
      : isSnapchat
        ? "rounded-none"
        : isMessenger
          ? "rounded-[16px]"
          : isInstagram
            ? "rounded-[16px]"
            : isTinder
              ? "rounded-[18px]"
              : "rounded-lg"

  const bubbleAlignment = isMessenger
    ? ""
    : isSnapchat
      ? "mr-auto"
      : isOwn
        ? "ml-auto"
        : "mr-auto"
  const bubbleAlignmentClass = showInstagramAvatar ? "" : bubbleAlignment
  const instagramIndentClass =
    isInstagram && !isOwn && !showInstagramAvatar ? "ml-8" : ""
  const messengerIndentClass =
    isMessenger && !isOwn && !showMessengerAvatar ? "ml-8" : ""
  const messengerAvatar = showMessengerAvatar ? (
    sender?.avatarUrl ? (
      <AvatarImage
        src={sender.avatarUrl}
        alt={sender?.name || "Avatar"}
        className="h-7 w-7"
      />
    ) : (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--chat-border)] text-[0.6rem] font-semibold text-[var(--chat-muted)]">
        {avatarFallback}
      </div>
    )
  ) : null
  const instagramAvatar = showInstagramAvatar ? (
    sender?.avatarUrl ? (
      <AvatarImage
        src={sender.avatarUrl}
        alt={sender?.name || "Avatar"}
        className="h-6 w-6"
        borderClassName="border border-[var(--chat-border)]"
      />
    ) : (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-border)] text-[0.55rem] font-semibold text-[var(--chat-muted)]">
        {avatarFallback}
      </div>
    )
  ) : null
  const bubbleBody = (
    <div
      className={cn(
        "text-sm shadow-sm",
        message.type === "image" ? "p-1" : "px-3 py-2",
        bubbleRadius,
        !showBubbleSideError && bubbleAlignmentClass,
        instagramIndentClass,
        messengerIndentClass,
        isWhatsApp
          ? "whatsapp-bubble relative max-w-[80%] px-3 py-1.5 text-[0.94rem] leading-[1.3] shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
          : isIMessage
            ? "max-w-[76%] px-3 py-2 text-[0.95rem] leading-[1.35]"
            : isSnapchat
              ? "max-w-[82%] px-3 py-1 text-[0.95rem] leading-[1.35] shadow-none"
              : isMessenger
                ? "max-w-[78%] px-3 py-2 text-[0.95rem] leading-[1.35] shadow-none"
                : isInstagram
                  ? "max-w-[78%] px-3 py-2 text-[0.95rem] leading-[1.35] shadow-none"
                  : isTinder
                    ? "max-w-[72%] px-4 py-2 text-[0.95rem] leading-[1.35] shadow-none"
                    : "max-w-[78%]",
        message.type === "image" && "p-1",
        isWhatsApp && (isOwn ? "whatsapp-bubble--own" : "whatsapp-bubble--other"),
      )}
      style={bubbleStyle}
    >
      {message.type === "image" ? (
        <div className="space-y-2">
          {messageImages.length ? (
            messageImages.length === 1 && primaryImage ? (
              <MessageImageTile
                key={primaryImage.id}
                message={message}
                image={primaryImage}
                imageKey={getImageRevealKey(primaryImage)}
                imageRadius={imageRadius}
                className="w-full max-w-[240px] border border-white/20"
                imageClassName="max-h-64 w-full max-w-[240px] object-cover"
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                spoilerBlur={resolvedSpoilerBlur}
                isSpoilerRevealed={revealedImageKeys.includes(getImageRevealKey(primaryImage))}
                onSpoilerRevealChange={setImageSpoilerRevealed}
                onActivate={() => onImageActivate?.(message, primaryImage.id)}
              />
            ) : (
              <div
                className={cn(
                  "grid max-w-[240px] gap-1 overflow-hidden border border-white/20 bg-white/10",
                  imageRadius,
                  getMultiImageGridClass(messageImages.length),
                )}
                style={getMultiImageGridStyle(messageImages.length)}
              >
                {messageImages.map((image, index) => {
                  const imageKey = getImageRevealKey(image)
                  return (
                    <MessageImageTile
                      key={image.id}
                      message={message}
                      image={image}
                      imageKey={imageKey}
                      imageRadius="rounded-none"
                      className={cn(
                        "min-h-0 min-w-0 bg-white/10",
                        getMultiImageTileClass(index, messageImages.length),
                      )}
                      imageClassName="h-full w-full object-cover"
                      compactSpoilerBadge
                      spoilerBlur={resolvedSpoilerBlur}
                      isSpoilerRevealed={revealedImageKeys.includes(imageKey)}
                      onSpoilerRevealChange={setImageSpoilerRevealed}
                      onActivate={() => onImageActivate?.(message, image.id)}
                    />
                  )
                })}
              </div>
            )
          ) : (
            <div className="h-24 w-40 rounded-lg border border-white/20 bg-white/10" />
          )}
          {message.content ? (
            <p
              className={cn(
                "mt-1 max-w-[240px] whitespace-pre-wrap break-words px-2 pb-1 text-[0.8rem] leading-snug",
                isWhatsApp && "text-[0.75rem]",
                isIMessage && "text-[0.82rem]",
                isSnapchat && "text-[0.75rem] uppercase tracking-wide",
                isMessenger && "text-[0.8rem]",
                isInstagram && "text-[0.8rem]",
                isTinder && "text-[0.8rem]",
              )}
            >
              {message.content}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
      )}
      {isWhatsApp ? (
        <div
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[0.6rem] leading-none",
            message.type === "image" && "pr-2"
          )}
          style={{ color: "var(--chat-muted)" }}
        >
          <span>{formatTimestamp(message.timestamp)}</span>
          {isOwn ? (
            <span
              className={cn(
                "flex items-center gap-1",
                message.status === "read" && "text-[#53bdeb]",
                showWhatsAppError && "text-[#f15c6d]",
              )}
            >
              {showWhatsAppError ? (
                <ErrorStatusIcon className="h-[0.8rem] w-[0.8rem]" />
              ) : (
                statusIcon(message.status, "h-3 w-3")
              )}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  const bubbleContent = showInstagramError ? (
    <div className="ml-auto flex flex-col gap-1">
      <div className="flex items-center justify-end gap-2">
        {bubbleBody}
        <ErrorStatusIcon className="h-[1.55rem] w-[1.55rem] shrink-0 text-[#ed4956]" />
      </div>
      <span className="pr-6 text-right text-[0.72rem] font-medium text-[#ed4956]">
        Not delivered.
      </span>
    </div>
  ) : showIMessageError ? (
    <div className="ml-auto flex flex-col gap-1">
      <div className="flex items-center justify-end gap-2">
        {bubbleBody}
        <ErrorStatusIcon className="h-[1.35rem] w-[1.35rem] shrink-0 text-[#ff3b30]" />
      </div>
      <span className="pr-5 text-right text-[0.72rem] font-medium text-[#ff3b30]">
        Not Delivered
      </span>
    </div>
  ) : (
    bubbleBody
  )

  const errorStatusNote = showMessengerError ? (
    <div className="flex items-center justify-end gap-1.5 pr-1 text-[0.72rem] font-medium text-[#e04b59]">
      <ErrorStatusIcon className="h-[0.95rem] w-[0.95rem] shrink-0" />
      <span>Couldn&apos;t send</span>
    </div>
  ) : showSnapchatError ? (
    <div className="pt-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#ff3b6d]">
      Failed to send
    </div>
  ) : showTinderError ? (
    <div className="flex items-center justify-end">
      <div className="flex items-center gap-1.5 rounded-full border border-[#e11d48]/20 bg-[#e11d48]/8 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#e11d48]">
        <ErrorStatusIcon className="h-[0.9rem] w-[0.9rem] shrink-0" />
        <span>Not sent</span>
      </div>
    </div>
  ) : null

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1",
        isSnapchat ? "items-start" : isOwn ? "items-end" : "items-start",
      )}
    >
      {showSender && (isSnapchat || (!isOwn && sender)) ? (
        <div
          className={cn(
            "flex items-center gap-2 text-xs",
            isWhatsApp
              ? "font-medium text-[0.7rem]"
              : isSnapchat
                ? "font-semibold text-[0.7rem] uppercase tracking-wide"
                : isMessenger
                  ? "font-semibold text-[0.7rem]"
                  : isInstagram
                    ? "font-semibold text-[0.7rem]"
                : "text-slate-200",
          )}
          style={
            isWhatsApp
              ? { color: sender?.color }
              : isSnapchat
                ? { color: snapBorderColor }
                : isMessenger
                  ? { color: "var(--chat-muted)" }
                  : isInstagram
                    ? { color: "var(--chat-muted)" }
                    : undefined
          }
        >
          {!isWhatsApp && !isSnapchat ? (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: sender?.color ?? "transparent" }}
            />
          ) : null}
          <span>{isSnapchat ? (isOwn ? "You" : sender?.name ?? "Unknown") : sender?.name}</span>
          {verifiedBadge}
        </div>
      ) : null}
      {isMessenger ? (
        <div className={cn("flex w-full items-end gap-2", isOwn ? "justify-end" : "justify-start")}>
          {isOwn ? (
            <>
              {bubbleContent}
              {messengerAvatar}
            </>
          ) : (
            <>
              {messengerAvatar}
              {bubbleContent}
            </>
          )}
        </div>
      ) : showInstagramAvatar ? (
        <div className="flex w-full items-end gap-2">
          {instagramAvatar}
          {bubbleContent}
        </div>
      ) : (
        bubbleContent
      )}
      {errorStatusNote}
      {!isWhatsApp && !isIMessage && !isSnapchat && !isMessenger && !isInstagram && !isTinder ? (
        <div
          className={cn(
            "flex items-center gap-2 text-[0.7rem]",
            isOwn ? "text-right" : "text-left",
            isIMessage && "text-[0.6rem]",
          )}
          style={{ color: "var(--chat-muted)" }}
        >
          <span>{formatTimestamp(message.timestamp)}</span>
          {isOwn ? <span className="flex items-center gap-1">{statusIcon(message.status)}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
