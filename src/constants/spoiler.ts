export const DEFAULT_SPOILER_BLUR = 12
export const MIN_SPOILER_BLUR = 4
export const MAX_SPOILER_BLUR = 20

export const normalizeSpoilerBlur = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SPOILER_BLUR
  }

  return Math.min(MAX_SPOILER_BLUR, Math.max(MIN_SPOILER_BLUR, Math.round(value)))
}
