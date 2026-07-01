import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";

// Acceso biométrico con capacitor-native-biometric. Solo funciona dentro del APK
// (plataforma nativa). Guarda usuario+contraseña en el almacén seguro del sistema
// (Keystore Android) protegido por la huella/cara del dispositivo.

const SERVER = "lubrimesys.credentials";
const FLAG = "lubrimesys-biometric-on"; // preferencia local del usuario

export function esNativo(): boolean {
  return Capacitor.isNativePlatform();
}

// ¿El dispositivo tiene biometría disponible y enrolada?
export async function biometriaDisponible(): Promise<boolean> {
  if (!esNativo()) return false;
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: true });
    return r.isAvailable;
  } catch {
    return false;
  }
}

// ¿El usuario activó el acceso biométrico? (flag local + credenciales guardadas)
export function biometriaActivada(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(FLAG) === "1";
}

// Pide la huella/cara y guarda las credenciales en el almacén seguro.
export async function activarBiometria(usuario: string, password: string): Promise<void> {
  await NativeBiometric.verifyIdentity({
    title: "Activar acceso biométrico",
    subtitle: "Confirma tu identidad",
    reason: "Guardar credenciales para el ingreso rápido",
  });
  await NativeBiometric.setCredentials({ username: usuario, password, server: SERVER });
  localStorage.setItem(FLAG, "1");
}

// Borra las credenciales guardadas y desactiva el flag.
export async function desactivarBiometria(): Promise<void> {
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch {
    // sin credenciales previas: ignorar
  }
  localStorage.removeItem(FLAG);
}

// Pide biometría y devuelve las credenciales guardadas (o null si falla/cancela).
export async function obtenerCredencialesBiometricas(): Promise<{
  usuario: string;
  password: string;
} | null> {
  if (!esNativo() || !biometriaActivada()) return null;
  try {
    await NativeBiometric.verifyIdentity({
      title: "Ingreso a Lubrimesys",
      subtitle: "Confirma tu identidad",
      reason: "Iniciar sesión con biometría",
    });
    const c = await NativeBiometric.getCredentials({ server: SERVER });
    return { usuario: c.username, password: c.password };
  } catch {
    return null; // usuario canceló o falló la verificación
  }
}
