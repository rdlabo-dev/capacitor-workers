import worker from "../../workers/express/standard";
import { serve } from "./transport";
serve(worker);
