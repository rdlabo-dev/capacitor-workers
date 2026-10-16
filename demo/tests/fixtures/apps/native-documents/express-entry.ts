import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../workers/rendering/express";
serve(worker);
