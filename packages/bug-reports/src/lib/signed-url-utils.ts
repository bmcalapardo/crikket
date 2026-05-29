export const isExpiringSignedUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)

    return (
      parsed.searchParams.has("X-Amz-Algorithm") ||
      parsed.searchParams.has("X-Amz-Signature") ||
      parsed.searchParams.has("AWSAccessKeyId") ||
      parsed.searchParams.has("Signature") ||
      parsed.searchParams.has("Expires")
    )
  } catch {
    return false
  }
}
