import worker from "../../workers/runtime/isolation";
import { serve } from "./transport";
serve(worker);
