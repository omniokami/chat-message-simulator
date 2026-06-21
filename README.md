# 💬 Chat Message Simulator

> A powerful React application for creating, customizing, reviewing, sharing, and exporting high-quality chat conversation mockups.

## 🌐 Live Demo

**[Try it now at https://omniokami.github.io/omni-chats/](https://omniokami.github.io/omni-chats/)**

## 🙏 Credits

This repository is based on the original [quead/chat-message-simulator](https://github.com/quead/chat-message-simulator) project.

## ✨ Features

- **🎨 Multiple Layouts**: Authentic recreations of popular messaging apps including WhatsApp, iMessage, Snapchat, Facebook Messenger, Instagram, and Tinder.
- **🌓 Light & Dark Modes**: Full support for light and dark chat themes across all layouts, plus a separate light/dark workspace theme.
- **⚡ Live Preview**: Real-time rendering of your conversation as you build it, with auto-fit, zoom controls, chrome toggles, and long-thread jump controls.
- **📖 Reader Mode**: Open a fullscreen review view for long conversations, load JSON files directly, hide/show the reader toolbar, and jump between the top and latest messages.
- **🖼️ Image Messages**: Add image messages with captions, upload up to five images per message, reorder image posts with drag and drop, and inspect images in a fullscreen viewer.
- **🙈 Spoiler Controls**: Mark individual images as spoilers, tune the blur strength, reveal or hide spoilers in the preview, and choose how spoilers behave during export.
- **📸 Flexible Export**: Download PNG or JPEG output using device presets, custom sizes, 1x/2x/3x/5x/8x scaling, preview-before-download, and capture modes for the current viewport, all visible messages, or consecutive screens.
- **🔗 Sharing Links**: Create and load app links from public GitHub or GitLab JSON save files, with links that can open either the editor or Reader Mode.
- **💾 Project Persistence**: Autosaves locally through IndexedDB, supports JSON import/export, keeps appearance settings in save files, and includes undo/redo history.
- **👥 Participant Management**: Add multiple users with custom avatars, names, colors, statuses, verified badges, group names, sender defaults, and a separate "View as" preview perspective.
- **✍️ Message Editing**: Drag messages to reorder, use easy mode for bulk text entry, duplicate messages to the start/end/next position, hide messages, and apply global date/time helpers.
- **🧩 Appearance Controls**: Customize layout, theme, background color, uploaded background image, opacity, preview zoom, and whether the rendered chat shows app chrome.
- **📱 Responsive Design**: Works on desktop and mobile devices, with a mobile Edit/Live switch for the editor and preview.

## 📱 Supported Platforms

| Platform | Light Mode | Dark Mode |
|----------|------------|-----------|
| **WhatsApp** | ✅ | ✅ |
| **iMessage** | ✅ | ✅ |
| **Facebook Messenger** | ✅ | ✅ |
| **Snapchat** | ✅ | ✅ |
| **Tinder** | ✅ | ✅ |
| **Instagram** | ✅ | ✅ |

## 🛠️ Tech Stack

Built with modern web technologies for performance and developer experience:

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) & [Lucide React](https://lucide.dev/)
- **Drag & Drop**: [dnd kit](https://dndkit.com/)
- **Export**: [html-to-image](https://github.com/bubkoo/html-to-image)
- **Storage**: IndexedDB-backed Zustand persistence with JSON import/export

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm, yarn, or pnpm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/omniokami/chat-message-simulator.git
   cd chat-message-simulator
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## 📦 Scripts

- **`npm run dev`**: Start the Vite development server.
- **`npm run build`**: Type-check and build the standard production bundle.
- **`npm run build:web-release`**: Build the portable web release in `dist-portable` and inline assets for single-file-friendly hosting.
- **`npm run preview`**: Preview the production build locally.
- **`npm run lint`**: Run ESLint across the project.

## 📂 Project Structure

```
src/
├── assets/            # Static assets
├── components/
│   ├── chat/          # Chat visualization, bubbles, and shared viewport
│   ├── editor/        # Message and participant editing interface
│   ├── export/        # Export settings and size presets
│   ├── layout/        # App shell, toolbar, settings, and preview layout
│   ├── reader/        # Fullscreen Reader Mode and image viewer
│   └── ui/            # Reusable UI components (Radix + Tailwind)
├── constants/         # Layout definitions, export presets, and spoiler config
├── hooks/             # Shared viewport and image viewer behavior
├── layouts/           # Platform-specific layout wrappers
├── store/             # Global state, history, and persistence (Zustand)
├── types/             # Conversation, message, and layout types
└── utils/             # Export, storage, sharing, image, and helper functions
```

## 🌍 Sharing & Releases

- JSON saves can be downloaded locally or loaded back into the editor.
- Sharing links point to trusted public GitHub/GitLab `.json` files and can open directly in the editor or Reader Mode.
- GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`.
- Portable release builds use `npm run build:web-release` and output to `dist-portable`.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the Apache License 2.0 License - see the LICENSE file for details.
