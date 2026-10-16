import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../../src/workers/hono/standard";
serve(worker);
