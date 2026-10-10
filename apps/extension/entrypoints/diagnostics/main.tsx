import "@crikket/ui/styles/globals.css"
import React from "react"
import ReactDOM from "react-dom/client"
import { DiagnosticsPage } from "@/components/diagnostics-page"
import {
  createChromeDiagnosticsEnvironment,
  readAllStorage,
} from "@/lib/diagnostics/environment"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DiagnosticsPage
      environment={createChromeDiagnosticsEnvironment()}
      loadStorage={readAllStorage}
    />
  </React.StrictMode>
)
