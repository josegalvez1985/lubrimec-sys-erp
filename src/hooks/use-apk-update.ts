import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

// Compara la versión del APK instalado (Capacitor) contra la publicada en
// public/apk-version.json (servido desde el mismo origen web). Si hay una versión
// mayor, expone la URL del APK nuevo para que el usuario lo descargue e instale.
//
// Solo actúa dentro del APK (plataforma nativa). En navegador no muestra nada.

type ApkVersionInfo = { version: string; url: string; notas?: string };

// Compara "1.2.0" vs "1.1.5" -> true si a > b.
function esMayor(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export function useApkUpdate() {
  const [update, setUpdate] = useState<ApkVersionInfo | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return; // solo dentro del APK
    let cancelado = false;

    (async () => {
      try {
        const info = await App.getInfo(); // info.version = versionName del APK
        const res = await fetch(`${import.meta.env.BASE_URL}apk-version.json`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ApkVersionInfo;
        if (!cancelado && data?.version && esMayor(data.version, info.version)) {
          setUpdate(data);
        }
      } catch {
        // sin conexión o sin archivo: no molestar
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  return update; // null si no hay actualización o si corre en navegador
}
