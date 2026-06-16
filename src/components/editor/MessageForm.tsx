import { useEffect, useId, useRef, useState } from "react"
import type { Message } from "@/types/message"
import type { Participant } from "@/types/conversation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/utils/cn"
import { readFileAsDataUrl } from "@/utils/helpers"
import { Clipboard, EyeOff, ImagePlus, X } from "lucide-react"

interface MessageFormProps {
  participants: Participant[]
  initial?: Message | null
  defaultSenderId?: string
  compact?: boolean
  resetOnSubmit?: boolean
  submitLabel?: string
  advancedOpen?: boolean
  onToggleAdvanced?: () => void
  onSubmit: (payload: {
    senderId: string
    content: string
    imageUrl?: string
    imageWidth?: number
    imageHeight?: number
    timestamp: string
    type: Message["type"]
    status: Message["status"]
    isSpoiler?: boolean
  }) => void
  onCancel?: () => void
}

const resolveSenderId = (preferredId: string | undefined, participants: Participant[]) => {
  if (preferredId && participants.some((participant) => participant.id === preferredId)) {
    return preferredId
  }
  return participants[0]?.id ?? ""
}

const toInputValue = (iso: string) => {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const fromInputValue = (value: string) => new Date(value).toISOString()

const readImageDimensions = (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!width || !height) {
        reject(new Error("Image dimensions unavailable."))
        return
      }
      resolve({ width, height })
    }
    image.onerror = () => reject(new Error("Image dimensions unavailable."))
    image.src = src
  })

export const MessageForm = ({
  participants,
  initial,
  defaultSenderId,
  compact,
  resetOnSubmit,
  submitLabel,
  advancedOpen,
  onToggleAdvanced,
  onSubmit,
  onCancel,
}: MessageFormProps) => {
  const [content, setContent] = useState(initial?.content ?? "")
  const [senderId, setSenderId] = useState(
    initial?.senderId ?? resolveSenderId(defaultSenderId, participants),
  )
  const [timestamp, setTimestamp] = useState(
    initial?.timestamp ? toInputValue(initial.timestamp) : toInputValue(new Date().toISOString()),
  )
  const [type, setType] = useState<Message["type"]>(initial?.type ?? "text")
  const [status, setStatus] = useState<Message["status"]>(initial?.status ?? "sent")
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "")
  const [imageDimensions, setImageDimensions] = useState<{
    width?: number
    height?: number
  }>({
    width: initial?.imageWidth,
    height: initial?.imageHeight,
  })
  const [isSpoiler, setIsSpoiler] = useState(Boolean(initial?.imageUrl && initial?.isSpoiler))
  const [imageError, setImageError] = useState<string | null>(null)
  const showAdvanced = advancedOpen ?? true
  const showAdvancedToggle = typeof advancedOpen === "boolean" && typeof onToggleAdvanced === "function"
  const spoilerSwitchId = useId()
  const previousDefaultRef = useRef(defaultSenderId)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (initial) return
    const previousDefault = previousDefaultRef.current
    previousDefaultRef.current = defaultSenderId
    const nextDefault = resolveSenderId(defaultSenderId, participants)
    setSenderId((current) => {
      const isValid = participants.some((participant) => participant.id === current)
      if (!current || !isValid || current === previousDefault) {
        return nextDefault
      }
      return current
    })
  }, [defaultSenderId, initial, participants])

  const insertAtCursor = (text: string) => {
    const element = textareaRef.current
    if (!element) {
      setContent((current) => (current ? `${current}\n${text}` : text))
      return
    }
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? element.value.length
    setContent((current) => current.slice(0, start) + text + current.slice(end))
    requestAnimationFrame(() => {
      element.focus()
      const nextPos = start + text.length
      element.setSelectionRange(nextPos, nextPos)
    })
  }

  const handlePaste = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          insertAtCursor(text)
          return
        }
      }
    } catch (error) {
      console.error("Paste failed", error)
    }
    const fallback = window.prompt("Paste message")
    if (fallback) insertAtCursor(fallback)
  }

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setImageError("Only image files are allowed.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be smaller than 5MB.")
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const dimensions = await readImageDimensions(dataUrl).catch(() => ({}))
      setImageUrl(dataUrl)
      setImageDimensions(dimensions)
      setImageError(null)
    } catch (error) {
      console.error("Failed to read image file", error)
      setImageError("Could not read the selected image.")
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (type === "image" && !imageUrl) {
          setImageError("Please upload an image for this message.")
          return
        }
        onSubmit({
          senderId,
          content,
          imageUrl: type === "image" ? imageUrl : undefined,
          imageWidth: type === "image" && imageUrl ? imageDimensions.width : undefined,
          imageHeight: type === "image" && imageUrl ? imageDimensions.height : undefined,
          isSpoiler: type === "image" && imageUrl ? isSpoiler : undefined,
          timestamp: fromInputValue(timestamp),
          type,
          status,
        })
        if (resetOnSubmit && !initial) {
          setContent("")
          setTimestamp(toInputValue(new Date().toISOString()))
          setType("text")
          setStatus("sent")
          setSenderId(resolveSenderId(defaultSenderId, participants))
          setImageUrl("")
          setImageDimensions({})
          setIsSpoiler(false)
          setImageError(null)
        }
      }}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>{type === "image" ? "Caption" : "Message"}</Label>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={handlePaste}>
              <Clipboard className="h-3.5 w-3.5" />
              Paste
            </Button>
            {content ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setContent("")}>
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={type === "image" ? "Add a caption (optional)..." : "Write the message..."}
          className={cn(compact && "min-h-[72px]")}
        />
      </div>

      {type === "image" ? (
        <div className="space-y-2">
          <Label>Image upload</Label>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
            <div className="min-h-20 w-28 self-stretch overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
              {imageUrl ? (
                <img src={imageUrl} alt="Uploaded preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
                  No image
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <ImagePlus className="h-4 w-4" />
                Upload image
              </Button>
              {imageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImageUrl("")
                    setImageDimensions({})
                    setIsSpoiler(false)
                  }}
                >
                  Remove
                </Button>
              ) : null}
              <div className={cn("flex items-center gap-2", !imageUrl && "opacity-60")}>
                <Label
                  htmlFor={spoilerSwitchId}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]",
                    imageUrl ? "cursor-pointer" : "cursor-not-allowed",
                  )}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Spoiler
                </Label>
                <Switch
                  id={spoilerSwitchId}
                  checked={Boolean(imageUrl && isSpoiler)}
                  onCheckedChange={(value) => {
                    if (!imageUrl) return
                    setIsSpoiler(value)
                  }}
                  disabled={!imageUrl}
                  className={cn(!imageUrl && "cursor-not-allowed")}
                />
              </div>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">JPG, PNG, or WEBP up to 5MB.</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                await handleImageUpload(file)
                event.target.value = ""
              }}
            />
          </div>
          {imageError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {imageError}
            </div>
          ) : null}
        </div>
      ) : null}

      {showAdvanced ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Sender</Label>
              <Select value={senderId} onValueChange={setSenderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sender" />
                </SelectTrigger>
                <SelectContent>
                  {participants.map((participant) => (
                    <SelectItem key={participant.id} value={participant.id}>
                      {participant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timestamp</Label>
              <Input
                type="datetime-local"
                value={timestamp}
                onChange={(event) => setTimestamp(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  const nextType = value as Message["type"]
                  setType(nextType)
                  if (nextType !== "image") {
                    setImageError(null)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as Message["status"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={type === "image" && !imageUrl}
          onClick={() => {
            if (type === "image" && !imageUrl) {
              setImageError("Please upload an image for this message.")
            }
          }}
        >
          {submitLabel ?? (initial ? "Save changes" : "Add message")}
        </Button>
        {initial ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {showAdvancedToggle ? (
          <Button type="button" variant="ghost" onClick={onToggleAdvanced}>
            {advancedOpen ? "Hide advanced" : "Advanced"}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
