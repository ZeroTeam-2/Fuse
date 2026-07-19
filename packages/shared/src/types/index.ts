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
  /** First OpenAPI `tags` entry, used to group endpoints into collapsible blocks. Empty → «Прочее». */
  tag?: string;
  inputs: SchemaField[];
  /** Fields of the response — of *one element* when `outputIsArray` is set. */
  outputs: SchemaField[];
  /** The endpoint answers with a collection, so `outputs` describe its element. */
  outputIsArray?: boolean;
  status: EndpointStatus;
}

/** One variable of an app environment. The `baseUrl` key is always present. */
export interface EnvironmentVariable {
  key: string;
  value: string;
}

/**
 * A named environment of an API provider (app). Every app has a non-deletable
 * `Prod` environment. Variables are an extensible set; today the only member is
 * `baseUrl` — the absolute address every endpoint path is resolved against.
 */
export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
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
  /** Absolute origin (+ base path) every endpoint path is resolved against. Seeds the Prod environment. */
  baseUrl?: string;
  host?: string;
  apiVersion?: string;
  specSnapshot?: unknown;
  endpoints: Endpoint[];
  /** Environments of the provider. The default `Prod` environment cannot be deleted. */
  environments?: Environment[];
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
  endpoints: Pick<Endpoint, "method" | "path" | "summary" | "tag">[];
}

export interface ReimportDiff {
  added: Pick<Endpoint, "method" | "path" | "summary" | "tag">[];
  deprecated: Pick<Endpoint, "method" | "path" | "summary" | "tag">[];
  kept: Pick<Endpoint, "method" | "path" | "summary" | "tag">[];
}

/** Типы блоков страницы. `paragraph` — отображение, остальное — ввод. */
export type PageBlockType =
  | "input"
  | "select"
  | "dropzone"
  | "richtext"
  | "paragraph";

/** Категория блока: заполняет пользователь (ввод) либо показывает данные (отображение). */
export type PageBlockCategory = "input" | "display";

/** Ширина блока в колонках сетки страницы (сетка из 6 колонок). */
export type PageBlockSpan = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Один элемент страницы на сетке из 6 колонок.
 *
 * `binding` зависит от категории блока:
 * - ввод (`input`/`select`/`dropzone`/`richtext`) — **ключ выхода** шага-страницы
 *   (`inn`): под ним введённое значение попадает в результат шага, откуда его
 *   забирают маппинги следующих шагов;
 * - отображение (`paragraph`) — выход пройденного шага (`s{idx}:{outKey}`).
 * Без привязки блок ввода отдаёт значение под собственным `id`.
 */
export interface PageBlock {
  id: string;
  type: PageBlockType;
  span: PageBlockSpan;
  label?: string;
  placeholder?: string;
  text?: string;
  binding?: string;
  /** Ввод: пустое значение блокирует продолжение шага. Для отображения не имеет смысла. */
  required?: boolean;
  /** Только `dropzone`: допустимые форматы файла — расширения (".pdf") и/или MIME-типы ("application/pdf"). */
  accept?: string[];
  /** Только `dropzone`: максимальный размер файла в МБ. */
  maxFileMb?: number;
  /** Статические варианты блока `select` (текст варианта — и подпись, и значение). */
  options?: string[];
  /**
   * Динамический источник вариантов `select`: выход пройденного шага
   * (`s{idx}:{outKey}`), значения которого станут вариантами. Если поле —
   * массив, его элементы (примитивы или поле `outKey` элементов-объектов)
   * разворачиваются в список опций на рантайме. Задан — перекрывает `options`.
   */
  optionsSource?: string;
}

/**
 * Ссылка на файл, загруженный со страницы шага в хранилище платформы.
 * Значение dropzone-блока в `page:submit`; worker находит её во входах
 * файлового шага и по `objectName` читает объект из MinIO.
 */
export interface UploadedFileRef {
  objectName: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

export function isUploadedFileRef(value: unknown): value is UploadedFileRef {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.objectName === "string" &&
    v.objectName.length > 0 &&
    typeof v.fileName === "string" &&
    typeof v.fileSize === "number" &&
    typeof v.fileType === "string"
  );
}

/** Строка страницы — набор блоков на сетке из 6 колонок. */
export interface PageRow {
  id: string;
  items: PageBlock[];
}

/** Страница шага — композиционная раскладка из строк и блоков. */
export interface StepPage {
  title: string;
  rows: PageRow[];
}

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

/**
 * @deprecated Тип выведен из употребления: загрузка файла — свойство api-шага
 * (dropzone-привязка к файловому body-входу endpoint'а даёт multipart), опрос
 * статуса обработки — следующий periodic-шаг. Остаётся в union только для
 * чтения старых документов сценариев; worker завершает такой шаг доменной
 * ошибкой с подсказкой.
 */
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
  /** Отсутствует у шагов, созданных до появления поля, — тогда endpoint ищется по pollMethod+pollPath. */
  endpointId?: string;
  pollMethod: HttpMethod;
  pollPath: string;
  pollIntervalSec: number;
  progressField?: string;
}

/**
 * Пользовательский экран как самостоятельный шаг потока. Блоки ввода страницы —
 * выходы шага (ключ — `binding` блока либо его `id`): следующие шаги забирают
 * значения штатным маппингом `s{idx}:{key}`. Блоки отображения привязываются к
 * выходам любых пройденных шагов. Страница только с блоками отображения не
 * блокирует исполнение; стоящая последним шагом — финальный экран результата.
 */
export interface PageStep extends BaseStep {
  type: "page";
  page: StepPage;
}

export type Step =
  | ApiStep
  | ScenarioStepRef
  | DelayStep
  | FileStep
  | PeriodicStep
  | PageStep;

/** Which environment of a given provider (app) this scenario runs its steps against. */
export interface EnvironmentSelection {
  appId: string;
  environmentId: string;
}

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
  /** Per-provider environment choice; unset providers default to Prod at execution. */
  environmentSelections?: EnvironmentSelection[];
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
  environmentSelections?: EnvironmentSelection[];
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
