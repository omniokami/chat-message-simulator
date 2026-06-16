import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const getManualChunk = (id: string) => {
  if (!id.includes("node_modules")) {
    return undefined
  }
  if (id.includes("node_modules/@radix-ui")) {
    return "radix-ui"
  }
  if (id.includes("node_modules/@dnd-kit")) {
    return "dnd-kit"
  }
  if (id.includes("node_modules/date-fns")) {
    return "date-fns"
  }
  if (id.includes("node_modules/html-to-image")) {
    return "html-to-image"
  }
  if (id.includes("node_modules/lucide-react")) {
    return "lucide"
  }
  if (id.includes("node_modules/zustand")) {
    return "zustand"
  }
  if (id.includes("node_modules/tailwind-merge")) {
    return "tailwind-merge"
  }
  return "vendor"
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isPortableBuild = mode === 'portable'
  const output = isPortableBuild
    ? {
        inlineDynamicImports: true,
      }
    : {
        manualChunks: getManualChunk,
      }

  return {
    base: './',
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: isPortableBuild ? 'dist-portable' : 'dist',
      assetsInlineLimit: isPortableBuild ? Number.MAX_SAFE_INTEGER : undefined,
      cssCodeSplit: !isPortableBuild,
      modulePreload: !isPortableBuild,
      rollupOptions: {
        output,
      },
    },
  }
})
