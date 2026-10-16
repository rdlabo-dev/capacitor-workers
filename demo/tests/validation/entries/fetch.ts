import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../fixtures/workers/compatibility/fetch";
serve(worker);
