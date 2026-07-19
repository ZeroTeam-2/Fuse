export const StepType = {
  API: "api",
  SCENARIO: "scenario",
  DELAY: "delay",
  FILE: "file",
  PERIODIC: "periodic",
  PAGE: "page",
} as const;

export type StepType = (typeof StepType)[keyof typeof StepType];

export const RunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  WAITING_INPUT: "waiting_input",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export const ParamLocation = {
  PATH: "path",
  QUERY: "query",
  HEADER: "header",
  BODY: "body",
} as const;

export type ParamLocation = (typeof ParamLocation)[keyof typeof ParamLocation];

export const EndpointStatus = {
  ACTIVE: "active",
  DEPRECATED: "deprecated",
} as const;

export type EndpointStatus = (typeof EndpointStatus)[keyof typeof EndpointStatus];

export const SortOrder = {
  POPULAR: "popular",
  NEW: "new",
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
