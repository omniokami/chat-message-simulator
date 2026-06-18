import { BookOpen, ChevronDown, ChevronUp, FileUp, Moon, PencilLine, Sun } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { getLayoutConfig } from "@/constants/layouts"
import {
  ConversationViewport,
  ConversationViewportControls,
  ConversationViewportStatus,
} from "@/components/chat/ConversationViewport"
import { ReaderImageViewer } from "@/components/reader/ReaderImageViewer"
import { useConversationImageViewer } from "@/hooks/useConversationImageViewer"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useConversationViewport } from "@/hooks/useConversationViewport"
import { useConversationStore } from "@/store/conversationStore"
import { cn } from "@/utils/cn"
import { loadConversationData, readJsonFile } from "@/utils/storage"

interface ReaderModeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasLongConversation?: boolean
}

const READER_DEFAULT_ZOOM = 1
const READER_AUTO_FIT = true
const READER_MAX_SCALE = Number.POSITIVE_INFINITY
const READER_TOP_ACTION_BUTTON_CLASSNAME =
  "top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-0 text-[hsl(var(--foreground))] shadow-sm backdrop-blur hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0"

export const ReaderMode = ({ open, onOpenChange, hasLongConversation }: ReaderModeProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const wasOpenRef = useRef(open)
  const handledLoadScrollResetRef = useRef(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadScrollResetToken, setLoadScrollResetToken] = useState(0)
  const [readerZoom, setReaderZoom] = useState(READER_DEFAULT_ZOOM)
  const [isViewportMounted, setIsViewportMounted] = useState(false)
  const [isHeaderVisible, setIsHeaderVisible] = useState(false)
  const conversation = useConversationStore((state) => state.conversation)
  const layoutId = useConversationStore((state) => state.layoutId)
  const themeId = useConversationStore((state) => state.themeId)
  const editorTheme = useConversationStore((state) => state.editorTheme)
  const viewParticipantId = useConversationStore((state) => state.viewParticipantId)
  const backgroundImageUrl = useConversationStore((state) => state.backgroundImageUrl)
  const backgroundImageOpacity = useConversationStore((state) => state.backgroundImageOpacity)
  const backgroundColor = useConversationStore((state) => state.backgroundColor)
  const spoilerBlur = useConversationStore((state) => state.spoilerBlur)
  const exportSettings = useConversationStore((state) => state.exportSettings)
  const ui = useConversationStore((state) => state.ui)
  const setUi = useConversationStore((state) => state.setUi)
  const setEditorTheme = useConversationStore((state) => state.setEditorTheme)
  const loadConversation = useConversationStore((state) => state.loadConversation)
  const isEditorDark = editorTheme === "dark"

  useEffect(() => {
    if (!open) {
      setIsViewportMounted(false)
      wasOpenRef.current = false
      return
    }

    setReaderZoom(READER_DEFAULT_ZOOM)
    setIsViewportMounted(false)
    setIsHeaderVisible(false)

    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setIsViewportMounted(true))
    })

    wasOpenRef.current = true

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame)
      }
    }
  }, [open])

  useEffect(() => {
    if (!open || typeof document === "undefined") return

    document.documentElement.dataset.readerMode = "open"
    document.body.dataset.readerMode = "open"

    const bodyOverflow = document.body.style.overflow
    const htmlOverflow = document.documentElement.style.overflow
    const bodyOverscrollBehavior = document.body.style.overscrollBehavior
    const htmlOverscrollBehavior = document.documentElement.style.overscrollBehavior

    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"
    document.documentElement.style.overscrollBehavior = "none"

    return () => {
      delete document.documentElement.dataset.readerMode
      delete document.body.dataset.readerMode
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = htmlOverflow
      document.body.style.overscrollBehavior = bodyOverscrollBehavior
      document.documentElement.style.overscrollBehavior = htmlOverscrollBehavior
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
    viewParticipantId,
    ui.showChrome,
    backgroundImageUrl,
    backgroundColor,
    open ? "open" : "closed",
  ].join(":")
  const readerViewport = useConversationViewport({
    width: exportSettings.width,
    height: exportSettings.height,
    zoom: readerZoom,
    autoFit: READER_AUTO_FIT,
    maxFitScale: READER_MAX_SCALE,
    maxAppliedScale: READER_MAX_SCALE,
    measurementKey,
  })
  const imageViewer = useConversationImageViewer({
    conversation,
    exportElementRef: readerViewport.exportElementRef,
  })
  const closeImageViewer = imageViewer.closeImageViewer
  const shouldShowJumpControls = hasLongConversation ?? readerViewport.hasLongConversation
  const isOpening = open && !wasOpenRef.current
  const shouldRenderViewport = open && isViewportMounted && !isOpening

  const enterEditMode = () => {
    setUi({ activeView: "editor", isSidebarOpen: true })
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) {
      closeImageViewer()
    }
  }, [closeImageViewer, open])

  useEffect(() => {
    if (
      !open ||
      !shouldRenderViewport ||
      loadScrollResetToken === 0 ||
      handledLoadScrollResetRef.current === loadScrollResetToken
    ) {
      return
    }

    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        readerViewport.scrollConversation("top", "auto")
        handledLoadScrollResetRef.current = loadScrollResetToken
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame)
      }
    }
  }, [loadScrollResetToken, open, readerViewport.scrollConversation, shouldRenderViewport])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-0 left-0 top-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 bg-[hsl(var(--background))] p-0"
        overlayClassName="bg-transparent backdrop-blur-none"
        closeClassName={cn(READER_TOP_ACTION_BUTTON_CLASSNAME, "right-3")}
      >
        <DialogTitle className="sr-only">Reader mode</DialogTitle>
        <DialogDescription className="sr-only">
          Fullscreen conversation reader.
        </DialogDescription>
        <Button
          variant="outline"
          size="icon"
          className={cn("absolute right-14", READER_TOP_ACTION_BUTTON_CLASSNAME)}
          onClick={() => setIsHeaderVisible((visible) => !visible)}
          aria-label={isHeaderVisible ? "Hide reader toolbar" : "Show reader toolbar"}
        >
          {isHeaderVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
          <div
            className={cn(
              "shrink-0 overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
              isHeaderVisible ? "max-h-56 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <header
              className={cn(
                "flex flex-col gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 py-2 pr-32 shadow-sm backdrop-blur transition-transform duration-200 ease-out lg:flex-row lg:items-center lg:justify-between",
                isHeaderVisible ? "translate-y-0" : "-translate-y-4",
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  Reader mode
                </div>
                <ConversationViewportStatus
                  appliedScale={readerViewport.appliedScale}
                  autoFit={READER_AUTO_FIT}
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
                  chromeActions={
                    <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1">
                      <Sun
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isEditorDark
                            ? "text-[hsl(var(--muted-foreground))]"
                            : "text-[hsl(var(--foreground))]",
                        )}
                      />
                      <Switch
                        checked={isEditorDark}
                        onCheckedChange={(checked) => setEditorTheme(checked ? "dark" : "light")}
                        aria-label="Toggle reader UI theme"
                      />
                      <Moon
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isEditorDark
                            ? "text-[hsl(var(--foreground))]"
                            : "text-[hsl(var(--muted-foreground))]",
                        )}
                      />
                    </div>
                  }
                  className="w-auto flex-wrap overflow-x-visible pb-0"
                />
              </div>
            </header>
          </div>
          <main className="min-h-0 flex-1 overflow-hidden">
            {shouldRenderViewport ? (
              <ConversationViewport
                viewport={readerViewport}
                conversation={conversation}
                layout={layout}
                theme={theme}
                showChrome={ui.showChrome}
                viewParticipantId={viewParticipantId}
                backgroundImageUrl={backgroundImageUrl}
                backgroundImageOpacity={backgroundImageOpacity}
                backgroundColor={backgroundColor}
                spoilerBlur={spoilerBlur}
                className="h-full rounded-none border-0 bg-[hsl(var(--background))] p-0"
                scrollClassName="overflow-hidden"
                fitToFrame
                onImageActivate={imageViewer.openImageViewer}
              />
            ) : (
              <div className="h-full bg-[hsl(var(--background))]" aria-hidden="true" />
            )}
          </main>
          <ReaderImageViewer
            open={Boolean(imageViewer.activeImageId)}
            activeImageId={imageViewer.activeImageId}
            images={imageViewer.images}
            participants={conversation.participants}
            enabledParticipantIds={imageViewer.enabledParticipantIds}
            onEnabledParticipantIdsChange={imageViewer.setEnabledParticipantIds}
            onActiveImageChange={imageViewer.setActiveImageId}
            onClose={imageViewer.closeImageViewer}
            onGoToMessage={imageViewer.scrollToMessage}
          />
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
                loadConversationData(data, loadConversation)
                setLoadScrollResetToken((token) => token + 1)
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
