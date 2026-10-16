import { capacitorWorkers } from "@rdlabo/capacitor-workers";
import {
  enableDocumentWorker,
  registerDocumentWorker,
  stopDocumentWorker,
} from "../../../../../src/documents/registration";
Object.assign(window, {
  documentLifecycle: {
    capacitorWorkers,
    enableDocumentWorker,
    registerDocumentWorker,
    stopDocumentWorker,
  },
});
