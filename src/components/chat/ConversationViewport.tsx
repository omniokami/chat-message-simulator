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
  activeParticipantId: string
  backgroundImageUrl: string
  backgroundImageOpacity: number
  backgroundColor: string
  className?: string
  scrollClassName?: string
}

export const ConversationViewport = ({
  viewport,
  conversation,
  layout,
  theme,
  showChrome,
  activeParticipantId,
  backgroundImageUrl,
  backgroundImageOpacity,
  backgroundColor,
  className,
  scrollClassName,
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

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full min-h-0 items-center justify-center rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4",
        className,
      )}
    >
      <div
        ref={scrollRef}
        className={cn(
          "hide-scrollbar flex h-full w-full items-start justify-start overflow-auto",
          scrollClassName,
        )}
      >
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
                activeParticipantId={activeParticipantId}
                backgroundImageUrl={backgroundImageUrl}
                backgroundImageOpacity={backgroundImageOpacity}
                backgroundColor={backgroundColor}
                conversationMode="scroll"
                conversationContainerRef={conversationContainerRef}
                conversationContentRef={conversationContentRef}
              />
            </div>
          </div>
        </div>
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
  className,
}: ConversationViewportControlsProps) => (
  <div
    className={cn(
      "flex w-full items-center gap-x-6 gap-y-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap",
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
      <Button variant="outline" size="sm" onClick={onToggleChrome}>
        {showChrome ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        <span className="hidden sm:inline">{showChrome ? "Hide chrome" : "Show chrome"}</span>
      </Button>
      {hasLongConversation ? (
        <>
          <Button variant="outline" size="sm" onClick={() => onJump("top")}>
            <ArrowUpToLine className="h-4 w-4" />
            <span className="hidden sm:inline">To top</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => onJump("bottom")}>
            <ArrowDownToLine className="h-4 w-4" />
            <span className="hidden sm:inline">To bottom</span>
          </Button>
        </>
      ) : null}
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
  <div className={cn("flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]", className)}>
    <SquareStack className="h-4 w-4" />
    Zoom {Math.round(appliedScale * 100)}%
    {autoFit ? " (auto-fit)" : ""} - Export size {width} x {height}
    {suffix ? ` - ${suffix}` : ""}
  </div>
)
