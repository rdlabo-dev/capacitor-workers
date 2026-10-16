import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../workers/express/standard";
serve(worker);
