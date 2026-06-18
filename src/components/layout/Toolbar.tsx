import { useEffect, useRef, useState } from "react"
import {
  Check,
  Copy,
  FileDown,
  FileUp,
  Link2,
  Loader2,
  MoreHorizontal,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react"
import { useConversationStore } from "@/store/conversationStore"
import { getLayoutConfig } from "@/constants/layouts"
import { downloadJson, loadConversationData, readJsonFile } from "@/utils/storage"
import {
  createSharingLink,
  fetchSharedConversation,
  normalizeTrustedSourceUrl,
  parseSharingLink,
  resolveSharedSourceUrl,
} from "@/utils/sharing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getMessageImages } from "@/utils/messageImages"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type StoreState = ReturnType<typeof useConversationStore.getState>

interface ToolbarProps {
  onOpenReader?: () => void
}

const hasPersistedChange = (state: StoreState, prevState: StoreState) =>
  state.conversation !== prevState.conversation ||
  state.layoutId !== prevState.layoutId ||
  state.themeId !== prevState.themeId ||
  state.activeParticipantId !== prevState.activeParticipantId ||
  state.viewParticipantId !== prevState.viewParticipantId ||
  state.backgroundImageUrl !== prevState.backgroundImageUrl ||
  state.backgroundImageOpacity !== prevState.backgroundImageOpacity ||
  state.backgroundColor !== prevState.backgroundColor ||
  state.spoilerBlur !== prevState.spoilerBlur ||
  state.exportSettings !== prevState.exportSettings

const formatRelativeTime = (from: number, to: number) => {
  const diffSeconds = Math.max(0, Math.floor((to - from) / 1000))
  if (diffSeconds < 5) return "just now"
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.left = "-9999px"
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand("copy")
  textarea.remove()
}

export const Toolbar = ({ onOpenReader }: ToolbarProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const copyTimeoutRef = useRef<number | null>(null)
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isCreateShareOpen, setIsCreateShareOpen] = useState(false)
  const [isLoadLinkOpen, setIsLoadLinkOpen] = useState(false)
  const [createShareUrl, setCreateShareUrl] = useState("")
  const [createShareOpenInReader, setCreateShareOpenInReader] = useState(false)
  const [createShareResult, setCreateShareResult] = useState("")
  const [createShareError, setCreateShareError] = useState<string | null>(null)
  const [isCreateShareGenerating, setIsCreateShareGenerating] = useState(false)
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle")
  const [loadLinkUrl, setLoadLinkUrl] = useState("")
  const [loadLinkOpenInReader, setLoadLinkOpenInReader] = useState(false)
  const [loadLinkError, setLoadLinkError] = useState<string | null>(null)
  const [isLoadingFromLink, setIsLoadingFromLink] = useState(false)
  const conversation = useConversationStore((state) => state.conversation)
  const layoutId = useConversationStore((state) => state.layoutId)
  const themeId = useConversationStore((state) => state.themeId)
  const activeParticipantId = useConversationStore((state) => state.activeParticipantId)
  const viewParticipantId = useConversationStore((state) => state.viewParticipantId)
  const backgroundImageUrl = useConversationStore((state) => state.backgroundImageUrl)
  const backgroundImageOpacity = useConversationStore((state) => state.backgroundImageOpacity)
  const backgroundColor = useConversationStore((state) => state.backgroundColor)
  const spoilerBlur = useConversationStore((state) => state.spoilerBlur)
  const loadConversation = useConversationStore((state) => state.loadConversation)
  const resetConversation = useConversationStore((state) => state.resetConversation)
  const saveSnapshot = useConversationStore((state) => state.saveSnapshot)
  const clearSnapshot = useConversationStore((state) => state.clearSnapshot)
  const setUi = useConversationStore((state) => state.setUi)
  const lastAutosaveAt = useConversationStore((state) => state.lastAutosaveAt)
  const setLastAutosaveAt = useConversationStore((state) => state.setLastAutosaveAt)
  const undo = useConversationStore((state) => state.undo)
  const redo = useConversationStore((state) => state.redo)
  const canUndo = useConversationStore((state) => state.history.past.length > 0)
  const canRedo = useConversationStore((state) => state.history.future.length > 0)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const unsubscribe = useConversationStore.subscribe((state, prevState) => {
      if (!prevState) return
      if (hasPersistedChange(state, prevState)) {
        setLastAutosaveAt(Date.now())
      }
    })
    return () => unsubscribe()
  }, [setLastAutosaveAt])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName
        if (tagName === "INPUT" || tagName === "TEXTAREA" || target.isContentEditable) {
          return
        }
      }
      const isModifier = event.ctrlKey || event.metaKey
      if (!isModifier) return
      const key = event.key.toLowerCase()
      if (key === "z") {
        if (event.shiftKey) {
          if (canRedo) redo()
        } else if (canUndo) {
          undo()
        }
        event.preventDefault()
      } else if (key === "y") {
        if (canRedo) redo()
        event.preventDefault()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canRedo, canUndo, redo, undo])

  const resetCreateShareDialog = () => {
    setCreateShareUrl("")
    setCreateShareOpenInReader(false)
    setCreateShareResult("")
    setCreateShareError(null)
    setIsCreateShareGenerating(false)
    setCopyState("idle")
  }

  const resetLoadLinkDialog = () => {
    setLoadLinkUrl("")
    setLoadLinkOpenInReader(false)
    setLoadLinkError(null)
    setIsLoadingFromLink(false)
  }

  const handleGenerateSharingLink = async () => {
    setIsCreateShareGenerating(true)
    setCreateShareError(null)
    setCreateShareResult("")
    setCopyState("idle")

    try {
      const sourceUrl = normalizeTrustedSourceUrl(createShareUrl)
      await fetchSharedConversation(sourceUrl)
      setCreateShareUrl(sourceUrl)
      setCreateShareResult(createSharingLink(sourceUrl, createShareOpenInReader))
    } catch (error) {
      setCreateShareError(getErrorMessage(error, "Could not create a sharing link."))
    } finally {
      setIsCreateShareGenerating(false)
    }
  }

  const handleCopySharingLink = async () => {
    if (!createShareResult) return

    try {
      await copyTextToClipboard(createShareResult)
      setCopyState("copied")
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopyState("idle"), 1800)
    } catch (error) {
      setCreateShareError(getErrorMessage(error, "Could not copy the sharing link."))
    }
  }

  const handleLoadLinkChange = (value: string) => {
    setLoadLinkUrl(value)
    setLoadLinkError(null)

    const sharingPayload = parseSharingLink(value)
    setLoadLinkOpenInReader(sharingPayload?.openInReader ?? false)
  }

  const openLoadedConversationMode = () => {
    if (loadLinkOpenInReader) {
      onOpenReader?.()
      return
    }

    setUi({ activeView: "editor", isSidebarOpen: true })
  }

  const handleLoadFromLink = async () => {
    setIsLoadingFromLink(true)
    setLoadLinkError(null)

    try {
      const sourceUrl = resolveSharedSourceUrl(loadLinkUrl)
      const data = await fetchSharedConversation(sourceUrl)
      loadConversationData(data, loadConversation)
      setLastAutosaveAt(Date.now())
      openLoadedConversationMode()
      setIsLoadLinkOpen(false)
      resetLoadLinkDialog()
    } catch (error) {
      setLoadLinkError(getErrorMessage(error, "Could not load from this link."))
    } finally {
      setIsLoadingFromLink(false)
    }
  }

  const autosaveLabel = lastAutosaveAt
    ? `Autosaved ${formatRelativeTime(lastAutosaveAt, now)}`
    : "Autosave idle"
  const layout = getLayoutConfig(layoutId)
  const theme = layout.themes.find((entry) => entry.id === themeId) ?? layout.themes[0]
  const imageMessageCount = conversation.messages.reduce(
    (count, message) => count + getMessageImages(message).length,
    0,
  )
  const projectBadges = [
    `${conversation.participants.length} participants`,
    `${conversation.messages.length} messages`,
    `${imageMessageCount} images`,
    `${layout.name} ${theme.name}`,
  ]

  return (
    <TooltipProvider>
      <div className="workspace-toolbar-shadow flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary-foreground))]">
            CS
          </div>
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Chat Message Simulator</div>
            <div className="text-xs text-[hsl(var(--muted-foreground))]">Craft and export chat mockups</div>
            <div className="hidden flex-wrap items-center gap-2 pt-1 sm:flex">
              {projectBadges.map((badge) => (
                <Badge key={badge} variant="secondary">
                  {badge}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Badge variant="secondary">{autosaveLabel}</Badge>

          <div className="flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-1 shadow-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={undo}
                  disabled={!canUndo}
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Undo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl/Cmd+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={redo}
                  disabled={!canRedo}
                  aria-label="Redo"
                >
                  <Redo2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Redo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)</TooltipContent>
            </Tooltip>
          </div>

          <Dialog open={isActionsOpen} onOpenChange={setIsActionsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <MoreHorizontal className="h-4 w-4" />
                Actions
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Project actions</DialogTitle>
                <DialogDescription>
                  Manage files, local storage, and project utilities.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    File
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        downloadJson(
                          {
                            conversation,
                            layoutId,
                            themeId,
                            activeParticipantId,
                            viewParticipantId,
                            backgroundImageUrl,
                            backgroundImageOpacity,
                            backgroundColor,
                            spoilerBlur,
                          },
                          "conversation.json",
                        )
                        setIsActionsOpen(false)
                      }}
                    >
                      <FileDown className="h-4 w-4" />
                      Export JSON
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsActionsOpen(false)
                        fileInputRef.current?.click()
                      }}
                    >
                      <FileUp className="h-4 w-4" />
                      Load JSON
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        saveSnapshot()
                        setLastAutosaveAt(Date.now())
                        setIsActionsOpen(false)
                      }}
                    >
                      <Save className="h-4 w-4" />
                      Save Local
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Sharing
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsActionsOpen(false)
                        setIsCreateShareOpen(true)
                      }}
                    >
                      <Link2 className="h-4 w-4" />
                      Create sharing link
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsActionsOpen(false)
                        setIsLoadLinkOpen(true)
                      }}
                    >
                      <FileUp className="h-4 w-4" />
                      Load from link
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Utilities
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setIsActionsOpen(false)
                        setIsResetOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Reset project
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset this project?</DialogTitle>
                <DialogDescription>
                  This clears the current conversation, layout, and stored snapshot. You can&apos;t undo this action.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setIsResetOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    resetConversation()
                    clearSnapshot()
                    setIsResetOpen(false)
                  }}
                >
                  Reset project
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={isCreateShareOpen}
            onOpenChange={(open) => {
              setIsCreateShareOpen(open)
              if (!open) {
                resetCreateShareDialog()
              }
            }}
          >
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Create sharing link</DialogTitle>
                <DialogDescription>
                  Generate an app link from a public GitHub or GitLab JSON save file.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleGenerateSharingLink()
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="create-share-url">JSON save file URL</Label>
                  <Input
                    id="create-share-url"
                    value={createShareUrl}
                    onChange={(event) => {
                      setCreateShareUrl(event.target.value)
                      setCreateShareError(null)
                      setCreateShareResult("")
                      setCopyState("idle")
                    }}
                    placeholder="https://github.com/owner/repo/blob/main/conversation.json"
                    disabled={isCreateShareGenerating}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2">
                  <Label htmlFor="create-share-reader-mode">Open in Reader Mode</Label>
                  <Switch
                    id="create-share-reader-mode"
                    checked={createShareOpenInReader}
                    onCheckedChange={(value) => {
                      setCreateShareOpenInReader(value)
                      setCreateShareResult("")
                      setCopyState("idle")
                    }}
                    disabled={isCreateShareGenerating}
                  />
                </div>
                {createShareError ? (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {createShareError}
                  </div>
                ) : null}
                {createShareResult ? (
                  <div className="space-y-2">
                    <Label htmlFor="generated-share-url">Sharing link</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="generated-share-url"
                        value={createShareResult}
                        readOnly
                        className="font-mono text-xs"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <Button type="button" variant="outline" onClick={handleCopySharingLink}>
                        {copyState === "copied" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copyState === "copied" ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateShareOpen(false)}
                    disabled={isCreateShareGenerating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreateShareGenerating}>
                    {isCreateShareGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Generate
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={isLoadLinkOpen}
            onOpenChange={(open) => {
              setIsLoadLinkOpen(open)
              if (!open) {
                resetLoadLinkDialog()
              }
            }}
          >
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Load from link</DialogTitle>
                <DialogDescription>
                  Open a GitHub or GitLab JSON save file, or a sharing link generated by this app.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleLoadFromLink()
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="load-link-url">Project link</Label>
                  <Input
                    id="load-link-url"
                    value={loadLinkUrl}
                    onChange={(event) => handleLoadLinkChange(event.target.value)}
                    placeholder="https://github.com/owner/repo/blob/main/conversation.json"
                    disabled={isLoadingFromLink}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-2">
                  <Label htmlFor="load-link-reader-mode">Open in Reader Mode</Label>
                  <Switch
                    id="load-link-reader-mode"
                    checked={loadLinkOpenInReader}
                    onCheckedChange={setLoadLinkOpenInReader}
                    disabled={isLoadingFromLink}
                  />
                </div>
                {loadLinkError ? (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {loadLinkError}
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsLoadLinkOpen(false)}
                    disabled={isLoadingFromLink}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoadingFromLink}>
                    {isLoadingFromLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="h-4 w-4" />
                    )}
                    Load
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
            } catch (error) {
              console.error("Failed to import JSON", error)
            } finally {
              event.target.value = ""
            }
          }}
        />
      </div>
    </TooltipProvider>
  )
}
