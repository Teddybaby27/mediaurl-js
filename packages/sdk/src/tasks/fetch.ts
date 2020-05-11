import { TaskFetchRequest, TaskFetchResponse } from "@watchedcom/schema";
import fetch, {
  Request,
  RequestInfo,
  RequestInit as FetchRequestInit,
  Response,
  ResponseInit,
} from "node-fetch";
import { CacheHandler } from "../cache";
import { Responder, sendTask } from "./engine";

export type RequestInit = FetchRequestInit & {
  /**
   * Shorthand to set the URL query string.
   */
  qs?: URLSearchParams | Record<string, string>;

  /**
   * Shorthand to send JSON data.
   */
  json?: any;

  /**
   * Do this request `direct` or `proxy` it via the client connection.
   * Default: `proxy`
   */
  connection?: "direct" | "proxy";
};

export type FetchFn = (
  url: RequestInfo,
  init?: RequestInit,
  timeout?: number
) => Promise<Response>;

export const createTaskFetch = (
  testMode: boolean,
  responder: Responder,
  cache: CacheHandler
): FetchFn => async (url, init, timeout = 30 * 1000) => {
  if (init?.json !== undefined) {
    if (!init.headers) init.headers = {};
    init.headers["content-type"] = "application/json; charset=utf-8";
    init.body = JSON.stringify(init.json);
  }

  let req = new Request(url, init);

  if (init?.qs) {
    const url = new URL(req.url);
    if (init.qs instanceof URLSearchParams) {
      init.qs.forEach((value, key) => url.searchParams.set(key, value));
    } else {
      for (const key of Object.keys(init.qs)) {
        url.searchParams.set(key, init.qs[key]);
      }
    }
    req = new Request(url.toString(), req);
  }

  if (init?.connection === "direct") {
    return await fetch(req);
  }

  if (testMode) {
    console.debug(`Using mocked fetch for ${init?.method ?? "GET"} ${url}`);
    return await fetch(req);
  }

  const task: TaskFetchRequest = {
    type: "fetch",
    url: req.url,
    params: {
      method: <any>req.method,
      headers: {
        Referer: req.referrer ? req.referrer : undefined,
        ...req.headers.raw(),
      },
      body: req.body ? req.body.toString() : undefined,
      redirect: req.redirect,
    },
  };
  const response = <TaskFetchResponse>(
    await sendTask(testMode, responder, cache, task, timeout)
  );

  if (response.error) throw new Error((<any>response).error);

  const res: ResponseInit = {
    headers: response.headers,
    status: response.status,
    url: response.url,
  };

  let body: string | ArrayBuffer | undefined = undefined;
  if (response.text) {
    body = response.text;
    res.size = response.text.length;
  } else if (response.data) {
    body = Buffer.from(response.data, "base64");
    res.size = body.byteLength;
  }

  return new Response(body, res);
};
