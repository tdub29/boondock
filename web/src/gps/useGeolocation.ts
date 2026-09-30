import { useCallback, useEffect, useRef, useState } from "react";

export interface GpsFix {
  lng: number;
  lat: number;
  accuracy: number; // meters
  heading: number | null;
  speed: number | null; // m/s
  ts: number;
}

export type GpsStatus = "off" | "locating" | "active" | "denied" | "error";

export function useGeolocation() {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [status, setStatus] = useState<GpsStatus>("off");
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setStatus("off");
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      return;
    }
    setStatus("locating");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          ts: pos.timestamp,
        });
        setStatus("active");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { fix, status, start, stop };
}
