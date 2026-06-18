import { validateConversationData, type ConversationImportData } from "@/utils/storage"

export interface SharingLinkPayload {
  sourceUrl: string
  openInReader: boolean
}

const SHARE_TOKEN_PATTERN = /^([er])_([A-Za-z0-9_-]+)$/

const getCurrentHref = () => {
  if (typeof window === "undefined") {
    return "http://localhost/"
  }
  return window.location.href
}

const stripHash = (url: URL) => {
  url.hash = ""
  return url.toString()
}

const parseAbsoluteUrl = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("Enter a URL.")
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("Enter a valid absolute URL.")
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS source links are supported.")
  }

  return url
}

const assertJsonPath = (url: URL) => {
  if (!url.pathname.toLowerCase().endsWith(".json")) {
    throw new Error("Use a direct link to a .json save file.")
  }
}

export const normalizeTrustedSourceUrl = (input: string) => {
  const url = parseAbsoluteUrl(input)
  const host = url.hostname.toLowerCase()

  if (host === "raw.githubusercontent.com") {
    assertJsonPath(url)
    return stripHash(url)
  }

  if (host === "github.com" || host === "www.github.com") {
    assertJsonPath(url)
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length >= 5 && parts[2] === "blob") {
      const [owner, repo] = parts
      const branch = parts[3]
      const filePath = parts.slice(4).join("/")
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    }
    throw new Error("Use a GitHub file URL like github.com/owner/repo/blob/branch/file.json.")
  }

  if (host === "gitlab.com" || host === "www.gitlab.com") {
    assertJsonPath(url)
    const parts = url.pathname.split("/").filter(Boolean)
    const dashIndex = parts.findIndex((part) => part === "-")
    const mode = parts[dashIndex + 1]
    const branch = parts[dashIndex + 2]
    const filePath = parts.slice(dashIndex + 3).join("/")
    if (dashIndex > 0 && (mode === "blob" || mode === "raw") && branch && filePath) {
      const namespace = parts.slice(0, dashIndex).join("/")
      return `https://gitlab.com/${namespace}/-/raw/${branch}/${filePath}`
    }
    throw new Error("Use a GitLab file URL like gitlab.com/group/repo/-/blob/branch/file.json.")
  }

  throw new Error("Trusted sources are limited to GitHub and GitLab JSON files.")
}

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const decodeBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  )
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const getSharingTokenFromPath = (pathname: string) => {
  const parts = pathname.split("/").filter(Boolean)
  const token = parts[parts.length - 1]
  return token && SHARE_TOKEN_PATTERN.test(token) ? token : null
}

const getAppBasePath = (pathname: string) => {
  const parts = pathname.split("/")
  const lastPart = parts[parts.length - 1] ?? ""
  if (lastPart) {
    parts.pop()
  }

  const basePath = parts.join("/")
  if (!basePath) {
    return "/"
  }

  return basePath.endsWith("/") ? basePath : `${basePath}/`
}

export const createSharingLink = (
  input: string,
  openInReader: boolean,
  baseHref = getCurrentHref(),
) => {
  const sourceUrl = normalizeTrustedSourceUrl(input)
  const token = `${openInReader ? "r" : "e"}_${encodeBase64Url(sourceUrl)}`
  const url = new URL(baseHref)
  url.pathname = `${getAppBasePath(url.pathname)}${token}`
  url.search = ""
  url.hash = ""
  return url.toString()
}

export const getAppRootUrl = (baseHref = getCurrentHref()) => {
  const url = new URL(baseHref)
  url.pathname = getAppBasePath(url.pathname)
  url.search = ""
  url.hash = ""
  return url.toString()
}

export const parseSharingLink = (input: string): SharingLinkPayload | null => {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  let url: URL
  try {
    url = new URL(trimmed, getCurrentHref())
  } catch {
    return null
  }

  const token = getSharingTokenFromPath(url.pathname)
  const match = token?.match(SHARE_TOKEN_PATTERN)
  if (!match) {
    return null
  }

  try {
    const sourceUrl = normalizeTrustedSourceUrl(decodeBase64Url(match[2]))
    return {
      sourceUrl,
      openInReader: match[1] === "r",
    }
  } catch {
    return null
  }
}

export const resolveSharedSourceUrl = (input: string) => {
  const sharingPayload = parseSharingLink(input)
  return sharingPayload?.sourceUrl ?? normalizeTrustedSourceUrl(input)
}

export const fetchSharedConversation = async (input: string): Promise<ConversationImportData> => {
  const sourceUrl = normalizeTrustedSourceUrl(input)

  let response: Response
  try {
    response = await fetch(sourceUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    })
  } catch (error) {
    throw new Error("Could not fetch the save file. Make sure it is public and allows CORS.", {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new Error(`Could not fetch the save file (${response.status} ${response.statusText}).`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw new Error("The source did not return valid JSON.", { cause: error })
  }

  return validateConversationData(data)
}
