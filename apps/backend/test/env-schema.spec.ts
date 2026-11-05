import { describe, it, expect } from "vitest";
import { validateEnv } from "../src/config/env.schema";
import { extractHosts, isExternalHost } from "../src/config/external-config";

/** Минимум, без которого схема не проходит независимо от dev-входа. */
const baseEnv = {
  MONGODB_URL: "mongodb://localhost:27017/fuse",
  AWS_SQS_QUEUE_URL: "http://localhost:4566/000000000000/scenario-execution",
  JWT_SECRET: "test-secret-at-least-32-characters!!",
};

/**
 * Профиль, проходящий строгий режим: настоящие (не плейсхолдерные) значения всех
 * секретов, которых строгий режим требует.
 */
const strictSecrets = {
  AWS_ACCESS_KEY_ID: "AKIA7TJ4QZPL2WN6XC3D",
  AWS_SECRET_ACCESS_KEY: "k9Vd2mQx7РZtL4yB8nFw3sHjR6cTpA1eUgY5oXiM",
  S3_ACCESS_KEY: "GK31c2f218a2e44f485b94239e",
  S3_SECRET_KEY: "b892c0665f0ada71a4e8c0cd4e8b1b2f3a7d9e6c",
  YANDEX_CLIENT_ID: "7f3c91a84b2e4d5f8a1c6b0d9e2f4a7b",
  YANDEX_CLIENT_SECRET: "c4e8b1f6a9d2c5e8b1f4a7d0c3e6b9f2",
};

describe("envSchema: локальный вход без OAuth", () => {
  it("не требует DEV_LOGIN_* — по умолчанию пустые", () => {
    const env = validateEnv({ ...baseEnv });
    expect(env.DEV_LOGIN_EMAIL).toBe("");
    expect(env.DEV_LOGIN_PASSWORD).toBe("");
  });

  it("разрешает пару кредов в локальном профиле", () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: "development",
      DEV_LOGIN_EMAIL: "seed@fuse.local",
      DEV_LOGIN_PASSWORD: "devpassword",
    });
    expect(env.DEV_LOGIN_EMAIL).toBe("seed@fuse.local");
    expect(env.DEV_LOGIN_PASSWORD).toBe("devpassword");
  });

  it("падает, если пароль задан при NODE_ENV=production", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        ...strictSecrets,
        NODE_ENV: "production",
        DEV_LOGIN_EMAIL: "seed@fuse.local",
        DEV_LOGIN_PASSWORD: "devpassword",
      }),
    ).toThrow(/DEV_LOGIN_PASSWORD/);
  });

  it("падает, если пароль задан при внешней конфигурации и NODE_ENV=development", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        ...strictSecrets,
        NODE_ENV: "development",
        MONGODB_URL: "mongodb://fuse:pwd@db.example.com:27017/fuse",
        DEV_LOGIN_PASSWORD: "devpassword",
        SSRF_ALLOWED_HOSTS: "",
      }),
    ).toThrow(/DEV_LOGIN_PASSWORD/);
  });

  it("не мешает production, пока пароль пуст и секреты заполнены", () => {
    const env = validateEnv({
      ...baseEnv,
      ...strictSecrets,
      NODE_ENV: "production",
      DEV_LOGIN_EMAIL: "seed@fuse.local",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.DEV_LOGIN_PASSWORD).toBe("");
  });
});

describe("isExternalHost", () => {
  it("считает локальными сервисы compose, localhost и приватные диапазоны", () => {
    for (const host of [
      "localhost",
      "mongo",
      "localstack",
      "garage",
      "host.docker.internal",
      "printer.local",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.10",
      "172.16.0.5",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      // Диапазоны для документации (RFC 5737) не маршрутизируются: внешней
      // конфигурацией такой адрес не делает.
      "203.0.113.7",
      "192.0.2.1",
    ]) {
      expect(isExternalHost(host), host).toBe(false);
    }
  });

  it("считает внешними публичные адреса и доменные имена с точкой", () => {
    for (const host of [
      "db.example.com",
      "s3.twcstorage.ru",
      "message-queue.api.cloud.yandex.net",
      "8.8.8.8",
      "93.184.216.34",
      "2606:4700::1111",
      // IPv4-mapped IPv6 классифицируется по вложенному адресу
      "::ffff:8.8.8.8",
    ]) {
      expect(isExternalHost(host), host).toBe(true);
    }
  });
});

describe("extractHosts", () => {
  it("разбирает URL, голой хост и строку подключения с кредами", () => {
    expect(extractHosts("http://localstack:4566/000000000000/queue")).toEqual([
      "localstack",
    ]);
    expect(extractHosts("localhost")).toEqual(["localhost"]);
    expect(extractHosts("mongodb://fuse:p@ss@db.example.com:27017/fuse?x=1"))
      .toEqual(["db.example.com"]);
  });

  it("разбирает набор хостов реплика-сета", () => {
    expect(extractHosts("mongodb://u:p@a.example.com:27017,b.example.com:27017/db"))
      .toEqual(["a.example.com", "b.example.com"]);
  });

  it("разбирает IPv6-литерал в скобках", () => {
    expect(extractHosts("mongodb://[::1]:27017/fuse")).toEqual(["::1"]);
  });
});

describe("envSchema: строгий режим", () => {
  it("локальный профиль не ужесточается — дефолты LocalStack и Garage проходят", () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: "development",
      AWS_ENDPOINT_URL: "http://localhost:4566",
      S3_URL: "localhost",
      SSRF_ALLOWED_HOSTS: "localhost,127.0.0.1",
    });
    expect(env.S3_ACCESS_KEY).toBe("minioadmin");
    expect(env.AWS_ACCESS_KEY_ID).toBe("test");
  });

  it("плейсхолдер JWT_SECRET в production роняет старт", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        ...strictSecrets,
        NODE_ENV: "production",
        JWT_SECRET: "<generate-via-openssl-rand-hex-48>",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("дефолты локальных контейнеров в production роняют старт", () => {
    expect(() =>
      validateEnv({ ...baseEnv, NODE_ENV: "production" }),
    ).toThrow(/S3_ACCESS_KEY|AWS_ACCESS_KEY_ID/);
  });

  it("внешний адрес включает строгий режим при NODE_ENV=development", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        MONGODB_URL: "mongodb://fuse:pwd@db.example.com:27017/fuse",
        NODE_ENV: "development",
      }),
    ).toThrow(/строгий режим.*MONGODB_URL=db\.example\.com/s);
  });

  it("непустой SSRF_ALLOWED_HOSTS в строгом режиме роняет старт", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        ...strictSecrets,
        NODE_ENV: "production",
        SSRF_ALLOWED_HOSTS: "localhost,127.0.0.1",
      }),
    ).toThrow(/SSRF_ALLOWED_HOSTS/);
  });

  it("вне строгого режима SSRF_ALLOWED_HOSTS допустим", () => {
    const env = validateEnv({ ...baseEnv, SSRF_ALLOWED_HOSTS: "localhost,127.0.0.1" });
    expect(env.SSRF_ALLOWED_HOSTS).toBe("localhost,127.0.0.1");
  });
});

describe("envSchema: качество секретов", () => {
  it("отклоняет JWT_SECRET из повторяющихся символов", () => {
    expect(() =>
      validateEnv({ ...baseEnv, JWT_SECRET: "a".repeat(48) }),
    ).toThrow(/JWT_SECRET/);
  });

  it("отклоняет совпадение JWT_SECRET и NUXT_SESSION_SECRET", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NUXT_SESSION_SECRET: baseEnv.JWT_SECRET,
      }),
    ).toThrow(/NUXT_SESSION_SECRET/);
  });

  it("разрешает разные значения JWT_SECRET и NUXT_SESSION_SECRET", () => {
    const env = validateEnv({
      ...baseEnv,
      NUXT_SESSION_SECRET: "another-secret-at-least-32-characters",
    });
    expect(env.NUXT_SESSION_SECRET).not.toBe(env.JWT_SECRET);
  });

  it("не требует NUXT_SESSION_SECRET: в compose бэкенду его не передают", () => {
    const env = validateEnv({ ...baseEnv, ...strictSecrets, NODE_ENV: "production" });
    expect(env.NUXT_SESSION_SECRET).toBe("");
  });

  // Отозванные значения проверяются в secret-policy.spec.ts: по хэшу из списка
  // прообраз не восстанавливается, поэтому «старт с отозванным значением» здесь
  // воспроизвести нечем — тестируется сама проверка, а не её вызов из схемы.

  it("требует https для LOG_COLLECTOR_URL", () => {
    expect(() =>
      validateEnv({ ...baseEnv, LOG_COLLECTOR_URL: "http://logs.example.com" }),
    ).toThrow(/LOG_COLLECTOR_URL/);

    const env = validateEnv({
      ...baseEnv,
      LOG_COLLECTOR_URL: "https://logs.example.com",
    });
    expect(env.LOG_COLLECTOR_URL).toBe("https://logs.example.com");
  });
});

describe("envSchema: trust proxy", () => {
  it("по умолчанию не доверяет заголовку: в pnpm dev прокси перед бэкендом нет", () => {
    expect(validateEnv({ ...baseEnv }).TRUST_PROXY_HOPS).toBe(0);
  });

  it("принимает явное число хопов и отклоняет мусор", () => {
    expect(validateEnv({ ...baseEnv, TRUST_PROXY_HOPS: "2" }).TRUST_PROXY_HOPS).toBe(2);
    expect(() => validateEnv({ ...baseEnv, TRUST_PROXY_HOPS: "-1" })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
  });
});
