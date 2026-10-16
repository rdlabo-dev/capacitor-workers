import { serve } from "@rdlabo/capacitor-workers/worker";
import worker from "../../workers/compatibility/fetch";
serve(worker);
