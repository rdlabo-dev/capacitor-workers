import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../workers/features/fetch";
serve(worker);
