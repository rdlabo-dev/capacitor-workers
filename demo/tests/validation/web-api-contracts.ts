import {
  EncodingImplementation,
  encodingContract,
} from "../../../src/compat/encoding/index.spec";
import {
  AbortImplementation,
  abortContract,
} from "../../../src/compat/abort/index.spec";
import { runContract } from "@rdlabo/capacitor-workers/testing";
import {
  HeadersImplementation,
  headersContract,
} from "../../../src/compat/headers/index.spec";
import { Headers } from "../../../src/compat/headers";
import {
  RequestImplementation,
  requestContract,
} from "../../../src/compat/request/index.spec";
import { Request } from "../../../src/compat/request";
import {
  ResponseImplementation,
  responseContract,
} from "../../../src/compat/response/index.spec";
import { Response } from "../../../src/compat/response";

import {
  ImmediateImplementation,
  immediateContract,
} from "../../../src/compat/immediate/index.spec";
import {
  StructuredCloneImplementation,
  structuredCloneContract,
  localStructuredCloneApi,
} from "../../../src/compat/structured-clone/index.spec";

export function runWebApiContracts() {
  return Promise.all([
    runContract(new EncodingImplementation(), encodingContract),
    runContract(new AbortImplementation(), abortContract),
    runContract(new HeadersImplementation(Headers), headersContract),
    runContract(new RequestImplementation(Request), requestContract),
    runContract(new ResponseImplementation(Response), responseContract),
    runContract(new ImmediateImplementation(), immediateContract),
    runContract(
      new StructuredCloneImplementation(localStructuredCloneApi),
      structuredCloneContract,
    ),
  ]);
}
