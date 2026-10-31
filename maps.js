import { GOOGLE_MAPS_API_KEY } from "./maps-config.js";
const $=id=>document.getElementById(id);
let map, directionsService, directionsRenderer, pickupMarker, destinationMarker, trafficLayer, transitLayer, bikeLayer, autocompleteReady=false;
const arish={lat:31.1321,lng:33.8033};
function setRoutePoint(which,place){
 if(!place||!place.geometry||!place.geometry.location)return;
 const input=$(which==="pickup"?"pickup":"destination");
 input.value=place.formatted_address||place.name||input.value;
 const pos=place.geometry.location;
 const marker=which==="pickup"?pickupMarker:destinationMarker;
 if(marker)marker.setMap(null);
 const next=new google.maps.Marker({map,position:pos,label:which==="pickup"?"A":"B",title:which==="pickup"?"نقطة الانطلاق":"الوجهة"});
 if(which==="pickup")pickupMarker=next;else destinationMarker=next;
 map.panTo(pos);
 if(pickupMarker&&destinationMarker)calculateRoute();
}
function calculateRoute(){
 const from=$("pickup").value.trim(),to=$("destination").value.trim();
 if(!from||!to){$("routeSummary").textContent="اكتب مكان الركوب والوجهة أولًا.";return;}
 if(!directionsService){$("routeSummary").textContent="فعّل مفتاح Google Maps لعرض المسار.";return;}
 const modes={DRIVING:google.maps.TravelMode.DRIVING,WALKING:google.maps.TravelMode.WALKING,TRANSIT:google.maps.TravelMode.TRANSIT,BICYCLING:google.maps.TravelMode.BICYCLING};
 directionsService.route({origin:from,destination:to,travelMode:modes[$("travelMode").value]||google.maps.TravelMode.DRIVING,provideRouteAlternatives:true},(result,status)=>{
  if(status==="OK"){directionsRenderer.setDirections(result);const leg=result.routes[0].legs[0];$("routeSummary").textContent="المسافة: "+leg.distance.text+" · الوقت التقديري: "+leg.duration.text+" · "+result.routes.length+" مسار متاح.";}
  else $("routeSummary").textContent="تعذر إيجاد مسار. راجع العناوين أو جرّب وسيلة انتقال أخرى.";
 });
}
window.initCapitalTaxiMap=async()=>{
 try{
  const {Map}=await google.maps.importLibrary("maps");
  await google.maps.importLibrary("places");
  await google.maps.importLibrary("marker");
  map=new Map($("taxiMap"),{center:arish,zoom:13,mapTypeId:"roadmap",mapTypeControl:true,mapTypeControlOptions:{style:google.maps.MapTypeControlStyle.HORIZONTAL_BAR,position:google.maps.ControlPosition.TOP_LEFT,mapTypeIds:["roadmap","satellite","hybrid","terrain"]},streetViewControl:true,fullscreenControl:true,zoomControl:true,gestureHandling:"greedy"});
  directionsService=new google.maps.DirectionsService();
  directionsRenderer=new google.maps.DirectionsRenderer({map,preserveViewport:false,suppressMarkers:false,polylineOptions:{strokeColor:"#c79e54",strokeWeight:6}});
  trafficLayer=new google.maps.TrafficLayer();transitLayer=new google.maps.TransitLayer();bikeLayer=new google.maps.BicyclingLayer();
  const p=new google.maps.places.Autocomplete($("pickup"),{fields:["formatted_address","geometry","name"],componentRestrictions:{country:"eg"}});
  const d=new google.maps.places.Autocomplete($("destination"),{fields:["formatted_address","geometry","name"],componentRestrictions:{country:"eg"}});
  p.addListener("place_changed",()=>setRoutePoint("pickup",p.getPlace()));
  d.addListener("place_changed",()=>setRoutePoint("destination",d.getPlace()));
  $("showRoute").addEventListener("click",calculateRoute);
  $("travelMode").addEventListener("change",()=>{if($("pickup").value&&$("destination").value)calculateRoute();});
  map.addListener("click",e=>{
   const geocoder=new google.maps.Geocoder();geocoder.geocode({location:e.latLng},(results,status)=>{
    if(status==="OK"&&results[0]){
     const place={geometry:{location:e.latLng},formatted_address:results[0].formatted_address};
     if(!$("pickup").value)setRoutePoint("pickup",place);else if(!$("destination").value)setRoutePoint("destination",place);
    }
   });
  });
  const layers=document.createElement("div");layers.className="gm-layer-controls";
  [["حركة المرور",trafficLayer],["النقل العام",transitLayer],["مسارات الدراجات",bikeLayer]].forEach(([label,layer])=>{
   const b=document.createElement("button");b.type="button";b.textContent=label;b.className="gm-layer-button";b.addEventListener("click",()=>{const active=layer.getMap()===map;layer.setMap(active?null:map);b.classList.toggle("active",!active);});layers.append(b);
  });
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(layers);
  autocompleteReady=true;
 }catch(e){$("routeSummary").textContent="تعذر تحميل خرائط Google. تحقق من المفتاح وتفعيل Maps JavaScript API وPlaces API.";}
};
if(GOOGLE_MAPS_API_KEY&&GOOGLE_MAPS_API_KEY!=="YOUR_GOOGLE_MAPS_API_KEY"){
 const script=document.createElement("script");script.src="https://maps.googleapis.com/maps/api/js?key="+encodeURIComponent(GOOGLE_MAPS_API_KEY)+"&loading=async&callback=initCapitalTaxiMap&v=weekly";script.async=true;script.defer=true;script.onerror=()=>{$("routeSummary").textContent="لم يتم تحميل Google Maps. راجع المفتاح وقيود النطاق.";};document.head.append(script);
}else{$("routeSummary").textContent="الخريطة جاهزة للتفعيل بعد إضافة مفتاح Google Maps المقيّد بنطاق الموقع.";}
