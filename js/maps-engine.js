// =========================================================================
// تاكسي العاصمة – CAPITAL TAXI
// Advanced Maps & Routing Engine (Google Maps JS API + Resilient Fallback)
// =========================================================================

import { googleMapsConfig } from "./firebase-config.js";

export class MapsEngine {
  constructor({ containerId, onLocationSelected = null, role = "customer" }) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.onLocationSelected = onLocationSelected;
    this.role = role;

    this.mapType = "google"; // "google" or "leaflet"
    this.mapInstance = null;
    this.googleMap = null;
    this.leafletMap = null;

    this.pickupMarker = null;
    this.destinationMarker = null;
    this.driverMarkers = new Map();
    this.routePolyline = null;
    this.directionsRenderer = null;
    this.directionsService = null;

    this.currentCenter = { ...googleMapsConfig.defaultCenter };
    this.currentZoom = googleMapsConfig.defaultZoom;
  }

  /**
   * Initializes the map engine
   */
  async init() {
    if (!this.container) {
      console.warn(`Map container #${this.containerId} not found.`);
      return false;
    }

    try {
      const googleLoaded = await this.loadGoogleMapsScript();
      if (googleLoaded && window.google && window.google.maps) {
        this.initGoogleMap();
        this.mapType = "google";
        console.log("✅ Google Maps JavaScript API loaded successfully.");
        return true;
      }
    } catch (err) {
      console.warn("Google Maps init warning (falling back to Leaflet):", err.message);
    }

    // Fallback to Leaflet
    await this.initLeafletFallback();
    this.mapType = "leaflet";
    console.log("ℹ️ Interactive Leaflet engine initialized as fallback.");
    return true;
  }

  /**
   * Dynamically loads Google Maps script with Places library
   */
  loadGoogleMapsScript() {
    return new Promise((resolve) => {
      if (window.google && window.google.maps) {
        return resolve(true);
      }

      const scriptId = "google-maps-js-sdk";
      if (document.getElementById(scriptId)) {
        return resolve(true);
      }

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsConfig.browserKey}&libraries=places,geometry&language=ar&region=EG`;
      script.async = true;
      script.defer = true;

      // Handle Google Maps authentication/referrer failure
      window.gm_authFailure = () => {
        console.warn("Google Maps Auth/Referrer Error: switching to interactive Leaflet fallback.");
        this.initLeafletFallback();
      };

      script.onload = () => resolve(true);
      script.onerror = () => {
        console.warn("Failed to load Google Maps script. Using fallback.");
        resolve(false);
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Initializes native Google Map
   */
  initGoogleMap() {
    if (!this.container) return;

    this.googleMap = new window.google.maps.Map(this.container, {
      center: this.currentCenter,
      zoom: this.currentZoom,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }]
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }]
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#263c3f" }]
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6b9a76" }]
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#38414e" }]
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#212a37" }]
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9ca5b3" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#746855" }]
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#1f2835" }]
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#f3d19c" }]
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#17263c" }]
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#515c6d" }]
        },
        {
          featureType: "water",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#17263c" }]
        }
      ],
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true
    });

    this.directionsService = new window.google.maps.DirectionsService();
    this.directionsRenderer = new window.google.maps.DirectionsRenderer({
      map: this.googleMap,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#D4AF37",
        strokeWeight: 6,
        strokeOpacity: 0.9
      }
    });

    // Handle clicks to pick coordinates
    this.googleMap.addListener("click", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (typeof this.onLocationSelected === "function") {
        this.onLocationSelected({ lat, lng });
      }
    });
  }

  /**
   * Initializes resilient Leaflet fallback (OpenStreetMap / Carto Dark)
   */
  async initLeafletFallback() {
    if (!this.container) return;

    // Load Leaflet CSS & JS if not already loaded
    if (!window.L) {
      await new Promise((res) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = res;
        document.head.appendChild(script);
      });
    }

    if (this.leafletMap) {
      this.leafletMap.remove();
    }

    this.leafletMap = window.L.map(this.containerId, {
      center: [this.currentCenter.lat, this.currentCenter.lng],
      zoom: this.currentZoom,
      zoomControl: true
    });

    // Dark luxury map tiles
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(this.leafletMap);

    this.leafletMap.on("click", (e) => {
      const { lat, lng } = e.latlng;
      if (typeof this.onLocationSelected === "function") {
        this.onLocationSelected({ lat, lng });
      }
    });

    setTimeout(() => {
      if (this.leafletMap) this.leafletMap.invalidateSize();
    }, 200);
  }

  /**
   * Sets pickup location marker
   */
  setPickupMarker({ lat, lng, title = "نقطة الانطلاق" }) {
    if (this.mapType === "google" && this.googleMap && window.google) {
      if (this.pickupMarker) this.pickupMarker.setMap(null);
      this.pickupMarker = new window.google.maps.Marker({
        position: { lat, lng },
        map: this.googleMap,
        title,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#10B981", // Green
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3
        }
      });
      this.googleMap.panTo({ lat, lng });
    } else if (this.leafletMap && window.L) {
      if (this.pickupMarker) this.pickupMarker.remove();
      const greenIcon = window.L.divIcon({
        className: "custom-map-pin green-pin",
        html: '<div style="background:#10B981;width:24px;height:24px;border-radius:50%;border:3px solid #FFF;box-shadow:0 0 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:bold;">A</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      this.pickupMarker = window.L.marker([lat, lng], { icon: greenIcon })
        .addTo(this.leafletMap)
        .bindPopup(`<b>${title}</b>`)
        .openPopup();
      this.leafletMap.panTo([lat, lng]);
    }
  }

  /**
   * Sets destination marker
   */
  setDestinationMarker({ lat, lng, title = "الوجهة" }) {
    if (this.mapType === "google" && this.googleMap && window.google) {
      if (this.destinationMarker) this.destinationMarker.setMap(null);
      this.destinationMarker = new window.google.maps.Marker({
        position: { lat, lng },
        map: this.googleMap,
        title,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#EF4444", // Red
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3
        }
      });
    } else if (this.leafletMap && window.L) {
      if (this.destinationMarker) this.destinationMarker.remove();
      const redIcon = window.L.divIcon({
        className: "custom-map-pin red-pin",
        html: '<div style="background:#EF4444;width:24px;height:24px;border-radius:50%;border:3px solid #FFF;box-shadow:0 0 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:bold;">B</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      this.destinationMarker = window.L.marker([lat, lng], { icon: redIcon })
        .addTo(this.leafletMap)
        .bindPopup(`<b>${title}</b>`)
        .openPopup();
    }
  }

  /**
   * Draws route between pickup and destination and returns calculated distance & duration
   */
  async drawRoute({ origin, destination }) {
    if (!origin || !destination) return null;

    // Direct distance calculation via Haversine
    const rawDistanceKm = this.calculateHaversineDistance(origin, destination);
    // Road factor (cities typically have 1.25x road winding factor)
    const estimatedDistanceKm = Number((rawDistanceKm * 1.25).toFixed(2));
    // Average city speed ~ 30 km/h in Al-Arish
    const estimatedDurationMin = Math.max(3, Math.round((estimatedDistanceKm / 30) * 60));

    // Try Google Maps DirectionsService
    if (this.mapType === "google" && this.directionsService && this.directionsRenderer) {
      try {
        const result = await new Promise((resolve, reject) => {
          this.directionsService.route(
            {
              origin: new window.google.maps.LatLng(origin.lat, origin.lng),
              destination: new window.google.maps.LatLng(destination.lat, destination.lng),
              travelMode: window.google.maps.TravelMode.DRIVING
            },
            (response, status) => {
              if (status === "OK") resolve(response);
              else reject(status);
            }
          );
        });

        this.directionsRenderer.setDirections(result);
        const leg = result.routes[0]?.legs[0];
        return {
          distanceKm: leg ? Number((leg.distance.value / 1000).toFixed(2)) : estimatedDistanceKm,
          durationMin: leg ? Math.round(leg.duration.value / 60) : estimatedDurationMin,
          summary: result.routes[0]?.summary || "طريق مباشر"
        };
      } catch (e) {
        console.warn("Google DirectionsService fallback:", e);
      }
    }

    // Leaflet / Direct Polyline drawing
    if (this.leafletMap && window.L) {
      if (this.routePolyline) {
        this.leafletMap.removeLayer(this.routePolyline);
      }
      const latlngs = [
        [origin.lat, origin.lng],
        [destination.lat, destination.lng]
      ];
      this.routePolyline = window.L.polyline(latlngs, {
        color: "#D4AF37",
        weight: 6,
        opacity: 0.9,
        dashArray: "10, 10"
      }).addTo(this.leafletMap);

      const bounds = window.L.latLngBounds(latlngs);
      this.leafletMap.fitBounds(bounds, { padding: [50, 50] });
    }

    return {
      distanceKm: estimatedDistanceKm,
      durationMin: estimatedDurationMin,
      summary: "مسار العريش المباشر"
    };
  }

  /**
   * Updates or creates a live driver marker on the map
   */
  updateDriverMarker({ driverId, lat, lng, name = "كابتن العاصمة", carModel = "تاكسي كود 1" }) {
    if (this.mapType === "google" && this.googleMap && window.google) {
      let marker = this.driverMarkers.get(driverId);
      if (!marker) {
        marker = new window.google.maps.Marker({
          position: { lat, lng },
          map: this.googleMap,
          title: `${name} (${carModel})`,
          icon: {
            url: "https://cdn-icons-png.flaticon.com/512/3202/3202926.png", // Golden Taxi Car Icon
            scaledSize: new window.google.maps.Size(36, 36),
            anchor: new window.google.maps.Point(18, 18)
          }
        });
        this.driverMarkers.set(driverId, marker);
      } else {
        marker.setPosition({ lat, lng });
      }
    } else if (this.leafletMap && window.L) {
      let marker = this.driverMarkers.get(driverId);
      if (!marker) {
        const carIcon = window.L.divIcon({
          className: "taxi-driver-icon",
          html: '<div style="background:#070A12;border:2px solid #D4AF37;padding:4px 8px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.6);display:flex;align-items:center;gap:4px;font-size:11px;font-weight:bold;color:#FFC400;white-space:nowrap;">🚖 <span>' + name.slice(0, 10) + '</span></div>',
          iconSize: [80, 30],
          iconAnchor: [40, 15]
        });
        marker = window.L.marker([lat, lng], { icon: carIcon }).addTo(this.leafletMap);
        this.driverMarkers.set(driverId, marker);
      } else {
        marker.setLatLng([lat, lng]);
      }
    }
  }

  /**
   * Clears all markers and routes from map
   */
  clear() {
    if (this.pickupMarker) {
      if (this.mapType === "google") this.pickupMarker.setMap(null);
      else if (this.pickupMarker.remove) this.pickupMarker.remove();
      this.pickupMarker = null;
    }
    if (this.destinationMarker) {
      if (this.mapType === "google") this.destinationMarker.setMap(null);
      else if (this.destinationMarker.remove) this.destinationMarker.remove();
      this.destinationMarker = null;
    }
    if (this.routePolyline) {
      if (this.routePolyline.remove) this.routePolyline.remove();
      this.routePolyline = null;
    }
    if (this.directionsRenderer) {
      this.directionsRenderer.set("directions", null);
    }
    this.driverMarkers.forEach((m) => {
      if (this.mapType === "google") m.setMap(null);
      else if (m.remove) m.remove();
    });
    this.driverMarkers.clear();
  }

  /**
   * Calculates straight line distance in km between two GPS coordinates
   */
  calculateHaversineDistance(p1, p2) {
    const R = 6371; // Earth radius in km
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
