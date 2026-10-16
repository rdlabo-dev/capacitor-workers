import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../workers/rendering/hono";
serve(worker);
