import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../fixtures/workers/hono/standard";
serve(worker);
