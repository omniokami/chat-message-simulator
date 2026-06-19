import { useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS, type Transform } from "@dnd-kit/utilities"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ClockArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Info,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import type { Participant } from "@/types/conversation"
import type { Message } from "@/types/message"
import { useConversationStore } from "@/store/conversationStore"
import { MessageForm } from "@/components/editor/MessageForm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/utils/cn"
import { formatTimestamp, generateId } from "@/utils/helpers"

const toDateTimeInputValue = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const DirectionalCopyIcon = ({ direction }: { direction: "up" | "down" }) => (
  <span className="relative h-4 w-4">
    <Copy className="h-4 w-4" />
    {direction === "up" ? (
      <ChevronUp className="absolute top-[6px] right-[1.5px] h-2 w-2" strokeWidth={5.0} />
    ) : (
      <ChevronDown className="absolute bottom-[2px] right-[1.5px] h-2 w-2" strokeWidth={5.0} />
    )}
  </span>
)

const MessageTypeBadge = ({ type }: { type: Message["type"] }) => {
  const Icon = type === "image" ? ImageIcon : type === "system" ? Info : MessageSquareText
  const label = type === "image" ? "Image message" : type === "system" ? "System message" : "Text message"

  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
        type === "image" &&
          "border-sky-400/35 bg-sky-400/10 text-sky-500 dark:text-sky-300",
        type === "system" &&
          "border-violet-400/35 bg-violet-400/10 text-violet-500 dark:text-violet-300",
        type === "text" &&
          "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

const MessageRow = ({
  message,
  sender,
  onEdit,
  onDelete,
  isHighlighted,
  isActionsOpen,
  onToggleActions,
}: {
  message: Message
  sender: Participant | undefined
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggleVisibility: () => void
  isHighlighted: boolean
  isActionsOpen: boolean
  onToggleActions: () => void
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: message.id,
    animateLayoutChanges: () => false,
  })

  const isHidden = Boolean(message.isHidden)
  const avatarFallback = (sender?.name || "??").slice(0, 2).toUpperCase()
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: "none",
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 shadow-sm hover:bg-[hsl(var(--accent))] sm:pl-11",
        isHidden && "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
        isHighlighted &&
          "border-amber-400/70 bg-amber-300/15 shadow-[0_0_0_1px_rgba(251,191,36,0.22)] hover:bg-amber-300/20",
        isDragging && "ring-2 ring-cyan-400/25",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute inset-y-0 left-0 hidden h-full w-8 cursor-grab rounded-l-xl rounded-r-none border-r border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] active:cursor-grabbing sm:inline-flex"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      {sender?.avatarUrl ? (
        <img
          src={sender.avatarUrl}
          alt={sender.name || "Sender avatar"}
          className="h-8 w-8 shrink-0 rounded-full border border-[hsl(var(--border))] object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[0.65rem] font-semibold text-[hsl(var(--muted-foreground))]"
          title={sender?.name ?? "Unknown sender"}
          style={
            sender?.color
              ? {
                  backgroundColor: `color-mix(in srgb, ${sender.color} 18%, transparent)`,
                  borderColor: `color-mix(in srgb, ${sender.color} 45%, hsl(var(--border)))`,
                  color: sender.color,
                }
              : undefined
          }
        >
          {avatarFallback}
        </div>
      )}
      <MessageTypeBadge type={message.type} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-medium break-words whitespace-normal sm:truncate",
            isHidden ? "text-[hsl(var(--muted-foreground))]" : "text-[hsl(var(--foreground))]",
          )}
          title={message.content}
        >
          {message.content}
        </div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {message.type} - {formatTimestamp(message.timestamp)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Edit</span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon"
          className={cn(isActionsOpen && "bg-[hsl(var(--accent))]")}
          onClick={onToggleActions}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">More actions</span>
        </Button>
      </div>
    </div>
  )
}

export const ConversationBuilder = () => {
  const messages = useConversationStore((state) => state.conversation.messages)
  const participants = useConversationStore((state) => state.conversation.participants)
  const activeParticipantId = useConversationStore((state) => state.activeParticipantId)
  const addMessage = useConversationStore((state) => state.addMessage)
  const updateMessage = useConversationStore((state) => state.updateMessage)
  const deleteMessage = useConversationStore((state) => state.deleteMessage)
  const duplicateMessageEnd = useConversationStore((state) => state.duplicateMessageEnd)
  const duplicateMessageStart = useConversationStore((state) => state.duplicateMessageStart)
  const duplicateMessageNext = useConversationStore((state) => state.duplicateMessageNext)
  const setMessages = useConversationStore((state) => state.setMessages)
  const globalDateInput = useConversationStore(
    (state) => state.conversation.editorState?.globalDateTime ?? "",
  )
  const preserveNaturalTime = useConversationStore(
    (state) => state.conversation.editorState?.preserveNaturalTime ?? true,
  )
  const setConversationEditorState = useConversationStore(
    (state) => state.setConversationEditorState,
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [areMessageOptionsOpen, setAreMessageOptionsOpen] = useState(true)
  const [viewMode, setViewMode] = useState<"standard" | "easy">("standard")
  const [easyInput, setEasyInput] = useState("")
  const [easyError, setEasyError] = useState<string | null>(null)
  const [lastInteractedMessageId, setLastInteractedMessageId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const { globalDate, hasMixedDates } = useMemo(() => {
    if (messages.length === 0) {
      return { globalDate: "", hasMixedDates: false }
    }
    const dateValues = messages.map((message) => toDateTimeInputValue(message.timestamp))
    const uniqueDates = new Set(dateValues)
    return {
      globalDate: uniqueDates.size === 1 ? dateValues[0] : "",
      hasMixedDates: uniqueDates.size > 1,
    }
  }, [messages])
  const participantsById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  )
  const effectiveGlobalDateInput = messages.length === 0 ? "" : globalDateInput || globalDate

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const restrictToVerticalAxis = ({ transform }: { transform: Transform }) => ({
    ...transform,
    x: 0,
  })

  const moveMessage = (messageId: string, direction: -1 | 1) => {
    const index = messages.findIndex((message) => message.id === messageId)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= messages.length) return
    setLastInteractedMessageId(messageId)
    setMessages(arrayMove(messages, index, targetIndex))
  }

  const normalizeNaturalTimeline = (sourceMessages: Message[], startIndex = 0) => {
    if (sourceMessages.length === 0 || startIndex >= sourceMessages.length) {
      return { messages: sourceMessages, changed: false }
    }

    const nextMessages = [...sourceMessages]
    let changed = false
    let minimumTime: number | null = null

    for (let index = 0; index < startIndex; index += 1) {
      const timestamp = new Date(nextMessages[index].timestamp).getTime()
      minimumTime = Number.isNaN(timestamp) ? null : timestamp
    }

    for (let index = startIndex; index < nextMessages.length; index += 1) {
      const message = nextMessages[index]
      const timestamp = new Date(message.timestamp).getTime()
      if (Number.isNaN(timestamp)) {
        minimumTime = null
        continue
      }

      if (minimumTime !== null && timestamp < minimumTime) {
        nextMessages[index] = {
          ...message,
          timestamp: new Date(minimumTime).toISOString(),
        }
        changed = true
        continue
      }

      minimumTime = timestamp
    }

    return {
      messages: changed ? nextMessages : sourceMessages,
      changed,
    }
  }

  const applyGlobalDateToAll = (value: string) => {
    if (!value || messages.length === 0) return
    const target = new Date(value)
    if (Number.isNaN(target.getTime())) return

    setMessages(
      messages.map((message) => {
        if (Number.isNaN(new Date(message.timestamp).getTime())) return message
        return { ...message, timestamp: target.toISOString() }
      }),
    )
    showToast("All message dates and times reset.")
  }

  const resolveReceiverId = () => {
    const fallback = participants[0]?.id ?? ""
    if (!activeParticipantId) return fallback
    return participants.find((participant) => participant.id !== activeParticipantId)?.id ?? fallback
  }

  const showToast = (message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone })
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 2400)
  }

  const findCreatedMessageId = (previousMessages: Message[]) => {
    const previousIds = new Set(previousMessages.map((message) => message.id))
    const nextMessages = useConversationStore.getState().conversation.messages

    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      if (!previousIds.has(nextMessages[index].id)) {
        return nextMessages[index].id
      }
    }

    return null
  }

  const highlightCreatedMessage = (previousMessages: Message[]) => {
    const createdMessageId = findCreatedMessageId(previousMessages)
    if (createdMessageId) {
      setLastInteractedMessageId(createdMessageId)
    }
  }

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
    },
    [],
  )

  const buildEasyText = () =>
    messages
      .map((message) => {
        const marker = message.senderId === activeParticipantId ? "<" : ">"
        return `${marker} ${message.content}`
      })
      .join("\n")

  const handleViewModeChange = (mode: "standard" | "easy") => {
    setEditingId(null)
    setOpenActionsId(null)
    setEasyError(null)
    if (mode === "easy") {
      setEasyInput(buildEasyText())
    }
    setViewMode(mode)
  }

  const handleEasyApply = () => {
    const receiverId = resolveReceiverId()
    if (!activeParticipantId || !receiverId) {
      setEasyError("Add at least two participants to use easy mode.")
      showToast("Add at least two participants to use easy mode.", "error")
      return
    }

    const lines = easyInput.split("\n")
    const entries: Array<{ senderId: string; content: string }> = []
    let hasInvalidLine = false

    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      const marker = trimmed[0]
      if (marker !== "<" && marker !== ">") {
        if (entries.length) {
          entries[entries.length - 1].content += `\n${trimmed}`
        } else {
          hasInvalidLine = true
        }
        return
      }
      const content = trimmed.slice(1).trim()
      if (!content) return
      const senderId = marker === "<" ? activeParticipantId : receiverId
      entries.push({ senderId, content })
    })

    if (hasInvalidLine || entries.length === 0) {
      setEasyError("Use < or > at the start of each message line.")
      showToast("Use < or > at the start of each message line.", "error")
      return
    }

    const now = Date.now()
    const nextMessages = entries.map((entry, index) => {
      const existing = messages[index]
      if (existing) {
        return {
          ...existing,
          senderId: entry.senderId,
          content: entry.content,
        }
      }
      return {
        id: generateId(),
        senderId: entry.senderId,
        content: entry.content,
        timestamp: new Date(now + index * 1000).toISOString(),
        type: "text" as const,
        status: "sent" as const,
      }
    })

    setMessages(nextMessages)
    setLastInteractedMessageId(nextMessages[nextMessages.length - 1]?.id ?? null)
    setEasyError(null)
    showToast("Easy changes applied.")
  }

  const handleMessageSave = (
    messageId: string,
    payload: {
      senderId: string
      content: string
      images?: Message["images"]
      imageUrl?: string
      imageWidth?: number
      imageHeight?: number
      timestamp: string
      type: Message["type"]
      status: Message["status"]
      isSpoiler?: boolean
      exportSpoiler?: boolean
    },
  ) => {
    const messageIndex = messages.findIndex((message) => message.id === messageId)
    if (messageIndex === -1) return

    const currentMessage = messages[messageIndex]
    const previousTime = new Date(currentMessage.timestamp).getTime()
    const nextTime = new Date(payload.timestamp).getTime()
    const shouldPreserveNaturalTime =
      preserveNaturalTime &&
      currentMessage.timestamp !== payload.timestamp &&
      !Number.isNaN(previousTime) &&
      !Number.isNaN(nextTime)

    if (!shouldPreserveNaturalTime) {
      updateMessage(messageId, payload)
      setEditingId(null)
      setLastInteractedMessageId(messageId)
      return
    }

    const updatedMessages = messages.map((message) =>
      message.id === messageId ? { ...message, ...payload } : message,
    )
    const { messages: normalizedMessages } = normalizeNaturalTimeline(updatedMessages, messageIndex)
    setMessages(normalizedMessages)
    setEditingId(null)
    setLastInteractedMessageId(messageId)
    showToast("Updated message timing and preserved a natural timeline.")
  }

  const handlePreserveNaturalTimeChange = (enabled: boolean) => {
    setConversationEditorState({ preserveNaturalTime: enabled })
    if (!enabled) return

    const { messages: normalizedMessages, changed } = normalizeNaturalTimeline(messages)
    if (!changed) return

    setMessages(normalizedMessages)
    showToast("Applied natural time across the whole conversation.")
  }

  const applyMessageTimeToNextMessages = (messageId: string) => {
    const messageIndex = messages.findIndex((message) => message.id === messageId)
    if (messageIndex === -1) return

    const anchorTimestamp = messages[messageIndex].timestamp
    if (Number.isNaN(new Date(anchorTimestamp).getTime())) return

    setLastInteractedMessageId(messageId)
    setMessages(
      messages.map((message, index) =>
        index > messageIndex ? { ...message, timestamp: anchorTimestamp } : message,
      ),
    )
    setOpenActionsId(null)
    showToast("Applied this time to all later messages.")
  }

  const hasHidden = messages.some((message) => message.isHidden)
  const hasVisible = messages.some((message) => !message.isHidden)
  const activeParticipant = participants.find((participant) => participant.id === activeParticipantId)
  const receiverParticipant = participants.find(
    (participant) => participant.id === resolveReceiverId(),
  )

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Conversation Builder</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Add messages, drag to reorder, or switch to Easy mode for bulk edits.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-controls="conversation-message-options"
                aria-expanded={areMessageOptionsOpen}
                onClick={() => setAreMessageOptionsOpen((prev) => !prev)}
              >
                {areMessageOptionsOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span className="sr-only">
                  {areMessageOptionsOpen ? "Hide message options" : "Show message options"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {areMessageOptionsOpen ? "Hide message options" : "Show message options"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {areMessageOptionsOpen ? (
            <div
              id="conversation-message-options"
              className="flex shrink-0 flex-wrap items-center justify-between gap-2"
            >
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Messages</h4>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{messages.length} total</span>
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Global date/time</Label>
                    <Input
                      type="datetime-local"
                      value={effectiveGlobalDateInput}
                      onChange={(event) =>
                        setConversationEditorState({ globalDateTime: event.target.value })
                      }
                      className="h-8 w-auto max-w-full text-xs"
                      disabled={messages.length === 0}
                    />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {hasMixedDates ? "Mixed date/time" : "Same date/time"}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => applyGlobalDateToAll(effectiveGlobalDateInput)}
                      disabled={messages.length === 0 || !effectiveGlobalDateInput}
                    >
                      Apply global date/time
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-[hsl(var(--foreground))]">Preserve natural time</div>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        Keeps the thread from moving backward in time. Turning this on also fixes the current conversation from top to bottom.
                      </p>
                    </div>
                    <Switch
                      checked={preserveNaturalTime}
                      onCheckedChange={handlePreserveNaturalTimeChange}
                      aria-label="Preserve natural time"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setMessages(messages.map((message) => ({ ...message, isHidden: true })))
                  }
                  disabled={!hasVisible}
                >
                  Hide all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setMessages(messages.map((message) => ({ ...message, isHidden: false })))
                  }
                  disabled={!hasHidden}
                >
                  Show all
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">Editor view</div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Switch between the list and easy text editor.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "standard" ? "default" : "outline"}
                onClick={() => handleViewModeChange("standard")}
              >
                Standard
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "easy" ? "default" : "outline"}
                onClick={() => handleViewModeChange("easy")}
              >
                Easy
              </Button>
            </div>
          </div>
          {viewMode === "easy" ? (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Easy editor</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEasyInput(buildEasyText())}
                >
                  Refresh
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                <Textarea
                  value={easyInput}
                  onChange={(event) => {
                    setEasyInput(event.target.value)
                    if (easyError) setEasyError(null)
                  }}
                  placeholder={`< ${activeParticipant?.name ?? "Sender"} message\n> ${receiverParticipant?.name ?? "Receiver"} message`}
                  className="min-h-[280px] resize-y"
                />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold">&lt;</span> = {activeParticipant?.name ?? "Sender"},{" "}
                  <span className="font-semibold">&gt;</span> = {receiverParticipant?.name ?? "Receiver"}.
                  New lines become new messages, timestamps default to now.
                </p>
                {easyError ? (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {easyError}
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" onClick={handleEasyApply}>
                  Apply changes
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEasyInput("")
                    setEasyError(null)
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
            >
              {messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  No messages yet. Add the first entry above.
                </div>
              ) : null}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragStart={({ active }) => {
                  setLastInteractedMessageId(String(active.id))
                }}
                onDragEnd={({ active, over }) => {
                  const activeId = String(active.id)
                  setLastInteractedMessageId(activeId)
                  if (!over || activeId === String(over.id)) return
                  const oldIndex = messages.findIndex((message) => message.id === activeId)
                  const newIndex = messages.findIndex((message) => message.id === String(over.id))
                  if (oldIndex === -1 || newIndex === -1) return
                  setMessages(arrayMove(messages, oldIndex, newIndex))
                }}
              >
                <SortableContext
                  items={messages.map((message) => message.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {messages.map((message) => {
                      const canMoveUp = messages[0]?.id !== message.id
                      const canMoveDown = messages[messages.length - 1]?.id !== message.id
                      const isActionsOpen = openActionsId === message.id
                      return (
                        <div key={message.id} className="space-y-2">
                          <MessageRow
                            message={message}
                            sender={participantsById.get(message.senderId)}
                            isHighlighted={lastInteractedMessageId === message.id}
                            onEdit={() => {
                              setLastInteractedMessageId(message.id)
                              setEditingId(message.id)
                              setIsAdvancedOpen(false)
                              setOpenActionsId(null)
                            }}
                            onToggleVisibility={() => {
                              setLastInteractedMessageId(message.id)
                              updateMessage(message.id, { isHidden: !message.isHidden })
                            }}
                            onDuplicate={() => {
                              duplicateMessageEnd(message.id)
                              highlightCreatedMessage(messages)
                              setOpenActionsId(null)
                            }}
                            onDelete={() => {
                              setLastInteractedMessageId(message.id)
                              deleteMessage(message.id)
                              setOpenActionsId(null)
                            }}
                            isActionsOpen={isActionsOpen}
                            onToggleActions={() => {
                              setLastInteractedMessageId(message.id)
                              setOpenActionsId((current) => (current === message.id ? null : message.id))
                            }}
                          />
                          {isActionsOpen ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
                              <div className="flex items-center gap-1 sm:hidden">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => moveMessage(message.id, -1)}
                                  disabled={!canMoveUp}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                  <span className="sr-only">Move up</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => moveMessage(message.id, 1)}
                                  disabled={!canMoveDown}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                  <span className="sr-only">Move down</span>
                                </Button>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setLastInteractedMessageId(message.id)
                                  updateMessage(message.id, { isHidden: !message.isHidden })
                                  setOpenActionsId(null)
                                }}
                              >
                                {message.isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                {message.isHidden ? "Show" : "Hide"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  duplicateMessageNext(message.id)
                                  highlightCreatedMessage(messages)
                                  setOpenActionsId(null)
                                }}
                              >
                                <Copy className="h-4 w-4" />
                                Duplicate
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setLastInteractedMessageId(message.id)
                                  applyMessageTimeToNextMessages(message.id)
                                }}
                              >
                                <ClockArrowUp className="h-4 w-4" />
                                Time
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  duplicateMessageStart(message.id)
                                  highlightCreatedMessage(messages)
                                  setOpenActionsId(null)
                                }}
                              >
                                <DirectionalCopyIcon direction="up" />
                                Dupe to start
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  duplicateMessageEnd(message.id)
                                  highlightCreatedMessage(messages)
                                  setOpenActionsId(null)
                                }}
                              >
                                <DirectionalCopyIcon direction="down" />
                                Dupe to end
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="sm:hidden"
                                onClick={() => {
                                  setLastInteractedMessageId(message.id)
                                  deleteMessage(message.id)
                                  setOpenActionsId(null)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          ) : null}
                          {editingId === message.id ? (
                            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
                              <MessageForm
                                key={message.id}
                                participants={participants}
                                initial={message}
                                defaultSenderId={activeParticipantId}
                                compact
                                advancedOpen={isAdvancedOpen}
                                onToggleAdvanced={() => {
                                  setLastInteractedMessageId(message.id)
                                  setIsAdvancedOpen((prev) => !prev)
                                }}
                                onSubmit={(payload) => handleMessageSave(message.id, payload)}
                                onCancel={() => {
                                  setLastInteractedMessageId(message.id)
                                  setEditingId(null)
                                }}
                                submitLabel="Save changes"
                              />
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
        {viewMode === "standard" ? (
          <div className="shrink-0 space-y-3">
            <Separator />
            <div className="space-y-3">
              {isAddOpen ? (
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
                  <MessageForm
                    key="new"
                    participants={participants}
                    initial={null}
                    defaultSenderId={activeParticipantId}
                    compact
                    resetOnSubmit
                    onSubmit={(payload) => {
                      addMessage(payload)
                      highlightCreatedMessage(messages)
                    }}
                    submitLabel="Add message"
                  />
                </div>
              ) : null}
              <Button
                type="button"
                className="w-full"
                variant={isAddOpen ? "outline" : "default"}
                onClick={() => setIsAddOpen((prev) => !prev)}
              >
                {isAddOpen ? "Hide add message" : "Add message"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {toast ? (
        <div
          className="pointer-events-none fixed top-5 left-1/2 z-50 w-[90%] -translate-x-1/2 sm:w-auto"
          aria-live="polite"
        >
          <div
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium shadow-lg",
              toast.tone === "success"
                ? "bg-emerald-500 text-white"
                : "bg-red-600 text-white",
            )}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  )
}
