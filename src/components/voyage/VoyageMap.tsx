import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useVoyageContext } from "@/context/VoyageContext";

const TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN as string | undefined;

// Great-circle interpolation between two [lon, lat] points
function greatCirclePoints(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
  steps = 64,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
      ),
    );
  if (!Number.isFinite(d) || d === 0) return [[lon1, lat1], [lon2, lat2]];
  const pts: [number, number][] = [];
  let prevLon = lon1;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lon = toDeg(Math.atan2(y, x));
    // keep the line continuous across the antimeridian
    while (lon - prevLon > 180) lon -= 360;
    while (prevLon - lon > 180) lon += 360;
    prevLon = lon;
    pts.push([lon, lat]);
  }
  return pts;
}

export function VoyageMap() {
  const { sequence } = useVoyageContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const stops = sequence
    .filter((r) => r.port && r.coordinates && Number.isFinite(r.coordinates[0]))
    .map((r) => ({
      name: r.port,
      type: r.type,
      operation: r.operation,
      coord: r.coordinates as [number, number],
    }));

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [20, 20],
      zoom: 0.8,
      attributionControl: false,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const render = () => {
      // markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // remove route line/source if it exists from a previous render
      if (map.getLayer("voyage-route-line")) {
        map.removeLayer("voyage-route-line");
      }
      if (map.getSource("voyage-route")) {
        map.removeSource("voyage-route");
      }

      stops.forEach((stop, i) => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:9999px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;";
        el.style.background =
          i === 0 ? "#00204b" : i === stops.length - 1 ? "#0f8b8d" : "#3b6ea5";
        el.textContent = String(i + 1);
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(stop.coord)
          .setPopup(
            new mapboxgl.Popup({ offset: 12, closeButton: false }).setText(
              `${i + 1}. ${stop.name}${stop.operation ? ` (${stop.operation})` : ""}`,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      });

      if (stops.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        stops.forEach((s) => bounds.extend(s.coord));
        map.fitBounds(bounds, { padding: 40, maxZoom: 6, duration: 600 });
      }
    };

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stops)]);

  if (!TOKEN) {
    return (
      <div className="p-3 text-[10px] text-muted-foreground text-center">
        Map unavailable — Mapbox token is not configured.
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <div className="p-3 text-[10px] text-muted-foreground text-center">
        Select ports with coordinates to see the route map
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-52 rounded-md overflow-hidden" />;
}