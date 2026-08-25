import { GlobalRegistrator } from "@happy-dom/global-registrator"

export const registerDomEnvironment = async () => {
  const hasCreateElement =
    typeof globalThis.document !== "undefined" &&
    typeof globalThis.document.createElement === "function"

  if (hasCreateElement) {
    return
  }

  if (GlobalRegistrator.isRegistered) {
    await GlobalRegistrator.unregister()
  }

  GlobalRegistrator.register()
}
