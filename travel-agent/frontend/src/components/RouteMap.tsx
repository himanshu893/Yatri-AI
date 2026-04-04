import { useCallback, useEffect, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import type { MapWaypoint } from "../types";

const mapContainerStyle = {
  width: "100%",
  height: "420px",
  borderRadius: "16px",
};

type Props = {
  waypoints: MapWaypoint[];
};

export function RouteMap({ waypoints }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "yatri-gmaps",
    googleMapsApiKey: apiKey,
  });

  const [directions, setDirections] = useState<
    google.maps.DirectionsResult | null
  >(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const onMapLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
  }, []);

  useEffect(() => {
    setDirections(null);
    if (!isLoaded || !apiKey || waypoints.length < 2) return;

    const svc = new google.maps.DirectionsService();
    const origin = waypoints[0];
    const dest = waypoints[waypoints.length - 1];
    const middle = waypoints.slice(1, -1).map((w) => ({
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
  }, [isLoaded, apiKey, waypoints]);

  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    if (directions || waypoints.length < 2) {
      const bounds = new google.maps.LatLngBounds();
      waypoints.forEach((w) =>
        bounds.extend({ lat: w.lat, lng: w.lng }),
      );
      map.fitBounds(bounds, 56);
    }
  }, [map, waypoints, directions]);

  if (!apiKey) {
    return (
      <div className="map-fallback">
        Add <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>frontend/.env</code>{" "}
        (enable Maps JavaScript API + Directions API) to draw the route.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="map-fallback">Could not load Google Maps. Check the API key.</div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="map-fallback">
        <span className="spinner" style={{ margin: "0 auto" }} />
        <p>Loading map…</p>
      </div>
    );
  }

  if (waypoints.length === 0) {
    return (
      <div className="map-fallback">
        Stops will appear here after your plan is generated. We geocode itinerary
        places with SerpAPI and draw the driving path when possible.
      </div>
    );
  }

  const center = { lat: waypoints[0].lat, lng: waypoints[0].lng };

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={waypoints.length === 1 ? 12 : 9}
      onLoad={onMapLoad}
      options={{
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      }}
    >
      {directions ? (
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
        waypoints.map((w) => (
          <Marker
            key={`${w.order}-${w.lat}-${w.lng}`}
            position={{ lat: w.lat, lng: w.lng }}
            title={w.name}
          />
        ))
      )}
    </GoogleMap>
  );
}
