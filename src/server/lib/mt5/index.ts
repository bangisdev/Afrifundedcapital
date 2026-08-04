import type { Db } from "../../db";
import type { MT5Provider } from "./types";
import { getMT5Config } from "./config";
import { HttpMT5Provider } from "./http-provider";
import { SimulatedMT5Provider } from "./simulated-provider";

const simulatedSingleton = new SimulatedMT5Provider();

/**
 * Returns the active MT5 provider for the app.
 *
 * - When an MT5 Manager API gateway is configured in settings (`mt5_config`),
 *   a real connector is built (fresh instance per call so config edits apply
 *   immediately).
 * - Otherwise a simulated provider is returned so the platform remains fully
 *   functional for demos, tests, and local development.
 */
export function getMT5Provider(db: Db): MT5Provider {
  const cfg = getMT5Config(db);
  if (cfg.enabled && cfg.baseUrls.length > 0 && cfg.apiKey) {
    return new HttpMT5Provider(db, cfg);
  }
  return simulatedSingleton;
}
