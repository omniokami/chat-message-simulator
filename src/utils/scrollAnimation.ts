const DEFAULT_SCROLL_DURATION = 220

const elementFrames = new WeakMap<HTMLElement, number>()
let windowFrame = 0

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

const clampScrollTop = (top: number, maxTop: number) =>
  Math.min(Math.max(0, top), Math.max(0, maxTop))

const getDocumentMaxScrollTop = () => {
  const documentElement = document.documentElement
  const body = document.body
  const scrollHeight = Math.max(
    documentElement.scrollHeight,
    body?.scrollHeight ?? 0,
    documentElement.offsetHeight,
    body?.offsetHeight ?? 0,
  )
  return Math.max(0, scrollHeight - window.innerHeight)
}

export const animateElementScrollTop = (
  element: HTMLElement,
  top: number,
  duration = DEFAULT_SCROLL_DURATION,
) => {
  const maxTop = element.scrollHeight - element.clientHeight
  const targetTop = clampScrollTop(top, maxTop)
  const startTop = element.scrollTop
  const distance = targetTop - startTop

  const existingFrame = elementFrames.get(element)
  if (existingFrame) {
    window.cancelAnimationFrame(existingFrame)
    elementFrames.delete(element)
  }

  if (Math.abs(distance) < 1 || duration <= 0 || prefersReducedMotion()) {
    element.scrollTop = targetTop
    return
  }

  const startTime = window.performance.now()
  const step = (time: number) => {
    const progress = Math.min(1, (time - startTime) / duration)
    element.scrollTop = startTop + distance * easeOutCubic(progress)

    if (progress < 1) {
      elementFrames.set(element, window.requestAnimationFrame(step))
      return
    }

    element.scrollTop = targetTop
    elementFrames.delete(element)
  }

  elementFrames.set(element, window.requestAnimationFrame(step))
}

export const animateWindowScrollTop = (top: number, duration = DEFAULT_SCROLL_DURATION) => {
  const targetTop = clampScrollTop(top, getDocumentMaxScrollTop())
  const startTop = window.scrollY
  const distance = targetTop - startTop

  if (windowFrame) {
    window.cancelAnimationFrame(windowFrame)
    windowFrame = 0
  }

  if (Math.abs(distance) < 1 || duration <= 0 || prefersReducedMotion()) {
    window.scrollTo({ top: targetTop, behavior: "auto" })
    return
  }

  const startTime = window.performance.now()
  const step = (time: number) => {
    const progress = Math.min(1, (time - startTime) / duration)
    window.scrollTo({
      top: startTop + distance * easeOutCubic(progress),
      behavior: "auto",
    })

    if (progress < 1) {
      windowFrame = window.requestAnimationFrame(step)
      return
    }

    window.scrollTo({ top: targetTop, behavior: "auto" })
    windowFrame = 0
  }

  windowFrame = window.requestAnimationFrame(step)
}

export const animateElementIntoWindowView = (
  element: HTMLElement,
  duration = DEFAULT_SCROLL_DURATION,
) => {
  const rect = element.getBoundingClientRect()
  const targetTop = window.scrollY + rect.top - (window.innerHeight - rect.height) / 2
  animateWindowScrollTop(targetTop, duration)
}
