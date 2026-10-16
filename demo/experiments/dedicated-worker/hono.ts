import worker from "../../workers/hono/standard";
import { serve } from "./transport";
serve(worker);
