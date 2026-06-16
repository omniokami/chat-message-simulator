import { toJpeg, toPng } from "html-to-image"
import type { ExportSettings } from "../store/conversationStore"
import { normalizeSpoilerBlur } from "../constants/spoiler"

const IMAGE_LOAD_TIMEOUT_MS = 3000
const EXPORT_TIMEOUT_MS = 20000

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, message: string) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })

interface ExportRenderOptions {
  offset?: { x: number; y: number }
  scrollRootOverrides?: Array<{
    index?: number
    top?: number
    left?: number
  }>
}

const applyExportSpoilerState = (clone: HTMLElement, revealImageSpoilers: boolean, showSpoilerIconOnRevealedImages: boolean) => {
  const spoilerFrames = Array.from(
    clone.querySelectorAll<HTMLElement>('[data-image-spoiler="true"]'),
  )

  spoilerFrames.forEach((frame) => {
    const image = frame.querySelector<HTMLElement>('[data-spoiler-image="true"]')
    const shouldSpoiler = !revealImageSpoilers && frame.dataset.exportSpoiler === "true"
    const coverOverlay = frame.querySelector<HTMLElement>('[data-spoiler-cover-overlay="true"]')
    const exportOverlay = frame.querySelector<HTMLElement>('[data-export-spoiler-overlay="true"]')
    const exportCorner = frame.querySelector<HTMLElement>('[data-export-spoiler-corner="true"]')

    if (shouldSpoiler) {
      frame
        .querySelectorAll<HTMLElement>('[data-spoiler-reveal-control="true"]')
        .forEach((control) => control.remove())
      exportCorner?.remove()

      if (image) {
        const blur = normalizeSpoilerBlur(Number(frame.dataset.spoilerBlur))
        image.style.filter = `blur(${blur}px)`
      }

      const overlay = coverOverlay ?? exportOverlay
      if (overlay) {
        overlay.classList.remove("hidden")
        overlay.classList.add("flex")
        overlay.style.display = ""
      }
      if (coverOverlay && exportOverlay && coverOverlay !== exportOverlay) {
        exportOverlay.remove()
      }
      return
    }

    if (image) {
      image.style.filter = "none"
    }
    coverOverlay?.remove()
    exportOverlay?.remove()
    if (exportCorner) {
      if (showSpoilerIconOnRevealedImages) {
        exportCorner.classList.remove("hidden")
        exportCorner.classList.add("flex")
        exportCorner.style.display = ""
      } else {
        exportCorner?.remove()
      }
    }
  })
}

const waitForImages = async (node: HTMLElement) => {
  const images = Array.from(node.querySelectorAll("img"))
  await Promise.all(
    images.map((image) => {
      if (image.loading === "lazy") {
        image.loading = "eager"
      }
      image.decoding = "async"
      if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve()
      }
      if (image.complete && !image.decode) {
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        let settled = false
        let timeoutId = 0
        const finish = () => {
          if (settled) return
          settled = true
          window.clearTimeout(timeoutId)
          image.removeEventListener("load", finish)
          image.removeEventListener("error", finish)
          resolve()
        }
        timeoutId = window.setTimeout(finish, IMAGE_LOAD_TIMEOUT_MS)
        image.addEventListener("load", finish)
        image.addEventListener("error", finish)
        if (image.decode) {
          image.decode().then(finish).catch(finish)
        }
      })
    }),
  )
}

const buildExportClone = (
  node: HTMLElement,
  settings: ExportSettings,
  options?: ExportRenderOptions,
) => {
  const wrapper = document.createElement("div")
  wrapper.setAttribute("aria-hidden", "true")
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  })

  const clone = node.cloneNode(true) as HTMLElement
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)
  applyExportSpoilerState(clone, settings.revealImageSpoilers, settings.showSpoilerIconOnRevealedImages)

  const sourceScrollRoots = Array.from(
    node.querySelectorAll<HTMLElement>('[data-conversation-scroll-root="true"]'),
  )
  const cloneScrollRoots = Array.from(
    clone.querySelectorAll<HTMLElement>('[data-conversation-scroll-root="true"]'),
  )

  sourceScrollRoots.forEach((sourceRoot, index) => {
    const cloneRoot = cloneScrollRoots[index]
    if (!cloneRoot) return

    const sourceContent = sourceRoot.querySelector<HTMLElement>('[data-conversation-content="true"]')
    const cloneContent = cloneRoot.querySelector<HTMLElement>('[data-conversation-content="true"]')
    if (!sourceContent || !cloneContent) return

    const override = options?.scrollRootOverrides?.find((entry) => (entry.index ?? 0) === index)
    const scrollTop = override?.top ?? sourceRoot.scrollTop
    const scrollLeft = override?.left ?? sourceRoot.scrollLeft
    if (!scrollTop && !scrollLeft) return

    cloneRoot.style.overflow = "hidden"
    cloneContent.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`
    cloneContent.style.transformOrigin = "top left"
  })

  return {
    clone,
    cleanup: () => wrapper.remove(),
  }
}

export const exportNodeToImage = async (
  node: HTMLElement,
  settings: ExportSettings,
  options?: ExportRenderOptions,
): Promise<string> => {
  const { clone, cleanup } = buildExportClone(node, settings, options)
  const imagePlaceholder =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
  const transform = options?.offset
    ? `translate(${-options.offset.x}px, ${-options.offset.y}px) scale(1)`
    : "scale(1)"
  try {
    await waitForImages(clone)

    const commonOptions = {
      width: settings.width,
      height: settings.height,
      pixelRatio: settings.scale,
      cacheBust: true,
      useCORS: true,
      imagePlaceholder,
      style: {
        transform,
        transformOrigin: "top left",
        width: `${settings.width}px`,
        height: `${settings.height}px`,
        "--chat-radius": "0px",
      },
    }

    const exportPromise =
      settings.format === "jpeg"
        ? toJpeg(clone, {
            ...commonOptions,
            quality: settings.quality,
          })
        : toPng(clone, commonOptions)

    return await withTimeout(exportPromise, EXPORT_TIMEOUT_MS, "Export timed out")
  } finally {
    cleanup()
  }
}

export const exportNodeToImageSequence = async (
  node: HTMLElement,
  settings: ExportSettings,
  renders: ExportRenderOptions[],
): Promise<string[]> => {
  const jobs = renders.length ? renders : [{}]
  const dataUrls: string[] = []
  for (const renderOptions of jobs) {
    dataUrls.push(await exportNodeToImage(node, settings, renderOptions))
  }
  return dataUrls
}
