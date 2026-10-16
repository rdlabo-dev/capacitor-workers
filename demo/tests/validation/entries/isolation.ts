import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../fixtures/workers/runtime/isolation";
serve(worker);
