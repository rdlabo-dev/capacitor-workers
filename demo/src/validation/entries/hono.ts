import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../workers/hono/standard";
serve(worker);
