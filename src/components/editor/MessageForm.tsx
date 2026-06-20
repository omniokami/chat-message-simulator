import { useEffect, useId, useRef, useState, type MutableRefObject } from "react"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS, type Transform } from "@dnd-kit/utilities"
import type { Message, MessageImage } from "@/types/message"
import type { Participant } from "@/types/conversation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/utils/cn"
import { generateId, readFileAsDataUrl } from "@/utils/helpers"
import { getMessageImages, MAX_MESSAGE_IMAGES } from "@/utils/messageImages"
import { Clipboard, EyeOff, GripVertical, ImagePlus, X } from "lucide-react"

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
    images?: MessageImage[]
    imageUrl?: string
    imageWidth?: number
    imageHeight?: number
    timestamp: string
    type: Message["type"]
    status: Message["status"]
    isSpoiler?: boolean
    exportSpoiler?: boolean
  }) => void
  onCancel?: () => void
}

interface ImageUploadBlock {
  blockId: string
  imageId: string
  url: string
  width?: number
  height?: number
  isSpoiler: boolean
  exportSpoiler: boolean
}

interface SortableImageUploadItemProps {
  upload: ImageUploadBlock
  index: number
  uploadCount: number
  imageUploadId: string
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>
  onImageUpload: (blockId: string, file: File) => Promise<void>
  onRemove: (blockId: string) => void
  onUploadMore: () => void
  onSpoilerChange: (blockId: string, value: boolean) => void
  onExportSpoilerChange: (blockId: string, value: boolean) => void
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

const createImageUploadBlock = (image?: MessageImage): ImageUploadBlock => ({
  blockId: generateId(),
  imageId: image?.id ?? generateId(),
  url: image?.url ?? "",
  width: image?.width,
  height: image?.height,
  isSpoiler: Boolean(image?.url && image?.isSpoiler),
  exportSpoiler: Boolean(image?.url && image?.isSpoiler && image?.exportSpoiler),
})

const buildInitialImageUploads = (initial?: Message | null): ImageUploadBlock[] => {
  const images = initial ? getMessageImages(initial) : []
  if (!images.length) return [createImageUploadBlock()]
  return images.slice(0, MAX_MESSAGE_IMAGES).map(createImageUploadBlock)
}

const restrictToVerticalAxis = ({ transform }: { transform: Transform }) => ({
  ...transform,
  x: 0,
})

const SortableImageUploadItem = ({
  upload,
  index,
  uploadCount,
  imageUploadId,
  fileInputRefs,
  onImageUpload,
  onRemove,
  onUploadMore,
  onSpoilerChange,
  onExportSpoilerChange,
}: SortableImageUploadItemProps) => {
  const canReorder = uploadCount > 1
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: upload.blockId,
    disabled: !canReorder,
    animateLayoutChanges: () => false,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: "none",
  }
  const spoilerSwitchId = `${imageUploadId}-spoiler-${upload.blockId}`
  const exportSpoilerSwitchId = `${imageUploadId}-export-spoiler-${upload.blockId}`
  const showUploadMore =
    Boolean(upload.url) && index === uploadCount - 1 && uploadCount < MAX_MESSAGE_IMAGES

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div
        className={cn(
          "relative flex flex-wrap items-stretch gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-2 pl-[3.25rem] pr-3",
          isDragging && "ring-2 ring-cyan-400/25",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "absolute inset-y-0 left-0 h-full w-10 cursor-grab rounded-l-xl rounded-r-none border-r border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] active:cursor-grabbing",
            !canReorder && "cursor-not-allowed opacity-40",
          )}
          disabled={!canReorder}
          aria-label="Reorder image upload"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <div className="min-h-20 w-28 self-stretch overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
          {upload.url ? (
            <img
              src={upload.url}
              alt="Uploaded preview"
              className="h-full w-full object-cover"
            />
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
            onClick={() => fileInputRefs.current[upload.blockId]?.click()}
            className="gap-2"
          >
            <ImagePlus className="h-4 w-4" />
            Upload image
          </Button>
          {upload.url || uploadCount > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(upload.blockId)}
            >
              Remove
            </Button>
          ) : null}
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            JPG, PNG, or WEBP up to 5MB.
          </span>
          <div className="flex w-full flex-col gap-2 pt-1">
            <div className={cn("flex items-center gap-2", !upload.url && "opacity-60")}>
              <Switch
                id={spoilerSwitchId}
                checked={Boolean(upload.url && upload.isSpoiler)}
                onCheckedChange={(value) => onSpoilerChange(upload.blockId, value)}
                disabled={!upload.url}
                className={cn(!upload.url && "cursor-not-allowed")}
              />
              <Label
                htmlFor={spoilerSwitchId}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]",
                  upload.url ? "cursor-pointer" : "cursor-not-allowed",
                )}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Spoiler
              </Label>
            </div>
            <div
              className={cn(
                "flex items-center gap-2",
                (!upload.url || !upload.isSpoiler) && "opacity-60",
              )}
            >
              <Switch
                id={exportSpoilerSwitchId}
                checked={Boolean(upload.url && upload.isSpoiler && upload.exportSpoiler)}
                onCheckedChange={(value) => onExportSpoilerChange(upload.blockId, value)}
                disabled={!upload.url || !upload.isSpoiler}
                className={cn((!upload.url || !upload.isSpoiler) && "cursor-not-allowed")}
              />
              <Label
                htmlFor={exportSpoilerSwitchId}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]",
                  upload.url && upload.isSpoiler ? "cursor-pointer" : "cursor-not-allowed",
                )}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Export spoiler
              </Label>
            </div>
          </div>
        </div>
        <input
          ref={(element) => {
            fileInputRefs.current[upload.blockId] = element
          }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            await onImageUpload(upload.blockId, file)
            event.target.value = ""
          }}
        />
      </div>
      {showUploadMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onUploadMore}
          className="gap-2"
        >
          <ImagePlus className="h-4 w-4" />
          Upload more
        </Button>
      ) : null}
    </div>
  )
}

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
  const [imageUploads, setImageUploads] = useState<ImageUploadBlock[]>(() =>
    buildInitialImageUploads(initial),
  )
  const [imageError, setImageError] = useState<string | null>(null)
  const [pendingFileInputBlockId, setPendingFileInputBlockId] = useState<string | null>(null)
  const showAdvanced = advancedOpen ?? true
  const showAdvancedToggle = typeof advancedOpen === "boolean" && typeof onToggleAdvanced === "function"
  const imageUploadId = useId()
  const previousDefaultRef = useRef(defaultSenderId)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const uploadedImages = imageUploads.filter((upload) => Boolean(upload.url))
  const hasUploadedImages = uploadedImages.length > 0
  const imageUploadSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

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

  useEffect(() => {
    if (!pendingFileInputBlockId) return
    fileInputRefs.current[pendingFileInputBlockId]?.click()
    setPendingFileInputBlockId(null)
  }, [imageUploads, pendingFileInputBlockId])

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

  const handleImageUpload = async (blockId: string, file: File) => {
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
      const dimensions: { width?: number; height?: number } = await readImageDimensions(
        dataUrl,
      ).catch(() => ({}))
      setImageUploads((current) =>
        current.map((upload) =>
          upload.blockId === blockId
            ? {
                ...upload,
                url: dataUrl,
                width: dimensions.width,
                height: dimensions.height,
              }
            : upload,
        ),
      )
      setImageError(null)
    } catch (error) {
      console.error("Failed to read image file", error)
      setImageError("Could not read the selected image.")
    }
  }

  const handleRemoveImageUpload = (blockId: string) => {
    setImageUploads((current) => {
      if (current.length <= 1) {
        return [
          {
            ...current[0],
            url: "",
            width: undefined,
            height: undefined,
            isSpoiler: false,
            exportSpoiler: false,
          },
        ]
      }
      return current.filter((upload) => upload.blockId !== blockId)
    })
    setImageError(null)
  }

  const handleUploadMore = () => {
    if (imageUploads.length >= MAX_MESSAGE_IMAGES) return
    const nextBlock = createImageUploadBlock()
    setImageUploads((current) => [...current, nextBlock])
    setPendingFileInputBlockId(nextBlock.blockId)
  }

  const handleImageUploadDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return

    setImageUploads((current) => {
      const oldIndex = current.findIndex((upload) => upload.blockId === active.id)
      const newIndex = current.findIndex((upload) => upload.blockId === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  const handleSpoilerChange = (blockId: string, value: boolean) => {
    setImageUploads((current) =>
      current.map((entry) => {
        if (entry.blockId !== blockId || !entry.url) return entry
        return {
          ...entry,
          isSpoiler: value,
          exportSpoiler: value ? entry.exportSpoiler : false,
        }
      }),
    )
  }

  const handleExportSpoilerChange = (blockId: string, value: boolean) => {
    setImageUploads((current) =>
      current.map((entry) =>
        entry.blockId === blockId && entry.url && entry.isSpoiler
          ? { ...entry, exportSpoiler: value }
          : entry,
      ),
    )
  }

  const buildSubmittedImages = (): MessageImage[] =>
    imageUploads
      .filter((upload) => Boolean(upload.url))
      .slice(0, MAX_MESSAGE_IMAGES)
      .map((upload) => ({
        id: upload.imageId,
        url: upload.url,
        width: upload.width,
        height: upload.height,
        isSpoiler: upload.isSpoiler,
        exportSpoiler: upload.isSpoiler ? upload.exportSpoiler : undefined,
      }))

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const submittedImages = type === "image" ? buildSubmittedImages() : []
        const primaryImage = submittedImages[0]
        const submittedType: Message["type"] = type === "image" && !primaryImage ? "text" : type
        onSubmit({
          senderId,
          content,
          images: submittedType === "image" ? submittedImages : undefined,
          imageUrl: primaryImage?.url,
          imageWidth: primaryImage?.width,
          imageHeight: primaryImage?.height,
          isSpoiler: primaryImage?.isSpoiler,
          exportSpoiler: primaryImage?.isSpoiler ? primaryImage.exportSpoiler : undefined,
          timestamp: fromInputValue(timestamp),
          type: submittedType,
          status,
        })
        if (resetOnSubmit && !initial) {
          setContent("")
          setTimestamp(toInputValue(new Date().toISOString()))
          setType("text")
          setStatus("sent")
          setSenderId(resolveSenderId(defaultSenderId, participants))
          setImageUploads([createImageUploadBlock()])
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
          <div className="space-y-2">
            <DndContext
              sensors={imageUploadSensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleImageUploadDragEnd}
            >
              <SortableContext
                items={imageUploads.map((upload) => upload.blockId)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {imageUploads.map((upload, index) => (
                    <SortableImageUploadItem
                      key={upload.blockId}
                      upload={upload}
                      index={index}
                      uploadCount={imageUploads.length}
                      imageUploadId={imageUploadId}
                      fileInputRefs={fileInputRefs}
                      onImageUpload={handleImageUpload}
                      onRemove={handleRemoveImageUpload}
                      onUploadMore={handleUploadMore}
                      onSpoilerChange={handleSpoilerChange}
                      onExportSpoilerChange={handleExportSpoilerChange}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {imageUploads.length >= MAX_MESSAGE_IMAGES && hasUploadedImages ? (
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Maximum {MAX_MESSAGE_IMAGES} images per image message.
              </div>
            ) : null}
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
        <Button type="submit">
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
