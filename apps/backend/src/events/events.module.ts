import { Module, type DynamicModule } from "@nestjs/common";
import { WebSocketModule } from "../websocket/websocket.module";
import { NotificationsGatewayModule } from "../notifications/notifications-gateway.module";
import { EVENT_BUS } from "./event-bus";
import { LocalEventBus } from "./local-event-bus";
import { MongoBridgeEventBus } from "./mongo-bridge-event-bus";
import { BridgeTailer } from "./bridge-tailer";

/**
 * Шина событий, собранная под процесс. Режим определяется entrypoint'ом
 * (`main.ts` → `forApi()`, `worker-main.ts` → `forWorker()`), а не env-флагом:
 * так нельзя случайно получить воркер без сокетов, думающий, что он API.
 *
 * Модуль глобальный, и это осознанно: `EVENT_BUS` нужен потребителям в разных
 * модулях (`ExecutionModule`, `NotificationsModule`), и если бы каждый
 * импортировал `EventsModule.forApi()`/`forWorker()` сам, выбор процесса
 * пришлось бы продублировать в каждом — ровно то знание, от которого
 * потребителей и избавляет шина. Регистрируется один раз в корне процесса.
 */
@Module({})
export class EventsModule {
  /**
   * API-процесс: публикация идёт прямо в гейтвеи, плюс `BridgeTailer`,
   * который подливает в те же гейтвеи события из воркер-процессов.
   */
  static forApi(): DynamicModule {
    return {
      module: EventsModule,
      global: true,
      imports: [WebSocketModule, NotificationsGatewayModule],
      providers: [
        LocalEventBus,
        { provide: EVENT_BUS, useExisting: LocalEventBus },
        BridgeTailer,
      ],
      exports: [EVENT_BUS],
    };
  }

  /** Воркер-процесс: публикация конвертом в capped-коллекцию, тейлера нет. */
  static forWorker(): DynamicModule {
    return {
      module: EventsModule,
      global: true,
      providers: [
        MongoBridgeEventBus,
        { provide: EVENT_BUS, useExisting: MongoBridgeEventBus },
      ],
      exports: [EVENT_BUS],
    };
  }
}
