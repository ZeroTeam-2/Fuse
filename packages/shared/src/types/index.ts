import type {
  HttpMethod,
  ParamLocation,
  EndpointStatus,
  StepType,
  RunStatus,
  SortOrder,
} from "../enums";

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  yandexId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface SchemaField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "file" | "array" | "object";
  loc?: ParamLocation;
  ex?: unknown;
  required?: boolean;
  /** Fields of one element, when `type` is `array`. One level deep, like the rest of the parser. */
  items?: SchemaField[];
}

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  inputs: SchemaField[];
  /** Fields of the response — of *one element* when `outputIsArray` is set. */
  outputs: SchemaField[];
  /** The endpoint answers with a collection, so `outputs` describe its element. */
  outputIsArray?: boolean;
  status: EndpointStatus;
}

/** Input/output schema of a single step, as served to the scenario builder. */
export interface StepSchema {
  inputs: SchemaField[];
  outputs: SchemaField[];
  outputIsArray?: boolean;
}

export interface App {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  openapiUrl: string;
  /** Absolute origin (+ base path) every endpoint path is resolved against. */
  baseUrl?: string;
  host?: string;
  apiVersion?: string;
  specSnapshot?: unknown;
  endpoints: Endpoint[];
  published: boolean;
  scenarioCount?: number;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface CreateAppDto {
  name: string;
  description?: string;
  openapiUrl: string;
}

export interface ImportPreviewDto {
  openapiUrl: string;
}

export interface ImportPreviewResult {
  baseUrl?: string;
  host?: string;
  apiVersion?: string;
  endpointCount: number;
  endpoints: Pick<Endpoint, "method" | "path" | "summary">[];
}

export interface ReimportDiff {
  added: Pick<Endpoint, "method" | "path" | "summary">[];
  deprecated: Pick<Endpoint, "method" | "path" | "summary">[];
  kept: Pick<Endpoint, "method" | "path" | "summary">[];
}

export interface PageField {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  /**
   * Значение шага, которое заполняет это поле: ключ входа (`inn`) либо операнд
   * его условия фильтрации (`filter:inn`). Без привязки поле уходит во входы
   * шага под собственным `key` — правило, по которому страницы работали до
   * появления `target`.
   */
  target?: string;
}

export type StepPage =
  | {
      type: "fields";
      title: string;
      hint?: string;
      fields: PageField[];
      buttonText: string;
    }
  | {
      type: "file";
      title: string;
      hint?: string;
      accept?: string;
      maxMb?: number;
      buttonText: string;
    }
  | {
      type: "text";
      title: string;
      body: string;
    };

export type MappingValue = "user" | "const" | string;

export type FilterOperator = "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains";

/** The right-hand side of a filter condition — same three sources as a mapping. */
export interface StepFilterValue {
  mode: "user" | "const" | "ref";
  /** mode=const; supports `{{s0:key}}` templates, like `Step.consts`. */
  const?: string;
  /** mode=ref; `s{idx}:{outKey}`. */
  ref?: string;
}

/**
 * Narrows an array output of a source step down to one element, so a mapping
 * like `s0:id` has a single element to read `id` from.
 */
export interface StepFilter {
  /** Empty/absent: the step result itself is the array. Otherwise: key of the array field in it. */
  arrayPath?: string;
  /** Field of the element to compare. */
  field: string;
  op: FilterOperator;
  value: StepFilterValue;
}

export interface BaseStep {
  id: string;
  title: string;
  type: StepType;
  mappings?: Record<string, MappingValue>;
  consts?: Record<string, string>;
  /** Keyed by input field key, like `mappings`. Only meaningful for `s{idx}:{key}` mappings. */
  filters?: Record<string, StepFilter>;
  page?: StepPage;
  /**
   * Шаг ссылался на приложение/API, которое было удалено. Проставляется
   * сервером (`AppsService.delete`) и снимается сам, когда шаг удаляют или
   * пересобирают — руками это поле не редактируют.
   */
  broken?: boolean;
}

export interface ApiStep extends BaseStep {
  type: "api";
  appId: string;
  endpointId: string;
  method: HttpMethod;
  path: string;
}

export interface ScenarioStepRef extends BaseStep {
  type: "scenario";
  refScenarioId: string;
}

export interface DelayStep extends BaseStep {
  type: "delay";
  seconds: number;
}

export interface FileStep extends BaseStep {
  type: "file";
  appId?: string;
  uploadMethod?: HttpMethod;
  uploadPath?: string;
  fileMode?: "single" | "chunked";
  contentType?: string;
  statusEndpoint?: {
    method: HttpMethod;
    path: string;
    intervalSec: number;
    progressField: string;
  };
}

export interface PeriodicStep extends BaseStep {
  type: "periodic";
  appId: string;
  pollMethod: HttpMethod;
  pollPath: string;
  pollIntervalSec: number;
  progressField?: string;
}

export type Step = ApiStep | ScenarioStepRef | DelayStep | FileStep | PeriodicStep;

export interface Scenario {
  id: string;
  ownerId: string;
  title: string;
  tagline?: string;
  description?: string;
  coverUrl?: string;
  category?: string;
  subcategory?: string;
  steps: Step[];
  published: boolean;
  runCount: number;
  /**
   * Выставляется автоматически, когда удаляют приложение, на которое
   * ссылается один из шагов. Пока флаг не снят (шаг с `broken: true`
   * не убран или не пересобран), запуск сценария (`POST /api/runs`)
   * отклоняется.
   */
  blocked?: boolean;
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenarioDto {
  title: string;
  description?: string;
  category?: string;
  subcategory?: string;
}

export interface UpdateScenarioDto {
  title?: string;
  description?: string;
  coverUrl?: string;
  category?: string;
  subcategory?: string;
  steps?: Step[];
  published?: boolean;
}

export interface RunStepResult {
  stepIndex: number;
  stepTitle: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  /** Non-fatal notes from input resolution (ambiguous array filter, stale `arrayPath`). */
  warnings?: string[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface Run {
  id: string;
  scenarioId: string;
  userId: string;
  status: RunStatus;
  stepResults: RunStepResult[];
  currentStep: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunDto {
  scenarioId: string;
  /** Значения ручного ввода по скоуп-ключам (`s0:inn`, `s2.s0:filter:status`). */
  inputs?: Record<string, unknown>;
}

/**
 * Одно значение сценария, помеченное ручным вводом: либо сам параметр шага
 * (`mappings[key] = "user"`), либо операнд его условия фильтрации
 * (`filters[key].value.mode = "user"`). Считается на сервере по всем шагам —
 * этим списком форма запуска строит поля, а воркер проверяет полноту входов.
 */
export interface ManualInputDescriptor {
  /** Ключ во входах запуска: `s0:inn`, `s2.s0:filter:status`. */
  key: string;
  /** Путь до шага: `[3]` или `[2, 0]` для шага вложенного сценария. */
  stepPath: number[];
  /** Индекс шага на своём уровне вложенности. */
  stepIndex: number;
  stepTitle: string;
  /** Ключ входа шага, к которому относится значение. */
  paramKey: string;
  kind: "param" | "filter";
  label: string;
  type: SchemaField["type"];
  required: boolean;
  /** Кто спросит значение: общая форма перед запуском или страница ввода шага. */
  source: "form" | "page";
}

export interface SubmitInputsDto {
  stepIndex: number;
  values: Record<string, unknown>;
}

export interface MarketplaceQuery extends PaginationQuery {
  category?: string;
  subcategory?: string;
  search?: string;
  sort?: SortOrder;
}

export interface MarketplaceCard {
  id: string;
  title: string;
  tagline: string;
  coverUrl?: string;
  category?: string;
  subcategory?: string;
  runCount: number;
  providers: string[];
  endpointCount: number;
  stepCount: number;
  blocked?: boolean;
  blockedReason?: string;
}

export interface CategoryCount {
  category: string;
  count: number;
  subcategories: { name: string; count: number }[];
}
