import type { KeyboardEvent, MouseEvent, Ref } from "react"
import type { Message } from "@/types/message"
import type { Participant } from "@/types/conversation"
import type { LayoutConfig } from "@/types/layout"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { formatDateSeparator, formatInstagramDateSeparator } from "@/utils/helpers"
import { cn } from "@/utils/cn"

interface ConversationViewProps {
  messages: Message[]
  participants: Participant[]
  layout: LayoutConfig
  selfId: string
  spoilerBlur: number
  mode?: "scroll" | "expanded"
  containerRef?: Ref<HTMLDivElement>
  contentRef?: Ref<HTMLDivElement>
  onImageActivate?: (message: Message, imageId?: string) => void
  onMessageActivate?: (messageId: string) => void
}

const shouldIgnoreMessageActivation = (
  target: EventTarget | null,
  currentTarget: HTMLElement,
) => {
  if (!(target instanceof HTMLElement)) return false
  const interactiveTarget = target.closest<HTMLElement>(
    'button,a,input,textarea,select,[data-preview-message-action="true"]',
  )
  return Boolean(interactiveTarget && interactiveTarget !== currentTarget)
}

export const ConversationView = ({
  messages,
  participants,
  layout,
  selfId,
  spoilerBlur,
  mode = "scroll",
  containerRef,
  contentRef,
  onImageActivate,
  onMessageActivate,
}: ConversationViewProps) => {
  const visibleMessages = messages.filter((message) => !message.isHidden)
  const visibleYears = new Set(
    visibleMessages
      .map((message) => new Date(message.timestamp).getFullYear())
      .filter((year) => !Number.isNaN(year)),
  )
  const instagramShowsYear = visibleYears.size > 1
  const isWhatsApp = layout.id === "whatsapp"
  const isSnapchat = layout.id === "snapchat"
  const isMessenger = layout.id === "messenger"
  const isInstagram = layout.id === "instagram"
  const isTinder = layout.id === "tinder"
  const isGroup = participants.length > 2
  const dateBadgeClass = cn(
    "mx-auto w-fit rounded-full px-2.5 py-0.5 text-[0.7rem]",
    isWhatsApp
      ? "bg-white/70 text-[0.65rem] font-medium text-[#54656f] shadow-[0_1px_0_rgba(0,0,0,0.08)]"
      : isSnapchat
        ? "bg-black/5 text-[0.6rem] font-medium text-[var(--chat-muted)]"
        : isMessenger
          ? "bg-transparent text-[0.6rem] font-medium text-[var(--chat-muted)]"
          : isInstagram
            ? "bg-transparent text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--chat-muted)]"
            : isTinder
              ? "bg-transparent text-[0.55rem] font-semibold uppercase tracking-wide text-[var(--chat-muted)]"
        : "bg-white/20 text-[var(--chat-muted)]",
  )
  const systemMessageClass = cn(
    "mx-auto max-w-[70%] whitespace-pre-wrap break-words rounded-full px-4 py-2 text-center text-xs",
    isWhatsApp
      ? "bg-white/70 text-[#54656f] shadow-[0_1px_0_rgba(0,0,0,0.08)]"
      : isSnapchat
        ? "bg-black/5 text-[var(--chat-muted)]"
        : isMessenger
          ? "bg-transparent text-[var(--chat-muted)]"
          : isInstagram
            ? "bg-transparent text-[var(--chat-muted)]"
            : isTinder
              ? "bg-transparent text-[var(--chat-muted)]"
        : "bg-white/15 text-[var(--chat-muted)]",
  )
  const getMessageActivationProps = (messageId: string) =>
    onMessageActivate
      ? {
          role: "button",
          tabIndex: 0,
          onClick: (event: MouseEvent<HTMLDivElement>) => {
            if (shouldIgnoreMessageActivation(event.target, event.currentTarget)) return
            onMessageActivate(messageId)
          },
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter" && event.key !== " ") return
            if (shouldIgnoreMessageActivation(event.target, event.currentTarget)) return
            event.preventDefault()
            onMessageActivate(messageId)
          },
        }
      : {}

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative z-10 h-full min-h-0 overscroll-contain hide-scrollbar",
        mode === "expanded" ? "overflow-visible" : "overflow-y-auto",
      )}
      data-conversation-mode={mode}
      data-conversation-scroll-root="true"
    >
      <div
        ref={contentRef}
        className={cn(
          "flex min-h-full flex-col",
          isWhatsApp
            ? "gap-1 px-3 py-4"
            : isSnapchat
              ? "gap-2 px-2.5 py-4"
              : isMessenger
                ? "gap-3 px-3 py-4"
                : isInstagram
                  ? "gap-3 px-3 py-4"
                  : isTinder
                    ? "gap-2.5 px-4 py-4"
              : "gap-4 px-4 py-6",
        )}
        data-conversation-content="true"
      >
        {visibleMessages.length === 0 ? (
          <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-white/40 bg-white/10 px-6 py-8 text-center text-sm text-[var(--chat-muted)]">
            {messages.length === 0
              ? "Start your story by adding messages in the builder."
              : "No visible messages. Unhide messages in the builder."}
          </div>
        ) : null}
        {visibleMessages.map((message, index) => {
          const sender = participants.find((participant) => participant.id === message.senderId)
          const currentDate = isInstagram
            ? formatInstagramDateSeparator(message.timestamp, instagramShowsYear)
            : formatDateSeparator(message.timestamp)
          const currentDateKey = formatDateSeparator(message.timestamp)
          const previousDateKey =
            index > 0 ? formatDateSeparator(visibleMessages[index - 1].timestamp) : ""
          const showDate = currentDateKey !== previousDateKey
          const isOwn = message.senderId === selfId
          const nextMessage = visibleMessages[index + 1]
          const isLastFromSender =
            !nextMessage || nextMessage.senderId !== message.senderId || nextMessage.type === "system"
          const showAvatar = (isInstagram || isMessenger) && !isOwn && isLastFromSender

          if (message.type === "system") {
            return (
              <div
                key={message.id}
                className={cn(
                  "space-y-3",
                  onMessageActivate &&
                    "cursor-pointer rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80",
                )}
                data-message-id={message.id}
                {...getMessageActivationProps(message.id)}
              >
                {showDate ? <div className={dateBadgeClass}>{currentDate}</div> : null}
                <div className={systemMessageClass}>{message.content}</div>
              </div>
            )
          }

          return (
            <div
              key={message.id}
              className={cn(
                isWhatsApp ? "space-y-2" : "space-y-3",
                onMessageActivate &&
                  "cursor-pointer rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80",
              )}
              data-message-id={message.id}
              {...getMessageActivationProps(message.id)}
            >
              {showDate ? <div className={dateBadgeClass}>{currentDate}</div> : null}
              <MessageBubble
                message={message}
                sender={sender}
                isOwn={isOwn}
                layout={layout}
                isGroup={isGroup}
                spoilerBlur={spoilerBlur}
                showAvatar={showAvatar}
                onImageActivate={onImageActivate}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
