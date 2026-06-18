import { useState } from "react"
import { Eye, ImagePlus, Star, Trash2, X } from "lucide-react"
import type { ParticipantStatus } from "@/types/conversation"
import { useConversationStore } from "@/store/conversationStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { VerifiedBadge } from "@/components/ui/verified-badge"
import { cn } from "@/utils/cn"
import { readFileAsDataUrl } from "@/utils/helpers"

const emptyParticipant = {
  name: "",
  avatarUrl: "",
  isVerified: false,
  status: "online" as ParticipantStatus,
  color: "#22c55e",
}

export const ParticipantManager = () => {
  const participants = useConversationStore((state) => state.conversation.participants)
  const activeParticipantId = useConversationStore((state) => state.activeParticipantId)
  const viewParticipantId = useConversationStore((state) => state.viewParticipantId)
  const addParticipant = useConversationStore((state) => state.addParticipant)
  const updateParticipant = useConversationStore((state) => state.updateParticipant)
  const removeParticipant = useConversationStore((state) => state.removeParticipant)
  const setActiveParticipant = useConversationStore((state) => state.setActiveParticipant)
  const setViewParticipant = useConversationStore((state) => state.setViewParticipant)

  const [draft, setDraft] = useState(emptyParticipant)
  const [error, setError] = useState<string | null>(null)

  const validateFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return "Only image files are allowed."
    }
    if (file.size > 2 * 1024 * 1024) {
      return "Image must be smaller than 2MB."
    }
    return null
  }

  const handleUpload = async (participantId: string, file: File) => {
    const errorMessage = validateFile(file)
    if (errorMessage) {
      setError(errorMessage)
      return
    }
    setError(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      updateParticipant(participantId, { avatarUrl: dataUrl })
    } catch (error) {
      console.error("Failed to read avatar file", error)
      setError("Could not read the selected image.")
    }
  }

  const handleDraftUpload = async (file: File) => {
    const errorMessage = validateFile(file)
    if (errorMessage) {
      setError(errorMessage)
      return
    }
    setError(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setDraft((prev) => ({ ...prev, avatarUrl: dataUrl }))
    } catch (error) {
      console.error("Failed to read avatar file", error)
      setError("Could not read the selected image.")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Participants</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Manage contacts, avatars, sender defaults, and preview perspective.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className={cn(
              "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm",
              activeParticipantId === participant.id && "ring-2 ring-cyan-400/25",
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                {participant.avatarUrl ? (
                  <>
                    <img
                      src={participant.avatarUrl}
                      alt={participant.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -top-1 -left-1 h-6 w-6 rounded-full bg-[hsl(var(--card))] shadow"
                      onClick={() => updateParticipant(participant.id, { avatarUrl: undefined })}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove avatar</span>
                    </Button>
                  </>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                    {participant.name.slice(0, 2).toUpperCase() || "??"}
                  </div>
                )}
                {participant.isVerified ? (
                  <span className="absolute -top-1 -right-1 rounded-full bg-[hsl(var(--card))] p-0.5 shadow">
                    <VerifiedBadge className="h-3.5 w-3.5" />
                  </span>
                ) : null}
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full bg-[hsl(var(--card))] shadow"
                >
                  <label htmlFor={`avatar-${participant.id}`}>
                    <ImagePlus className="h-3.5 w-3.5" />
                  </label>
                </Button>
                <input
                  id={`avatar-${participant.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    await handleUpload(participant.id, file)
                    event.target.value = ""
                  }}
                />
              </div>

              <div className="flex-1 space-y-2">
                <Input
                  value={participant.name}
                  onChange={(event) => updateParticipant(participant.id, { name: event.target.value })}
                  placeholder="Name"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={participant.status}
                    onValueChange={(value) =>
                      updateParticipant(participant.id, { status: value as ParticipantStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="typing">Typing</SelectItem>
                      <SelectItem value="empty">Empty</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="color"
                    value={participant.color}
                    onChange={(event) => updateParticipant(participant.id, { color: event.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2">
                  <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Verified</span>
                  <Switch
                    checked={Boolean(participant.isVerified)}
                    onCheckedChange={(value) => updateParticipant(participant.id, { isVerified: value })}
                  />
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-[auto_auto] grid-rows-2 items-center gap-x-2 gap-y-2">
                <Button
                  variant={activeParticipantId === participant.id ? "default" : "outline"}
                  size="sm"
                  className={cn("col-start-1 row-start-1", activeParticipantId === participant.id && "border border-transparent")}
                  onClick={() => setActiveParticipant(participant.id)}
                >
                  <Star className="h-4 w-4" />
                  Active
                </Button>
                <Button
                  variant={viewParticipantId === participant.id ? "default" : "outline"}
                  size="sm"
                  className={cn("col-start-1 row-start-2", viewParticipantId === participant.id && "border border-transparent")}
                  onClick={() => setViewParticipant(participant.id)}
                >
                  <Eye className="h-4 w-4" />
                  View as
                </Button>
                <Button variant="ghost" size="icon" className="col-start-2 row-span-2 row-start-1 self-center" onClick={() => removeParticipant(participant.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 p-3">
        <Label className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Add new participant</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={draft.name}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Participant name"
          />
          <Button
            onClick={() => {
              if (!draft.name.trim()) {
                setError("Name is required.")
                return
              }
              addParticipant({
                name: draft.name.trim(),
                avatarUrl: draft.avatarUrl || undefined,
                isVerified: draft.isVerified,
                status: draft.status,
                color: draft.color,
              })
              setDraft(emptyParticipant)
              setError(null)
            }}
          >
            Add
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <label htmlFor="avatar-draft" className="flex items-center gap-2">
              <ImagePlus className="h-4 w-4" />
              Upload avatar
            </label>
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-2 py-1">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Verified badge</span>
            <Switch
              checked={Boolean(draft.isVerified)}
              onCheckedChange={(value) => setDraft((prev) => ({ ...prev, isVerified: value }))}
            />
          </div>
          {draft.avatarUrl ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft((prev) => ({ ...prev, avatarUrl: "" }))}
            >
              Remove avatar
            </Button>
          ) : null}
          <Input
            type="color"
            value={draft.color}
            onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
          />
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Uploads only (best for exports)</span>
          <input
            id="avatar-draft"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              await handleDraftUpload(file)
              event.target.value = ""
            }}
          />
        </div>
      </div>
    </div>
  )
}
