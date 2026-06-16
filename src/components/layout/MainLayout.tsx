import { useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  Eye,
  EyeOff,
  Image,
  MessagesSquare,
  Minus,
  Moon,
  Plus,
  ScreenShare,
  SlidersHorizontal,
  SquareStack,
  Sun,
  Users,
} from "lucide-react"
import { layoutConfigs } from "@/constants/layouts"
import { sizePresets, type SizePreset } from "@/constants/exportPresets"
import { useConversationStore } from "@/store/conversationStore"
import { ChatLayout } from "@/components/layout/ChatLayout"
import { Toolbar } from "@/components/layout/Toolbar"
import { ParticipantManager } from "@/components/editor/ParticipantManager"
import { ConversationBuilder } from "@/components/editor/ConversationBuilder"
import { ExportPanel } from "@/components/export/ExportPanel"
import { SettingsPanel } from "@/components/layout/SettingsPanel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { LayoutSelector } from "@/components/layout/LayoutSelector"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/utils/cn"
import { clamp } from "@/utils/helpers"
import { exportNodeToImageSequence } from "@/utils/export"

const buildDownloadName = (format: "png" | "jpeg", index?: number) => {
  const extension = format === "jpeg" ? "jpg" : "png"
  if (index === undefined) {
    return `chat-export.${extension}`
  }
  return `chat-export-${String(index + 1).padStart(2, "0")}.${extension}`
}

export const MainLayout = () => {
  const exportRef = useRef<HTMLDivElement | null>(null)
  const fullExportRef = useRef<HTMLDivElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const previewConversationRef = useRef<HTMLDivElement | null>(null)
  const previewConversationContentRef = useRef<HTMLDivElement | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const conversation = useConversationStore((state) => state.conversation)
  const layoutId = useConversationStore((state) => state.layoutId)
  const themeId = useConversationStore((state) => state.themeId)
  const editorTheme = useConversationStore((state) => state.editorTheme)
  const activeParticipantId = useConversationStore((state) => state.activeParticipantId)
  const backgroundImageUrl = useConversationStore((state) => state.backgroundImageUrl)
  const backgroundImageOpacity = useConversationStore((state) => state.backgroundImageOpacity)
  const backgroundColor = useConversationStore((state) => state.backgroundColor)
  const ui = useConversationStore((state) => state.ui)
  const previousActivePanelRef = useRef(ui.activePanel)
  const setUi = useConversationStore((state) => state.setUi)
  const exportSettings = useConversationStore((state) => state.exportSettings)
  const setExportSettings = useConversationStore((state) => state.setExportSettings)
  const setTheme = useConversationStore((state) => state.setTheme)
  const setEditorTheme = useConversationStore((state) => state.setEditorTheme)
  const [isQuickExporting, setIsQuickExporting] = useState(false)
  const [quickPreviewUrls, setQuickPreviewUrls] = useState<string[]>([])
  const [quickPreviewError, setQuickPreviewError] = useState<string | null>(null)
  const [isQuickPreviewing, setIsQuickPreviewing] = useState(false)
  const [isQuickPreviewOpen, setIsQuickPreviewOpen] = useState(false)
  const [conversationMetrics, setConversationMetrics] = useState({
    contentHeight: 0,
    viewportHeight: 0,
    fullExportHeight: 0,
    hasOverflow: false,
  })

  const handleQuickExport = async (mode: "download" | "preview") => {
    const target = exportSettings.captureMode === "full" ? fullExportRef.current : exportRef.current
    if (!target) return
    if (mode === "preview") {
      setQuickPreviewUrls([])
      setQuickPreviewError(null)
      setIsQuickPreviewing(true)
      setIsQuickPreviewOpen(true)
    }
    setIsQuickExporting(true)
    try {
      const renderOptions =
        exportSettings.captureMode === "screens"
          ? screenScrollTops.map((top) => ({
              scrollRootOverrides: [{ top }],
            }))
          : [
              {
                offset: exportSettings.captureMode === "full" ? undefined : getPreviewOffset(),
              },
            ]
      const dataUrls = await exportNodeToImageSequence(target, resolvedExportSettings, renderOptions)
      if (mode === "preview") {
        setQuickPreviewUrls(dataUrls)
        return
      }
      dataUrls.forEach((dataUrl, index) => {
        const link = document.createElement("a")
        link.href = dataUrl
        link.download =
          exportSettings.captureMode === "screens"
            ? buildDownloadName(exportSettings.format, index)
            : buildDownloadName(exportSettings.format)
        link.click()
      })
    } catch (error) {
      console.error("Quick export failed", error)
      if (mode === "preview") {
        const message = error instanceof Error ? error.message : "Unknown error"
        setQuickPreviewError(message)
      }
    } finally {
      setIsQuickExporting(false)
      if (mode === "preview") {
        setIsQuickPreviewing(false)
      }
    }
  }

  const layout = layoutConfigs.find((item) => item.id === layoutId) ?? layoutConfigs[0]
  const theme = useMemo(
    () => layout.themes.find((item) => item.id === themeId) ?? layout.themes[0],
    [layout, themeId],
  )
  const hasDark = layout.themes.some((themeEntry) => themeEntry.id === "dark")
  const isDark = themeId === "dark"
  const isEditorDark = editorTheme === "dark"

  useEffect(() => {
    if (typeof document === "undefined") return
    document.documentElement.dataset.editorTheme = editorTheme
  }, [editorTheme])

  useEffect(() => {
    if (typeof window === "undefined") return
    const isSmall = window.matchMedia("(max-width: 1023px)").matches
    if (isSmall) {
      setUi({ activeView: "preview", isSidebarOpen: false })
    }
  }, [setUi])

  useEffect(() => {
    const element = previewContainerRef.current
    if (!element) return

    const updateScale = () => {
      const rect = element.getBoundingClientRect()
      const styles = window.getComputedStyle(element)
      const paddingX =
        parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0")
      const paddingY =
        parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0")
      const width = rect.width - paddingX
      const height = rect.height - paddingY
      if (!width || !height) return
      const scaleX = width / exportSettings.width
      const scaleY = height / exportSettings.height
      const nextScale = Math.min(scaleX, scaleY, 1)
      setFitScale(nextScale > 0 ? nextScale : 1)
    }

    const raf = requestAnimationFrame(updateScale)
    const observer = new ResizeObserver(() => requestAnimationFrame(updateScale))
    observer.observe(element)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [exportSettings.width, exportSettings.height, ui.activeView, ui.autoFit])

  useEffect(() => {
    if (previousActivePanelRef.current !== ui.activePanel && (ui.activeView === "preview" || !ui.isSidebarOpen)) {
      setUi({ activeView: "editor", isSidebarOpen: true })
    }
    previousActivePanelRef.current = ui.activePanel
  }, [setUi, ui.activePanel, ui.activeView, ui.isSidebarOpen])

  useEffect(() => {
    const container = previewConversationRef.current
    const content = previewConversationContentRef.current
    const exportElement = exportRef.current
    if (!container || !content || !exportElement) return

    let frame = 0
    const measureConversation = () => {
      frame = 0
      const viewportHeight = container.clientHeight
      if (!viewportHeight) return
      const contentHeight = Math.ceil(Math.max(content.scrollHeight, content.offsetHeight))
      const chromeHeight = Math.max(0, exportElement.clientHeight - viewportHeight)
      const fullExportHeight = Math.max(exportSettings.height, Math.ceil(chromeHeight + contentHeight))
      const hasOverflow = contentHeight > viewportHeight + 1
      setConversationMetrics((previous) => {
        if (
          previous.contentHeight === contentHeight &&
          previous.viewportHeight === viewportHeight &&
          previous.fullExportHeight === fullExportHeight &&
          previous.hasOverflow === hasOverflow
        ) {
          return previous
        }
        return {
          contentHeight,
          viewportHeight,
          fullExportHeight,
          hasOverflow,
        }
      })
    }
    const scheduleMeasure = () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(measureConversation)
    }

    scheduleMeasure()

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(content)
    observer.observe(exportElement)

    const images = Array.from(content.querySelectorAll("img"))
    images.forEach((image) => {
      image.addEventListener("load", scheduleMeasure)
      image.addEventListener("error", scheduleMeasure)
    })

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
      observer.disconnect()
      images.forEach((image) => {
        image.removeEventListener("load", scheduleMeasure)
        image.removeEventListener("error", scheduleMeasure)
      })
    }
  }, [conversation, exportSettings.height, layout.id, theme.id, ui.showChrome])

  const appliedScale = clamp((ui.autoFit ? fitScale : 1) * ui.zoom, 0.1, 2)
  const scaledWidth = exportSettings.width * appliedScale
  const scaledHeight = exportSettings.height * appliedScale
  const visibleMessageCount = conversation.messages.filter((message) => !message.isHidden).length
  const resolvedExportHeight =
    exportSettings.captureMode === "full"
      ? Math.max(conversationMetrics.fullExportHeight, exportSettings.height)
      : exportSettings.height
  const resolvedExportSettings = useMemo(
    () => ({
      ...exportSettings,
      height: resolvedExportHeight,
    }),
    [exportSettings, resolvedExportHeight],
  )
  const screenScrollTops = useMemo(() => {
    const viewportHeight = Math.round(conversationMetrics.viewportHeight)
    const contentHeight = Math.round(conversationMetrics.contentHeight)
    if (!viewportHeight || !contentHeight) {
      return [0]
    }

    const maxScroll = Math.max(0, contentHeight - viewportHeight)
    if (maxScroll === 0) {
      return [0]
    }

    const positions: number[] = []
    for (let top = 0; top < maxScroll; top += viewportHeight) {
      positions.push(top)
    }
    if (positions[positions.length - 1] !== maxScroll) {
      positions.push(maxScroll)
    }
    return positions
  }, [conversationMetrics.contentHeight, conversationMetrics.viewportHeight])
  const screenCount = Math.max(screenScrollTops.length, 1)
  const getPreviewOffset = () => {
    const scrollElement = previewScrollRef.current
    const exportElement = exportRef.current
    if (!scrollElement || !exportElement || appliedScale === 0) {
      return { x: 0, y: 0 }
    }
    const scrollRect = scrollElement.getBoundingClientRect()
    const exportRect = exportElement.getBoundingClientRect()
    const deltaX = scrollRect.left - exportRect.left
    const deltaY = scrollRect.top - exportRect.top
    const rawX = deltaX / appliedScale
    const rawY = deltaY / appliedScale
    const viewWidth = scrollElement.clientWidth / appliedScale
    const viewHeight = scrollElement.clientHeight / appliedScale
    const maxX = Math.max(0, exportSettings.width - viewWidth)
    const maxY = Math.max(0, exportSettings.height - viewHeight)
    const offsetX = clamp(rawX, 0, maxX)
    const offsetY = clamp(rawY, 0, maxY)
    return {
      x: Number.isFinite(offsetX) ? offsetX : 0,
      y: Number.isFinite(offsetY) ? offsetY : 0,
    }
  }
  const scrollPreviewConversation = (position: "top" | "bottom") => {
    const container = previewConversationRef.current
    if (!container) return
    container.scrollTo({
      top: position === "top" ? 0 : container.scrollHeight,
      behavior: "smooth",
    })
  }

  const panelTabs = [
    {
      id: "participants",
      label: "Participants",
      icon: Users,
      description: "Add people, avatars, and presence details.",
      meta: `${conversation.participants.length} people`,
    },
    {
      id: "messages",
      label: "Messages",
      icon: MessagesSquare,
      description: "Write, reorder, and time the chat flow.",
      meta: `${conversation.messages.length} messages`,
    },
    {
      id: "settings",
      label: "Appearance",
      icon: SlidersHorizontal,
      description: "Pick layout, theme, and background polish.",
      meta: `${layout.name} ${theme.name}`,
    },
    {
      id: "export",
      label: "Export",
      icon: Download,
      description: "Set size, format, and download exports.",
      meta: `${exportSettings.width} x ${exportSettings.height}`,
    },
  ] as const
  const activePanelIndex = panelTabs.findIndex((tab) => tab.id === ui.activePanel)
  const resolvedActivePanelIndex = activePanelIndex === -1 ? 0 : activePanelIndex
  const activePanel = panelTabs[resolvedActivePanelIndex] ?? panelTabs[0]

  const quickPresetIds = new Set(["iphone-14-pro", "ipad", "desktop"])
  const quickPresets: SizePreset[] = sizePresets.filter((preset) => quickPresetIds.has(preset.id))

  return (
    <div
      className={cn(
        "min-h-screen text-[hsl(var(--foreground))]",
        isEditorDark
          ? "bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_26%),linear-gradient(180deg,#0b1220_0%,#111827_45%,#0a0f1a_100%)]"
          : "bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.28),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(191,219,254,0.35),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#f8fafc_45%,#e8eef7_100%)]",
      )}
    >
      <div className="mx-auto flex flex-col gap-6 px-4 pt-6 pb-24 lg:pb-6">
        <Toolbar />

        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Workflow
                </div>
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Step {resolvedActivePanelIndex + 1} of {panelTabs.length}: {activePanel.label}
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{activePanel.description}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {panelTabs.map((tab) => {
                const Icon = tab.icon
                const isActive = ui.activePanel === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setUi({ activePanel: tab.id, activeView: "editor", isSidebarOpen: true })
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                      isActive
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                        : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold",
                        isActive
                          ? "bg-black/10 text-[hsl(var(--primary-foreground))]"
                          : "bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))]",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-medium">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <aside
            className={cn(
              "space-y-6",
              ui.isSidebarOpen && ui.activeView !== "preview" ? "block" : "hidden",
            )}
          >
            <Card>
              <CardContent className="space-y-6">
                {ui.activePanel === "participants" ? <ParticipantManager /> : null}
                {ui.activePanel === "messages" ? <ConversationBuilder /> : null}
                {ui.activePanel === "settings" ? <SettingsPanel /> : null}
                {ui.activePanel === "export" ? (
                  <ExportPanel
                    targetRef={exportSettings.captureMode === "full" ? fullExportRef : exportRef}
                    getExportOffset={
                      exportSettings.captureMode === "full" ? undefined : getPreviewOffset
                    }
                    resolvedHeight={resolvedExportHeight}
                    screenScrollTops={screenScrollTops}
                  />
                ) : null}
              </CardContent>
            </Card>
          </aside>

          <main className={cn("space-y-4", ui.activeView === "editor" && "hidden lg:block")}>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Preview canvas</div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Live view of your layout and message flow.</p>
                  </div>
                  <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUi({ showChrome: !ui.showChrome })}
                    >
                      {ui.showChrome ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      <span className="hidden sm:inline">
                        {ui.showChrome ? "Hide chrome" : "Show chrome"}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUi({ zoom: clamp(ui.zoom - 0.1, 0.5, 2) })}
                    >
                      <Minus className="h-4 w-4" />
                      <span className="hidden sm:inline">Zoom out</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUi({ zoom: clamp(ui.zoom + 0.1, 0.5, 2) })}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Zoom in</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setUi({ zoom: 1 })}>
                      <ScreenShare className="h-4 w-4" />
                      <span className="hidden sm:inline">Reset</span>
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <SquareStack className="h-4 w-4" />
                  Zoom {Math.round(appliedScale * 100)}%
                  {ui.autoFit ? " (auto-fit)" : ""} - Export size {exportSettings.width} x{" "}
                  {resolvedExportHeight}
                  {exportSettings.captureMode === "full" ? " - all messages" : ""}
                </div>
                {conversationMetrics.hasOverflow ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold">
                        Long conversation detected: {visibleMessageCount} visible messages
                      </div>
                      <p className="text-amber-100/80">
                        Scroll inside the phone preview to browse the thread, or jump directly to
                        the start or latest message.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => scrollPreviewConversation("top")}
                      >
                        Jump to top
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => scrollPreviewConversation("bottom")}
                      >
                        Jump to latest
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                <div
                  ref={previewContainerRef}
                  className="flex h-[60vh] items-center justify-center rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 lg:h-[70vh]"
                >
                  <div
                    ref={previewScrollRef}
                    className="hide-scrollbar flex h-full w-full items-start justify-start overflow-auto"
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
                          width: exportSettings.width,
                          height: exportSettings.height,
                          transform: `scale(${appliedScale})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <div
                          ref={exportRef}
                          className="h-full w-full"
                          style={{ width: exportSettings.width, height: exportSettings.height }}
                        >
                          <ChatLayout
                            conversation={conversation}
                            layout={layout}
                            theme={theme}
                            showChrome={ui.showChrome}
                            activeParticipantId={activeParticipantId}
                            backgroundImageUrl={backgroundImageUrl}
                            backgroundImageOpacity={backgroundImageOpacity}
                            backgroundColor={backgroundColor}
                            conversationMode="scroll"
                            conversationContainerRef={previewConversationRef}
                            conversationContentRef={previewConversationContentRef}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Layout
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="w-full sm:w-auto">
                        <LayoutSelector />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-full bg-[hsl(var(--secondary))] px-3 py-1 sm:justify-start">
                        <span className="text-xs font-semibold text-[hsl(var(--foreground))]">Theme</span>
                        <Switch
                          checked={isDark}
                          onCheckedChange={(value) => setTheme(value && hasDark ? "dark" : "light")}
                          disabled={!hasDark}
                        />
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">{isDark ? "Dark" : "Light"}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setUi({ activePanel: "settings", activeView: "editor", isSidebarOpen: true })
                    }
                  >
                    More settings
                  </Button>
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Quick download
                    </div>
                    <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0">
                      {quickPresets.map((preset) => (
                        <Button
                          key={preset.id}
                          variant={exportSettings.presetId === preset.id ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            setExportSettings({
                              presetId: preset.id,
                              width: preset.width,
                              height: preset.height,
                            })
                          }
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        Capture
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={exportSettings.captureMode === "viewport" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExportSettings({ captureMode: "viewport" })}
                        >
                          Current viewport
                        </Button>
                        <Button
                          variant={exportSettings.captureMode === "full" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExportSettings({ captureMode: "full" })}
                        >
                          All messages
                        </Button>
                        <Button
                          variant={exportSettings.captureMode === "screens" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setExportSettings({ captureMode: "screens" })}
                        >
                          {screenCount} screens
                        </Button>
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {exportSettings.captureMode === "full"
                          ? `Exports every visible message in a ${exportSettings.width} x ${resolvedExportHeight}px image.`
                          : exportSettings.captureMode === "screens"
                            ? `Splits the chat into ${screenCount} consecutive device screenshots based on the current export size.`
                            : "Exports the device frame exactly as it appears in the preview."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 2, 3].map((scale) => (
                      <Button
                        key={scale}
                        variant={exportSettings.scale === scale ? "default" : "outline"}
                        size="sm"
                        onClick={() => setExportSettings({ scale })}
                      >
                        {scale}x
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="lg"
                      className="gap-2"
                      disabled={isQuickExporting}
                      onClick={() => handleQuickExport("preview")}
                    >
                      <Image className="h-4 w-4" />
                      Preview
                    </Button>
                    <Button
                      size="lg"
                      className="gap-2"
                      disabled={isQuickExporting}
                      onClick={() => handleQuickExport("download")}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </div>
                <Dialog
                  open={isQuickPreviewOpen}
                  onOpenChange={(open) => {
                    setIsQuickPreviewOpen(open)
                    if (!open) {
                      setQuickPreviewUrls([])
                      setQuickPreviewError(null)
                      setIsQuickPreviewing(false)
                    }
                  }}
                >
                  <DialogContent className="w-[94vw] max-w-5xl max-h-[88vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Export preview</DialogTitle>
                      <DialogDescription>
                        {resolvedExportSettings.width} x {resolvedExportSettings.height} -{" "}
                        {resolvedExportSettings.scale}x -{" "}
                        {resolvedExportSettings.format.toUpperCase()} -{" "}
                        {exportSettings.captureMode === "full"
                          ? "All messages"
                          : exportSettings.captureMode === "screens"
                            ? `${screenCount} subsequent screens`
                            : "Current viewport"}
                      </DialogDescription>
                    </DialogHeader>
                    {isQuickPreviewing ? (
                      <div className="text-sm text-[hsl(var(--muted-foreground))]">Rendering preview...</div>
                    ) : null}
                    {quickPreviewError ? (
                      <div className="text-sm text-red-300">Export failed: {quickPreviewError}</div>
                    ) : null}
                    {quickPreviewUrls.length ? (
                      <div className="space-y-3">
                        {quickPreviewUrls.map((quickPreviewUrl, index) => (
                          <div key={quickPreviewUrl} className="space-y-2">
                            {quickPreviewUrls.length > 1 ? (
                              <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                                Screen {index + 1}
                              </div>
                            ) : null}
                            <img
                              src={quickPreviewUrl}
                              alt={
                                quickPreviewUrls.length > 1
                                  ? `Quick export preview screen ${index + 1}`
                                  : "Quick export preview"
                              }
                              className="max-h-[70vh] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] object-contain"
                            />
                          </div>
                        ))}
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">
                          {quickPreviewUrls.length > 1
                            ? "Download saves one file per screen in order."
                            : "Right click the image to save."}
                        </div>
                      </div>
                    ) : null}
                  </DialogContent>
                </Dialog>
                {exportSettings.captureMode === "full" ? (
                  <div aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0">
                    <div
                      ref={fullExportRef}
                      className="h-full w-full"
                      style={{ width: exportSettings.width, height: resolvedExportHeight }}
                    >
                      <ChatLayout
                        conversation={conversation}
                        layout={layout}
                        theme={theme}
                        showChrome={ui.showChrome}
                        activeParticipantId={activeParticipantId}
                        backgroundImageUrl={backgroundImageUrl}
                        backgroundImageOpacity={backgroundImageOpacity}
                        backgroundColor={backgroundColor}
                        conversationMode="expanded"
                      />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </main>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))]/85 px-4 py-2 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-[hsl(var(--muted-foreground))]">
                Theme
              </span>
            </div>
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
              aria-label="Toggle workspace theme"
            />
            <div className="flex items-center gap-2 text-xs">
              <Moon
                className={cn(
                  "h-4 w-4 transition-colors",
                  isEditorDark
                    ? "text-[hsl(var(--foreground))]"
                    : "text-[hsl(var(--muted-foreground))]",
                )}
              />
              <span className="font-medium text-[hsl(var(--muted-foreground))]">
                {isEditorDark ? "Dark" : "Light"}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://github.com/quead/chat-message-simulator"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                Terms and Conditions
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Terms and Conditions</DialogTitle>
                <DialogDescription>
                  By using this app, you agree to these terms.
                </DialogDescription>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Last updated: 2026-01-03 | Version: 2026-01-03</div>
              </DialogHeader>
              <div className="space-y-4 text-sm text-[hsl(var(--muted-foreground))]">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">What this app does</div>
                  <p>
                    This app lets you compose chat mockups, preview layouts, and export images.
                    All processing happens in your browser.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Data handling and GDPR</div>
                  <p>
                    We do not collect, store, or process personal data on our servers. Your edits
                    and autosaves stay in your browser&apos;s local storage. You can delete them
                    using Clear or by clearing site data in your browser.
                  </p>
                  <p>
                    We do not run analytics or tracking cookies. Because your content does not
                    leave your device, there is no server-side data controller or processor for
                    your content. If you contact us, we will only use your email to respond.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Third-party resources</div>
                  <p>
                    The app may load fonts or user-provided remote images from third-party
                    providers. Those providers may receive standard request data such as IP
                    address and user agent. You can replace assets or block network requests if
                    needed.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Your content</div>
                  <p>
                    You are responsible for the content you enter and export. Do not include
                    sensitive data unless you are comfortable storing it locally. Only use content
                    and assets you have the rights to use.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">No warranties</div>
                  <p>
                    The app is provided &quot;as is&quot; and &quot;as available&quot; without any
                    warranties, express or implied, including accuracy, reliability, availability,
                    or fitness for a particular purpose. Use the app at your own risk.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Limitation of liability</div>
                  <p>
                    To the maximum extent permitted by law, we are not liable for any indirect,
                    incidental, special, consequential, or punitive damages, or any loss of data,
                    profits, or business interruption. Our total liability is limited to the
                    amount you paid for the app, which is zero.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Governing law</div>
                  <p>
                    These terms are governed by the laws of Romania. Any disputes are subject to
                    the exclusive jurisdiction of the courts in Romania.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Contact</div>
                  <p>
                    Questions about these terms or GDPR? Email: queadx@gmail.com
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Changes</div>
                  <p>
                    We may update these terms from time to time. Continued use means you accept
                    the updated terms.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                Privacy Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Privacy Policy</DialogTitle>
                <DialogDescription>
                  This policy explains how data is handled in the app.
                </DialogDescription>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">Last updated: 2026-01-03 | Version: 2026-01-03</div>
              </DialogHeader>
              <div className="space-y-4 text-sm text-[hsl(var(--muted-foreground))]">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Data we collect</div>
                  <p>
                    We do not collect or store your chat content on our servers. Everything you
                    create stays on your device.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Local storage</div>
                  <p>
                    The app uses your browser&apos;s local storage to keep autosaves and settings.
                    You can remove this data with Clear or by clearing site data in your browser.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Third-party requests</div>
                  <p>
                    Fonts and user-provided remote images may be loaded from third-party services.
                    Those providers may receive standard request data such as IP address and user
                    agent. You can block or replace these resources if needed.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">GDPR readiness</div>
                  <p>
                    Because your content does not leave your device, there is no server-side
                    processing of personal data for the app. If you contact us, we only use your
                    email to respond and do not share it.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Contact</div>
                  <p>
                    Privacy questions? Email: queadx@gmail.com
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Changes</div>
                  <p>
                    We may update this policy from time to time. Continued use means you accept
                    the updated policy.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 lg:hidden">
        <div className="rounded-[1.4rem] border border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 p-1 shadow-lg backdrop-blur">
          <div
            role="tablist"
            aria-label="Mobile view mode"
            className="relative grid min-w-[188px] grid-cols-2 items-center"
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 left-0 w-1/2 rounded-[1.1rem] bg-[hsl(var(--primary))] shadow-sm transition-transform duration-200 ease-out",
                ui.activeView === "preview" && "translate-x-full",
              )}
            />
            <button
              type="button"
              role="tab"
              aria-selected={ui.activeView === "editor"}
              className={cn(
                "relative z-10 rounded-[1.1rem] px-5 py-2 text-sm font-semibold transition-colors",
                ui.activeView === "editor"
                  ? "text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))]",
              )}
              onClick={() =>
                setUi({
                  activeView: "editor",
                  isSidebarOpen: true,
                })
              }
            >
              Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ui.activeView === "preview"}
              className={cn(
                "relative z-10 rounded-[1.1rem] px-5 py-2 text-sm font-semibold transition-colors",
                ui.activeView === "preview"
                  ? "text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))]",
              )}
              onClick={() =>
                setUi({
                  activeView: "preview",
                  isSidebarOpen: false,
                })
              }
            >
              Live
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
