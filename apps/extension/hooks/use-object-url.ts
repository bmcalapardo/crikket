import { useEffect, useState } from "react"

/**
 * An object URL for `blob`, revoked when the blob changes or the component
 * unmounts. Creating the URL in render (useMemo) leaks one per blob.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [blob])

  return url
}
