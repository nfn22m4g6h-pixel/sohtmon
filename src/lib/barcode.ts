"use client";

import { BarcodeDetector, setZXingModuleOverrides } from "barcode-detector/ponyfill";

let configured = false;

/** Детектор штрихкодов: WASM берётся с нашего сайта (/zxing_reader.wasm), а не с CDN */
export function createDetector() {
  if (!configured) {
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path),
    });
    configured = true;
  }
  return new BarcodeDetector({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"],
  });
}
