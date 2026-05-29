import { describe, expect, it } from "bun:test"

import { isExpiringSignedUrl } from "../src/lib/signed-url-utils"

describe("isExpiringSignedUrl", () => {
  it("detects AWS v4 presigned URLs", () => {
    const isSigned = isExpiringSignedUrl(
      "https://cdn.example.com/file.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123"
    )

    expect(isSigned).toBeTrue()
  })

  it("detects legacy signed URLs", () => {
    const isSigned = isExpiringSignedUrl(
      "https://cdn.example.com/file.png?AWSAccessKeyId=key&Signature=sig&Expires=123"
    )

    expect(isSigned).toBeTrue()
  })

  it("ignores stable public URLs", () => {
    const isSigned = isExpiringSignedUrl(
      "https://cdn.example.com/bug-reports/file.png"
    )

    expect(isSigned).toBeFalse()
  })
})
