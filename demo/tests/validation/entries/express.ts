import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../fixtures/workers/express/standard";
serve(worker);
