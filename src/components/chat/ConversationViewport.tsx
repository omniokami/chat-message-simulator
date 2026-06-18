import {
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  Minus,
  Plus,
  ScreenShare,
  SquareStack,
} from "lucide-react"
import type { ReactNode } from "react"
import type { Conversation } from "@/types/conversation"
import type { Message } from "@/types/message"
import type { LayoutConfig, LayoutTheme } from "@/types/layout"
import { ChatLayout } from "@/components/layout/ChatLayout"
import { Button } from "@/components/ui/button"
import type { ConversationViewportState } from "@/hooks/useConversationViewport"
import { cn } from "@/utils/cn"
import { clamp } from "@/utils/helpers"

interface ConversationViewportProps {
  viewport: ConversationViewportState
  conversation: Conversation
  layout: LayoutConfig
  theme: LayoutTheme
  showChrome: boolean
  viewParticipantId: string
  backgroundImageUrl: string
  backgroundImageOpacity: number
  backgroundColor: string
  spoilerBlur: number
  className?: string
  scrollClassName?: string
  fitToFrame?: boolean
  onImageActivate?: (message: Message, imageId?: string) => void
}

export const ConversationViewport = ({
  viewport,
  conversation,
  layout,
  theme,
  showChrome,
  viewParticipantId,
  backgroundImageUrl,
  backgroundImageOpacity,
  backgroundColor,
  spoilerBlur,
  className,
  scrollClassName,
  fitToFrame = false,
  onImageActivate,
}: ConversationViewportProps) => {
  const {
    containerRef,
    scrollRef,
    exportRef,
    conversationContainerRef,
    conversationContentRef,
    appliedScale,
    scaledWidth,
    scaledHeight,
  } = viewport
  const frameWidth = scaledWidth / appliedScale
  const frameHeight = scaledHeight / appliedScale
  const chatFrame = (
    <div
      ref={exportRef}
      className="h-full w-full"
      style={{
        width: frameWidth,
        height: frameHeight,
      }}
    >
      <ChatLayout
        conversation={conversation}
        layout={layout}
        theme={theme}
        showChrome={showChrome}
        viewParticipantId={viewParticipantId}
        backgroundImageUrl={backgroundImageUrl}
        backgroundImageOpacity={backgroundImageOpacity}
        backgroundColor={backgroundColor}
        spoilerBlur={spoilerBlur}
        conversationMode="scroll"
        conversationContainerRef={conversationContainerRef}
        conversationContentRef={conversationContentRef}
        onImageActivate={onImageActivate}
      />
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        "workspace-perf-contained flex h-full min-h-0 items-center justify-center rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4",
        className,
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "hide-scrollbar h-full w-full",
          fitToFrame
            ? "relative overflow-hidden"
            : "flex items-start justify-start overflow-auto",
          scrollClassName,
        )}
      >
        {fitToFrame ? (
          <div className="relative h-full w-full overflow-hidden">
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: frameWidth,
                height: frameHeight,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="h-full w-full"
                style={{
                  transform: `scale(${appliedScale})`,
                  transformOrigin: "center",
                }}
              >
                {chatFrame}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="relative m-auto"
            style={{
              width: scaledWidth,
              height: scaledHeight,
            }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: frameWidth,
                height: frameHeight,
                transform: `scale(${appliedScale})`,
                transformOrigin: "top left",
              }}
            >
              {chatFrame}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ConversationViewportControlsProps {
  showChrome: boolean
  zoom: number
  hasLongConversation: boolean
  onToggleChrome: () => void
  onZoomChange: (zoom: number) => void
  onResetZoom: () => void
  onJump: (position: "top" | "bottom") => void
  modeActions?: ReactNode
  chromeActions?: ReactNode
  className?: string
}

export const ConversationViewportControls = ({
  showChrome,
  zoom,
  hasLongConversation,
  onToggleChrome,
  onZoomChange,
  onResetZoom,
  onJump,
  modeActions,
  chromeActions,
  className,
}: ConversationViewportControlsProps) => (
  <div
    className={cn(
      "flex min-h-9 w-full items-center gap-x-6 gap-y-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap",
      className,
    )}
  >
    {modeActions ? (
      <div className="flex shrink-0 items-center gap-2">{modeActions}</div>
    ) : null}
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onZoomChange(clamp(zoom + 0.1, 0.5, 2))}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Zoom in</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onZoomChange(clamp(zoom - 0.1, 0.5, 2))}
      >
        <Minus className="h-4 w-4" />
        <span className="hidden sm:inline">Zoom out</span>
      </Button>
      <Button variant="outline" size="sm" onClick={onResetZoom}>
        <ScreenShare className="h-4 w-4" />
        <span className="hidden sm:inline">Reset zoom</span>
      </Button>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onJump("top")}
        disabled={!hasLongConversation}
        aria-hidden={!hasLongConversation}
        tabIndex={hasLongConversation ? undefined : -1}
        className={cn(!hasLongConversation && "invisible")}
      >
        <ArrowUpToLine className="h-4 w-4" />
        <span className="hidden sm:inline">To top</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onJump("bottom")}
        disabled={!hasLongConversation}
        aria-hidden={!hasLongConversation}
        tabIndex={hasLongConversation ? undefined : -1}
        className={cn(!hasLongConversation && "invisible")}
      >
        <ArrowDownToLine className="h-4 w-4" />
        <span className="hidden sm:inline">To bottom</span>
      </Button>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {chromeActions}
      <Button variant="outline" size="sm" onClick={onToggleChrome}>
        {showChrome ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        <span className="hidden min-w-[5.8rem] text-left sm:inline">
          {showChrome ? "Hide chrome" : "Show chrome"}
        </span>
      </Button>
    </div>
  </div>
)

interface ConversationViewportStatusProps {
  appliedScale: number
  autoFit: boolean
  width: number
  height: number
  suffix?: string
  className?: string
}

export const ConversationViewportStatus = ({
  appliedScale,
  autoFit,
  width,
  height,
  suffix,
  className,
}: ConversationViewportStatusProps) => (
  <div
    className={cn(
      "flex min-h-5 items-center gap-2 overflow-hidden text-xs text-[hsl(var(--muted-foreground))]",
      className,
    )}
  >
    <SquareStack className="h-4 w-4" />
    <span className="min-w-[6.25rem] shrink-0 tabular-nums">
      Zoom {Math.round(appliedScale * 100)}%{autoFit ? " (auto-fit)" : ""}
    </span>
    <span className="min-w-[9rem] shrink-0 tabular-nums">
      - Export size {width} x {height}
    </span>
    <span className={cn("min-w-[6.5rem] shrink-0", !suffix && "invisible")}>
      {suffix ? `- ${suffix}` : "- all messages"}
    </span>
  </div>
)
