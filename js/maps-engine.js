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
   * Sets pickup location marker (Draggable by customer)
   */
  setPickupMarker({ lat, lng, title = "نقطة الانطلاق", draggable = true, onDragEnd = null }) {
    if (this.mapType === "google" && this.googleMap && window.google) {
      if (this.pickupMarker) this.pickupMarker.setMap(null);
      this.pickupMarker = new window.google.maps.Marker({
        position: { lat, lng },
        map: this.googleMap,
        title,
        draggable: !!draggable,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: "#10B981", // Green
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3
        }
      });

      if (draggable && typeof onDragEnd === "function") {
        this.pickupMarker.addListener("dragend", async (e) => {
          const newLat = e.latLng.lat();
          const newLng = e.latLng.lng();
          const address = await this.reverseGeocode({ lat: newLat, lng: newLng });
          onDragEnd({ lat: newLat, lng: newLng, address });
        });
      }

      this.googleMap.panTo({ lat, lng });
    } else if (this.leafletMap && window.L) {
      if (this.pickupMarker) this.pickupMarker.remove();
      const greenIcon = window.L.divIcon({
        className: "custom-map-pin green-pin",
        html: '<div style="background:#10B981;width:26px;height:26px;border-radius:50%;border:3px solid #FFF;box-shadow:0 0 12px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:bold;cursor:grab;">A</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      this.pickupMarker = window.L.marker([lat, lng], { icon: greenIcon, draggable: !!draggable })
        .addTo(this.leafletMap)
        .bindPopup(`<b>${title}</b><br><small style="color:#64748B;">اسحب الدبوس لتعديل نقطة الركوب</small>`);

      if (draggable && typeof onDragEnd === "function") {
        this.pickupMarker.on("dragend", async (e) => {
          const { lat: newLat, lng: newLng } = e.target.getLatLng();
          const address = await this.reverseGeocode({ lat: newLat, lng: newLng });
          onDragEnd({ lat: newLat, lng: newLng, address });
        });
      }

      this.leafletMap.panTo([lat, lng]);
    }
  }

  /**
   * Sets destination marker (Draggable by customer)
   */
  setDestinationMarker({ lat, lng, title = "الوجهة", draggable = true, onDragEnd = null }) {
    if (this.mapType === "google" && this.googleMap && window.google) {
      if (this.destinationMarker) this.destinationMarker.setMap(null);
      this.destinationMarker = new window.google.maps.Marker({
        position: { lat, lng },
        map: this.googleMap,
        title,
        draggable: !!draggable,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: "#EF4444", // Red
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3
        }
      });

      if (draggable && typeof onDragEnd === "function") {
        this.destinationMarker.addListener("dragend", async (e) => {
          const newLat = e.latLng.lat();
          const newLng = e.latLng.lng();
          const address = await this.reverseGeocode({ lat: newLat, lng: newLng });
          onDragEnd({ lat: newLat, lng: newLng, address });
        });
      }
    } else if (this.leafletMap && window.L) {
      if (this.destinationMarker) this.destinationMarker.remove();
      const redIcon = window.L.divIcon({
        className: "custom-map-pin red-pin",
        html: '<div style="background:#EF4444;width:26px;height:26px;border-radius:50%;border:3px solid #FFF;box-shadow:0 0 12px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:bold;cursor:grab;">B</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      this.destinationMarker = window.L.marker([lat, lng], { icon: redIcon, draggable: !!draggable })
        .addTo(this.leafletMap)
        .bindPopup(`<b>${title}</b><br><small style="color:#64748B;">اسحب الدبوس لتعديل وجهة الوصول</small>`);

      if (draggable && typeof onDragEnd === "function") {
        this.destinationMarker.on("dragend", async (e) => {
          const { lat: newLat, lng: newLng } = e.target.getLatLng();
          const address = await this.reverseGeocode({ lat: newLat, lng: newLng });
          onDragEnd({ lat: newLat, lng: newLng, address });
        });
      }
    }
  }

  /**
   * Reverse Geocodes coordinates to human readable address in Al-Arish
   */
  async reverseGeocode({ lat, lng }) {
    // 1. Check Google Maps Geocoder
    if (window.google && window.google.maps && window.google.maps.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const res = await new Promise((resolve) => {
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === "OK" && results && results[0]) {
              resolve(results[0].formatted_address);
            } else {
              resolve(null);
            }
          });
        });
        if (res) return res;
      } catch (e) {
        console.warn("Geocoder fallback:", e);
      }
    }

    // 2. Proximity check with Al-Arish famous landmarks
    let closestLandmark = null;
    let minDistance = Infinity;
    for (const lm of googleMapsConfig.arishLandmarks) {
      const dist = this.calculateHaversineDistance({ lat, lng }, lm);
      if (dist < minDistance) {
        minDistance = dist;
        closestLandmark = lm;
      }
    }

    if (closestLandmark && minDistance < 0.6) {
      return `${closestLandmark.name} (بالقرب من)`;
    } else if (closestLandmark && minDistance < 2.0) {
      return `منطقة ${closestLandmark.name} - العريش`;
    }

    return `العريش (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }

  /**
   * Gets user GPS location with friendly feedback
   */
  getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("المتصفح لا يدعم تحديد الموقع الجغرافي"));
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const address = await this.reverseGeocode({ lat, lng });
          resolve({ lat, lng, address });
        },
        (error) => {
          let msg = "تعذر الحصول على الموقع الجغرافي";
          if (error.code === error.PERMISSION_DENIED) {
            msg = "تم رفض إذن تحديد الموقع. يمكنك إدخال الموقع يدوياً.";
          } else if (error.code === error.TIMEOUT) {
            msg = "انتهت مهلة تحديد الموقع. يرجى المحاولة أو التحديد يدوياً.";
          }
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  /**
   * Searches landmarks and streets in Al-Arish
   */
  searchLandmarks(query) {
    if (!query || query.trim().length === 0) return [];
    const clean = query.trim().toLowerCase();
    return googleMapsConfig.arishLandmarks.filter(lm => 
      lm.name.toLowerCase().includes(clean) || 
      (lm.category && lm.category.toLowerCase().includes(clean))
    );
  }

  /**
   * Forces map container resize when orientation or device mode changes
   */
  invalidateSize() {
    if (this.mapType === "google" && this.googleMap && window.google) {
      window.google.maps.event.trigger(this.googleMap, "resize");
    } else if (this.leafletMap) {
      this.leafletMap.invalidateSize();
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
   * Starts realistic live roaming fleet simulation in Al-Arish (Uber home screen experience)
   */
  startLiveFleetSimulation() {
    if (this.fleetSimulationActive) return;
    this.fleetSimulationActive = true;

    // Al-Arish key patrol waypoints (Midand Al-Refai, Corniche, Assiut st, Masaeed, Downtown)
    const patrolCars = [
      { id: "sim_car_1", name: "كابتن أحمد (كورولا)", lat: 31.1316, lng: 33.8016, heading: 45, speed: 0.00015 },
      { id: "sim_car_2", name: "كابتن محمود (إلنترا)", lat: 31.1380, lng: 33.8080, heading: 120, speed: 0.00018 },
      { id: "sim_car_3", name: "كابتن سعيد (نيسان)", lat: 31.1270, lng: 33.7950, heading: 210, speed: 0.00014 },
      { id: "sim_car_4", name: "كابتن إبراهيم (سيراتو)", lat: 31.1442, lng: 33.8115, heading: 300, speed: 0.00020 },
      { id: "sim_car_5", name: "كابتن تامر (توسان VIP)", lat: 31.1210, lng: 33.7820, heading: 85, speed: 0.00016 }
    ];

    patrolCars.forEach(car => {
      this.updateDriverMarker({
        driverId: car.id,
        lat: car.lat,
        lng: car.lng,
        name: car.name,
        carModel: "تاكسي العاصمة"
      });
    });

    this.fleetInterval = setInterval(() => {
      patrolCars.forEach(car => {
        // Slight random heading changes to simulate realistic street turns
        car.heading += (Math.random() - 0.5) * 20;
        const rad = (car.heading * Math.PI) / 180;
        car.lat += Math.cos(rad) * car.speed;
        car.lng += Math.sin(rad) * car.speed;

        // Keep within Al-Arish boundaries
        if (car.lat < 31.1000 || car.lat > 31.1600) car.heading += 180;
        if (car.lng < 33.7600 || car.lng > 33.8300) car.heading += 180;

        this.updateDriverMarker({
          driverId: car.id,
          lat: car.lat,
          lng: car.lng,
          name: car.name,
          carModel: "تاكسي العاصمة"
        });
      });
    }, 2500);
  }

  /**
   * Stop fleet simulation if requested
   */
  stopLiveFleetSimulation() {
    if (this.fleetInterval) {
      clearInterval(this.fleetInterval);
      this.fleetInterval = null;
    }
    this.fleetSimulationActive = false;
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
