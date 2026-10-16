import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../../src/workers/express/standard";
serve(worker);
