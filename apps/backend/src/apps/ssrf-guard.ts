import { Injectable, BadRequestException } from "@nestjs/common";
import { lookup as dnsLookup } from "node:dns/promises";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
];

function isPrivateIp(ip: string): boolean {
  const cleaned = ip.replace(/^::ffff:/, "");

  if (cleaned === "::1" || cleaned === "::" || cleaned === "0.0.0.0") {
    return true;
  }

  if (PRIVATE_IPV4_PATTERNS.some((p) => p.test(cleaned))) {
    return true;
  }

  if (cleaned.startsWith("fc") || cleaned.startsWith("fd")) {
    return true;
  }

  if (cleaned.startsWith("fe80")) {
    return true;
  }

  return false;
}

@Injectable()
export class SsrfGuard {
  validateUrl(rawUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException("Invalid URL format");
    }

    const isDev = process.env.NODE_ENV !== "production";

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new BadRequestException("Only HTTP(S) URLs are allowed");
    }

    if (parsed.protocol === "http:" && !isDev) {
      throw new BadRequestException("HTTPS is required in production");
    }

    const hostname = parsed.hostname;

    if (hostname === "localhost" || hostname.endsWith(".local")) {
      throw new BadRequestException("Localhost and .local domains are blocked");
    }

    if (isPrivateIp(hostname)) {
      throw new BadRequestException(
        `Target resolves to a private IP address: ${hostname}`,
      );
    }
  }

  private async assertPublicHostname(hostname: string): Promise<void> {
    let addresses: { address: string }[];
    try {
      addresses = await dnsLookup(hostname, { all: true });
    } catch {
      throw new BadRequestException(`Failed to resolve hostname: ${hostname}`);
    }

    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        throw new BadRequestException(
          `Target resolves to a private IP address: ${addr.address}`,
        );
      }
    }
  }

  async fetchSpec(rawUrl: string): Promise<Record<string, unknown>> {
    this.validateUrl(rawUrl);

    const parsed = new URL(rawUrl);
    await this.assertPublicHostname(parsed.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(rawUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: { Accept: "application/json, application/yaml, */*" },
      });
    } catch {
      throw new BadRequestException(
        "Failed to fetch the OpenAPI specification (request timed out or failed)",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Failed to fetch spec: HTTP ${response.status}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new BadRequestException("Empty response body");
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw new BadRequestException("Response exceeds 10 MB size limit");
      }
      chunks.push(value);
    }

    const text = Buffer.concat(chunks).toString("utf-8");

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new BadRequestException("Spec response is not valid JSON");
    }
  }
}
