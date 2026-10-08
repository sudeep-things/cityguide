/**
 * Leaflet map of a single attraction.
 *
 * Requirements honoured here:
 *   * tiles come from OpenStreetMap's public tile server, with the attribution
 *     control left visible and a second explicit credit line beneath the map;
 *   * the marker position comes from coordinates already stored in the CityGuide
 *     database — opening a map never triggers a geocoding request;
 *   * the default Leaflet marker image is replaced by an inline SVG `divIcon`,
 *     which avoids bundler asset-path problems and matches the brand.
 */
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Cobalt map pin drawn inline, so no image asset has to be resolved. */
const cobaltPin = L.divIcon({
  className: 'cityguide-pin',
  html: `
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.6 13.1 23.4 14 24.2a1.5 1.5 0 0 0 2 0C16.9 38.4 30 25.6 30 15 30 6.7 23.3 0 15 0z" fill="#0047AB"/>
      <circle cx="15" cy="14.5" r="5.2" fill="#FFFFFF"/>
    </svg>
  `,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
});

/** Keeps the view centred when the coordinates change (for example after a lookup). */
function RecenterOnChange({ latitude, longitude, zoom }) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], zoom ?? map.getZoom(), { animate: true });
  }, [map, latitude, longitude, zoom]);

  return null;
}

export function LocationMap({
  latitude,
  longitude,
  label,
  address,
  zoom = 15,
  className = 'h-72 w-full',
  interactive = true,
}) {
  const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number';
  const center = useMemo(
    () => (hasCoordinates ? [latitude, longitude] : [51.5074, -0.1278]),
    [hasCoordinates, latitude, longitude],
  );

  if (!hasCoordinates) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 text-center ${className}`}
      >
        <p className="text-sm font-semibold text-black">No coordinates recorded</p>
        <p className="mt-1 max-w-sm text-sm text-neutral-600">
          This place has not been geocoded yet. A curator can look up its address to place it on the
          map.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        className={className}
        // The map is supplementary: the address and coordinates are always
        // printed alongside it as text.
        aria-label={`Map showing the location of ${label ?? 'this attraction'}`}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        <Marker position={[latitude, longitude]} icon={cobaltPin}>
          <Popup>
            <span className="block text-sm font-semibold text-black">{label}</span>
            {address ? <span className="mt-0.5 block text-xs text-neutral-600">{address}</span> : null}
          </Popup>
        </Marker>

        <RecenterOnChange latitude={latitude} longitude={longitude} zoom={zoom} />
      </MapContainer>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-2">
        <p className="text-xs text-neutral-600">
          Tiles ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer noopener"
            className="link text-xs"
          >
            OpenStreetMap
          </a>{' '}
          contributors
        </p>
        <p className="text-xs text-neutral-500">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      </div>
    </div>
  );
}

export default LocationMap;
