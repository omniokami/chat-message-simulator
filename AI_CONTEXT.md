# AI Context: Chat Message Simulator

This repo is a React + Vite app for building chat mockups and exporting them as images. The UI has an editor panel (messages/participants/settings/export) and a live preview panel that renders multiple chat layouts.

## What the app does
- Build a conversation with participants and messages.
- Render the conversation in a live preview using a selected layout/theme.
- Export the preview to PNG/JPEG at preset sizes.
- Open a fullscreen Reader Mode for reviewing long conversations.
- Attach image messages, including multi-image posts and spoiler handling.
- Create/load sharing links that point at public GitHub/GitLab JSON save files.

## Development server behavior
- Prefer an already-running app on the default Vite port before launching a new instance.
  - First check `http://127.0.0.1:5173` or `http://localhost:5173`.
  - Use the user's running instance for browser/UI verification when it is reachable and appropriate.
- Start a new dev server only when the default-port app is unavailable, stale, or verification specifically requires an agent-owned instance.
- If an agent starts a dev server, record the URL in the response and shut that instance down after the implementation is verified.
- For larger features or longer verification sessions, clean up agent-started dev servers once the feature is satisfactorily implemented to avoid hanging processes.
- Ask before starting a server on a non-default port unless the user explicitly requested it.

## Key architecture
- Global state: `src/store/conversationStore.ts` (Zustand + persistence).
  - Holds conversation data, layout/theme, UI state, export settings.
  - Persists to IndexedDB through `src/utils/idb-storage.ts` and migrates the legacy `chat-sim-storage` localStorage value.
  - Store hydration is gated in `src/App.tsx`; avoid rendering UI that assumes persisted state before hydration finishes.
- Layout config: `src/constants/layouts.ts`.
  - Defines supported layouts and their themes/colors/fonts.
- Layout render: `src/components/layout/ChatLayout.tsx`.
  - Applies CSS variables and renders header, conversation, input.
- Shared preview/reader/export viewport: `src/components/chat/ConversationViewport.tsx` + `src/hooks/useConversationViewport.ts`.
  - Owns device frame sizing, auto-fit, zoom, scroll metrics, long-thread detection, and screen-splitting offsets.
- Reader mode: `src/components/reader/ReaderMode.tsx`.
  - Fullscreen review mode with its own header, JSON load action, chrome toggle, jump controls, and image viewer.
- Image viewer: `src/components/reader/ReaderImageViewer.tsx` + `src/hooks/useConversationImageViewer.ts`.
  - Used from preview and reader flows; supports participant filters, thumbnails, keyboard/click navigation, open/download, and go-to-message.

## Current supported layouts
- WhatsApp (light/dark).
- iMessage (light/dark).
- Snapchat (light/dark) with left-border message style.
- Messenger (light/dark).
- Instagram (light/dark).
- Tinder (light/dark).

Removed layouts: Telegram, Slack, Discord, Generic.

## Message images and spoilers
- `Message.type` includes `"image"`.
- Current image messages use `message.images?: MessageImage[]` with `MAX_MESSAGE_IMAGES = 5` in `src/utils/messageImages.ts`.
- Legacy primary-image fields (`imageUrl`, `imageWidth`, `imageHeight`, `isSpoiler`, `exportSpoiler`) still exist for compatibility and are populated from the first image on submit.
- Always use `getMessageImages(message)` instead of reading image fields directly; it normalizes modern `images[]` and legacy single-image messages.
- `MessageForm` uses `@dnd-kit` to reorder image uploads and stores per-image `isSpoiler` / `exportSpoiler`.
- `MessageBubble` renders single-image and multi-image grids, spoiler reveal/hide controls, and data attributes consumed by export.
- Spoiler blur is controlled by `spoilerBlur` in the store and normalized by `src/constants/spoiler.ts`.

## Layout-specific behavior (important)
- Layout-specific styling is keyed off `layout.id` in:
  - `src/components/chat/ChatHeader.tsx`
  - `src/components/chat/MessageInput.tsx`
  - `src/components/chat/ConversationView.tsx`
  - `src/components/chat/MessageBubble.tsx`
- `ChatLayout` adds `layout-${id}` class + `data-layout` for CSS scoping.
- `src/index.css` has layout-scoped CSS (e.g. WhatsApp bubble tails).

## Editor behavior
- Conversation builder: `src/components/editor/ConversationBuilder.tsx`.
  - Inline "quick edit" expands under a message row.
  - Advanced fields can be toggled in `MessageForm`.
  - Add message form is collapsible and placed at the bottom.
  - Message actions include duplicate to start/end/next, visibility, and timestamp helpers.
- Participants have two separate concepts:
  - `activeParticipantId`: default sender for new messages.
  - `viewParticipantId`: perspective used by preview/reader/export rendering.
- Conversations with more than two participants can use `conversation.groupName`.

## Mobile behavior
- Mobile uses a fixed bottom switch to toggle Edit/Live.
  - See `src/components/layout/MainLayout.tsx`.
  - Extra bottom padding is added for mobile so the switch does not overlap content.
- Toolbar "Panels" button removed; mobile uses the switch only.

## Fonts
- Live preview uses Roboto by default (imported in `src/index.css`).
- Layout configs can still specify fallback fonts.

## Export
- Export logic in `src/utils/export.ts`.
- Export panel in `src/components/export/ExportPanel.tsx`.
- Export capture modes are `viewport`, `full`, and `screens`.
  - `viewport`: current visible device frame.
  - `full`: one tall image containing all visible messages.
  - `screens`: sequence of consecutive device-sized screenshots based on measured scroll positions.
- Export settings include `revealImageSpoilers` and `showSpoilerIconOnRevealedImages`.
- Export clones rely on `data-image-spoiler`, `data-export-spoiler`, `data-spoiler-image`, `data-spoiler-cover-overlay`, `data-export-spoiler-corner`, and `data-spoiler-reveal-control`; keep these attributes intact when changing image/spoiler rendering.

## Sharing and releases
- Save/import validation lives in `src/utils/storage.ts`.
- Sharing helpers live in `src/utils/sharing.ts`.
  - Trusted sources are HTTPS GitHub/GitLab JSON files.
  - Generated links encode source URLs as `e_...` (open editor) or `r_...` (open Reader Mode) path tokens.
  - `MainLayout` parses sharing links on load; `Toolbar` creates and loads them.
- Portable release build: `npm run build:web-release`.
  - Vite portable mode outputs `dist-portable`, inlines assets, and `scripts/inline-web-release.mjs` produces a single-file-friendly release.
- GitHub Pages deploy is in `.github/workflows/deploy-pages.yml` and builds the portable release with a `404.html` fallback.

## File map (high signal)
- `src/store/conversationStore.ts`: state + persistence.
- `src/constants/layouts.ts`: layout/theme definitions.
- `src/components/layout/ChatLayout.tsx`: core preview renderer.
- `src/components/chat/ConversationViewport.tsx`: shared preview/reader device viewport shell.
- `src/components/chat/*`: header, message list, input, bubbles.
- `src/components/editor/*`: message/participant editors.
- `src/components/layout/MainLayout.tsx`: page layout + mobile controls.
- `src/components/reader/*`: fullscreen reader mode and image viewer.
- `src/hooks/useConversationViewport.ts`: viewport sizing, measuring, scrolling, screen offsets.
- `src/hooks/useConversationImageViewer.ts`: image collection, viewer state, and go-to-message behavior.
- `src/utils/messageImages.ts`: image-message normalization and max image count.
- `src/utils/sharing.ts`: trusted source URL normalization and share-link encoding.
- `src/utils/idb-storage.ts`: IndexedDB storage adapter for Zustand persist.

## Notes for changes
- Keep layout-specific styling scoped by `layout.id` checks or `layout-<id>` CSS.
- Avoid breaking non-target layouts when adjusting one layout.
- Prefer small, explicit UI changes over large refactors.
- Prefer shared `ConversationViewport` / `useConversationViewport` logic for preview, reader, and export changes instead of duplicating sizing or scroll math.
- When changing image messages, preserve compatibility between `images[]` and legacy primary-image fields.
- When adding persisted store fields, update `migrate`, `partialize`, snapshot/history shape, JSON import/export appearance, and any sharing behavior if relevant.
- When changing sharing, keep the trusted-source restrictions explicit unless the user asks to expand them.
