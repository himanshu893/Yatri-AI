import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import type { MapWaypoint } from "../types";

type Props = {
  /** Ordered stops for driving directions (itinerary, SerpAPI). */
  routeWaypoints: MapWaypoint[];
  /** Extra pins (hotels), shown in red — not included in directions path. */
  hotelPins?: MapWaypoint[];
  /** Map height in pixels. */
  height?: number;
};

export function RouteMap({
  routeWaypoints,
  hotelPins = [],
  height = 420,
}: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "yatri-gmaps",
    googleMapsApiKey: apiKey,
  });

  const [directions, setDirections] = useState<
    google.maps.DirectionsResult | null
  >(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const mapContainerStyle = useMemo(
    () => ({
      width: "100%",
      height: `${height}px`,
      borderRadius: "16px",
    }),
    [height],
  );

  const hotelIcon = useMemo(() => {
    if (!isLoaded || typeof google === "undefined") return undefined;
    return {
      url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
      scaledSize: new google.maps.Size(40, 40),
      anchor: new google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const onMapLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
  }, []);

  useEffect(() => {
    setDirections(null);
    if (!isLoaded || !apiKey || routeWaypoints.length < 2) return;

    const svc = new google.maps.DirectionsService();
    const origin = routeWaypoints[0];
    const dest = routeWaypoints[routeWaypoints.length - 1];
    const middle = routeWaypoints.slice(1, -1).map((w) => ({
      location: { lat: w.lat, lng: w.lng },
      stopover: true,
    }));

    svc.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: dest.lat, lng: dest.lng },
        waypoints: middle,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === "OK" && result) setDirections(result);
        else setDirections(null);
      },
    );
  }, [isLoaded, apiKey, routeWaypoints]);

  useEffect(() => {
    if (!map) return;
    const all = [...routeWaypoints, ...hotelPins];
    if (all.length === 0) return;
    if (directions || routeWaypoints.length < 2) {
      const bounds = new google.maps.LatLngBounds();
      all.forEach((w) => bounds.extend({ lat: w.lat, lng: w.lng }));
      map.fitBounds(bounds, 56);
    }
  }, [map, routeWaypoints, hotelPins, directions]);

  const fallback =
    "flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-surface-low px-4 text-center text-sm text-muted";

  if (!apiKey) {
    return (
      <div className={fallback} style={{ minHeight: height }}>
        Add <code className="text-ink">VITE_GOOGLE_MAPS_API_KEY</code> in{" "}
        <code className="text-ink">frontend/.env</code>.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={fallback} style={{ minHeight: height }}>
        Could not load Google Maps.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={fallback} style={{ minHeight: height }}>
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
        <p>Loading map…</p>
      </div>
    );
  }

  if (routeWaypoints.length === 0 && hotelPins.length === 0) {
    return (
      <div className={fallback} style={{ minHeight: height }}>
        No pins yet. Regenerate the plan with SerpAPI configured so stops and
        hotels can be geocoded.
      </div>
    );
  }

  const center = {
    lat: routeWaypoints[0]?.lat ?? hotelPins[0]?.lat ?? 20.5937,
    lng: routeWaypoints[0]?.lng ?? hotelPins[0]?.lng ?? 78.9629,
  };

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={routeWaypoints.length + hotelPins.length <= 1 ? 12 : 9}
      onLoad={onMapLoad}
      options={{
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      }}
    >
      {directions && routeWaypoints.length >= 2 ? (
        <DirectionsRenderer
          directions={directions}
          options={{
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: "#0a47ee",
              strokeWeight: 5,
            },
          }}
        />
      ) : (
        routeWaypoints.map((w) => (
          <Marker
            key={`r-${w.order}-${w.lat}-${w.lng}`}
            position={{ lat: w.lat, lng: w.lng }}
            title={`Stop: ${w.name}`}
          />
        ))
      )}
      {hotelPins.map((w) => (
        <Marker
          key={`h-${w.order}-${w.lat}-${w.lng}`}
          position={{ lat: w.lat, lng: w.lng }}
          title={`Hotel: ${w.name}`}
          icon={hotelIcon}
        />
      ))}
    </GoogleMap>
  );
}
