import { BookOpen, FileUp, PencilLine } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { getLayoutConfig } from "@/constants/layouts"
import {
  ConversationViewport,
  ConversationViewportControls,
  ConversationViewportStatus,
} from "@/components/chat/ConversationViewport"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useConversationViewport } from "@/hooks/useConversationViewport"
import { useConversationStore } from "@/store/conversationStore"
import { readJsonFile } from "@/utils/storage"

interface ReaderModeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasLongConversation?: boolean
}

const READER_DEFAULT_ZOOM = 1
const READER_MAX_FIT_SCALE = 1.5

export const ReaderMode = ({ open, onOpenChange, hasLongConversation }: ReaderModeProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [readerZoom, setReaderZoom] = useState(READER_DEFAULT_ZOOM)
  const conversation = useConversationStore((state) => state.conversation)
  const layoutId = useConversationStore((state) => state.layoutId)
  const themeId = useConversationStore((state) => state.themeId)
  const activeParticipantId = useConversationStore((state) => state.activeParticipantId)
  const backgroundImageUrl = useConversationStore((state) => state.backgroundImageUrl)
  const backgroundImageOpacity = useConversationStore((state) => state.backgroundImageOpacity)
  const backgroundColor = useConversationStore((state) => state.backgroundColor)
  const exportSettings = useConversationStore((state) => state.exportSettings)
  const ui = useConversationStore((state) => state.ui)
  const setUi = useConversationStore((state) => state.setUi)
  const loadConversation = useConversationStore((state) => state.loadConversation)

  useEffect(() => {
    if (open) {
      setReaderZoom(READER_DEFAULT_ZOOM)
    }
  }, [open])

  const layout = getLayoutConfig(layoutId)
  const theme = useMemo(
    () => layout.themes.find((item) => item.id === themeId) ?? layout.themes[0],
    [layout, themeId],
  )
  const visibleMessageCount = conversation.messages.filter((message) => !message.isHidden).length
  const measurementKey = [
    conversation.id,
    conversation.metadata.updatedAt,
    conversation.participants.length,
    conversation.messages.length,
    visibleMessageCount,
    layout.id,
    theme.id,
    ui.showChrome,
    backgroundImageUrl,
    backgroundColor,
    open ? "open" : "closed",
  ].join(":")
  const readerViewport = useConversationViewport({
    width: exportSettings.width,
    height: exportSettings.height,
    zoom: readerZoom,
    autoFit: ui.autoFit,
    maxFitScale: READER_MAX_FIT_SCALE,
    measurementKey,
  })
  const shouldShowJumpControls = hasLongConversation ?? readerViewport.hasLongConversation

  const enterEditMode = () => {
    setUi({ activeView: "editor", isSidebarOpen: true })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 left-0 top-0 flex h-svh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 bg-[hsl(var(--background))] p-0">
        <DialogTitle className="sr-only">Reader mode</DialogTitle>
        <DialogDescription className="sr-only">
          Fullscreen conversation reader.
        </DialogDescription>
        <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
          <header className="flex shrink-0 flex-col gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 pr-12 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                Reader mode
              </div>
              <ConversationViewportStatus
                appliedScale={readerViewport.appliedScale}
                autoFit={ui.autoFit}
                width={exportSettings.width}
                height={exportSettings.height}
                suffix={`${visibleMessageCount} visible messages`}
              />
              {loadError ? <div className="text-xs text-red-300">{loadError}</div> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConversationViewportControls
                showChrome={ui.showChrome}
                zoom={readerZoom}
                hasLongConversation={shouldShowJumpControls}
                onToggleChrome={() => setUi({ showChrome: !ui.showChrome })}
                onZoomChange={setReaderZoom}
                onResetZoom={() => setReaderZoom(READER_DEFAULT_ZOOM)}
                onJump={readerViewport.scrollConversation}
                modeActions={
                  <>
                    <Button variant="default" size="sm" onClick={enterEditMode}>
                      <PencilLine className="h-4 w-4" />
                      <span className="hidden sm:inline">Edit mode</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileUp className="h-4 w-4" />
                      <span className="hidden sm:inline">Load JSON</span>
                    </Button>
                  </>
                }
                className="w-auto"
              />
            </div>
          </header>
          <main className="min-h-0 flex-1">
            <ConversationViewport
              viewport={readerViewport}
              conversation={conversation}
              layout={layout}
              theme={theme}
              showChrome={ui.showChrome}
              activeParticipantId={activeParticipantId}
              backgroundImageUrl={backgroundImageUrl}
              backgroundImageOpacity={backgroundImageOpacity}
              backgroundColor={backgroundColor}
              className="h-full rounded-none border-0 bg-[hsl(var(--background))] p-0"
            />
          </main>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                const data = await readJsonFile(file)
                loadConversation(data)
                setLoadError(null)
              } catch (error) {
                const message = error instanceof Error ? error.message : "Could not open file"
                setLoadError(message)
              } finally {
                event.target.value = ""
              }
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
