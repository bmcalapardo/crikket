// The commit a build was made from. CI sets VITE_BUILD_SHA from github.sha;
// developer builds have none, so they report "local".
export const LOCAL_BUILD_SHA = "local"

export function resolveBuildSha(value: string | undefined | null): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : LOCAL_BUILD_SHA
}

export const BUILD_SHA: string = resolveBuildSha(
  import.meta.env?.VITE_BUILD_SHA as string | undefined
)
