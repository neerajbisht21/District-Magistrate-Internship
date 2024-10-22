// Initialize Leaflet map
var map = L.map('map').setView([30.3753, 78.4744], 10); // Set initial view to Tehri District
var zoomLevel = map.getZoom(); // Initial zoom level

// Add OpenStreetMap tiles to the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

// Layer group for markers
var markersLayer = L.layerGroup().addTo(map);

// Object to store markers by vehicle_id
var markers = {};

// Default vehicle icon
var vehicleIcon = L.icon({
    iconUrl: '/static/vehicle.png', // Adjust path if necessary
    iconSize: [50, 50],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// Function to show alert message
function showAlert(message) {
    alert(message); // Display alert message
}

// Function to add a marker
function addMarker(latitude, longitude, title, popupText, icon) {
    var marker = L.marker([latitude, longitude], { icon: icon }).addTo(markersLayer)
        .bindPopup(popupText) // Bind popup without opening it
        .on('click', function() { // Add click event listener to marker
            var vehicleId = title;
            displayVehiclePath(vehicleId); // Display path for the selected vehicle
            marker.openPopup(); // Open the marker's popup
        });
    markers[title] = marker;
}

function isWithinAssignedArea(latitude, longitude) {
    // Define Tehri district boundaries
    var north = 30.5903;
    var south = 30.2112;
    var east = 78.7804;
    var west = 78.1183;

    return (south <= latitude && latitude <= north && west <= longitude && east >= longitude);
}

// Function to update map markers and list of vehicles
function updateMap() {
    fetch('/live_locations')
        .then(response => response.json())
        .then(data => {
            // Clear previous markers
            markersLayer.clearLayers();

            // Arrays to hold vehicles inside and outside Tehri district
            var insideVehicles = [];
            var outsideVehicles = [];
            var bounds = [];

            data.forEach(location => {
                var popupText = `<b>${location.vehicle_id}</b>`;

                // Check if location is out of Tehri district
                if (!isWithinAssignedArea(location.latitude, location.longitude)) {
                    outsideVehicles.push(location);
                    popupText += '<br><i>(Outside Tehri District)</i>';
                } else {
                    insideVehicles.push(location);
                }

                addMarker(location.latitude, location.longitude, location.vehicle_id, popupText, vehicleIcon);
                
                // Add location to bounds array
                bounds.push([location.latitude, location.longitude]);

                // Send GPS data to Flask backend
                sendGPSData(location.vehicle_id, location.latitude, location.longitude);
            });

            // Update the list of vehicles outside Tehri district in HTML
            var outsideVehiclesList = document.getElementById('outsideVehiclesList');
            outsideVehiclesList.innerHTML = '';
            outsideVehicles.forEach(vehicle => {
                var listItem = document.createElement('li');
                listItem.innerHTML = `
                    <button class="vehicle-btn">
                        ${vehicle.vehicle_id} - ${vehicle.latitude}, ${vehicle.longitude}
                    </button>`;
                listItem.dataset.vehicleId = vehicle.vehicle_id; // Add data attribute
                outsideVehiclesList.appendChild(listItem);
            });

            // Fit map to bounds only if it's the initial load
            var currentBounds = markersLayer.getBounds();
            if (currentBounds.isValid() && map.getZoom() === zoomLevel) {
                map.fitBounds(currentBounds);
            }

            // Call updateMap function recursively every 5 seconds
            setTimeout(updateMap, 2000);
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            // Retry after 5 seconds on error
            setTimeout(updateMap, 2000);
        });
}

// Function to send GPS data to Flask backend
function sendGPSData(vehicle_id, latitude, longitude) {
    fetch('/gps_data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `vehicle_id=${vehicle_id}&latitude=${latitude}&longitude=${longitude}`
    })
    .then(response => {
        if (response.ok) {
            console.log('GPS data sent successfully');
        } else {
            console.error('Failed to send GPS data:', response.status);
        }
    })
    .catch(error => {
        console.error('Error sending GPS data:', error);
    });
}

// Function to add hospital markers
function addHospitals() {
    var hospitals = [
        { name: 'District Hospital, Tehri', latitude: 30.38254916446345, longitude: 78.43602234947073 },
        { name: 'CHC New Tehri', latitude: 30.3835, longitude: 78.4950 },
        { name: 'CHC Ghansali', latitude: 30.7357, longitude: 78.5766 },
        { name: 'CHC Pratapnagar', latitude: 30.3836, longitude: 78.3382 },
        { name: 'CHC Narendra Nagar', latitude: 30.164716478602287, longitude: 78.28401621784886 },
        { name: 'CHC Chamba', latitude: 30.3785, longitude: 78.4865 },
        { name: 'CHC Devprayag', latitude: 30.163637982418393, longitude: 78.5998523767908 },
        { name: 'CHC Baurari', latitude: 30.3088, longitude: 78.4723 }
    ];

    var hospitalIcon = L.icon({
        iconUrl: '/static/hospital.png', // Path to custom hospital icon
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    hospitals.forEach(hospital => {
        var popupText = `<b>${hospital.name}</b>`;
        L.marker([hospital.latitude, hospital.longitude], { icon: hospitalIcon })
            .bindPopup(popupText)
            .addTo(map);
    });
}

// Function to add police station markers
function addPoliceStations() {
    var policeStations = [
        { name: 'Kampti Police Station', latitude: 30.49361039504872, longitude: 78.03809002354662 },
        { name: 'Thatyur Police Station', latitude: 30.493017368093515, longitude: 78.16649979644664 },
        { name: 'Ghansali Police Station', latitude: 30.439384052730997, longitude: 78.657028042618 },
        { name: 'Chamba Police Station', latitude: 30.346006398262368, longitude: 78.39552128685774 },
        { name: 'New Tehri Police Station', latitude: 30.37856826704953, longitude: 78.43457468720366 },
        { name: 'Hindolakhal Police Station', latitude: 30.3833, longitude: 78.6167 },
        { name: 'Kirtinagar Police Station', latitude: 30.215530168081997, longitude: 78.74732858810094 },
        { name: 'Narendranagar Police Station', latitude: 30.16864603767247, longitude: 78.2833089415394 },
        { name: 'Muni Ki Reti Police Station', latitude: 30.145355889091377, longitude: 78.32868150619983 },
        { name: 'Devprayag Police Station', latitude: 30.15325828217646, longitude: 78.59628826230167 }
    ];

    var policeIcon = L.icon({
        iconUrl: '/static/ps.png', // Path to custom police station icon
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    policeStations.forEach(station => {
        var popupText = `<b>${station.name}</b>`;
        L.marker([station.latitude, station.longitude], { icon: policeIcon })
            .bindPopup(popupText)
            .addTo(map);
    });
}

// Function to add fire brigade station markers
function addFireStations() {
    var fireStations = [
        { name: 'Tehri Fire Station', latitude: 30.3806, longitude: 78.4800 },
        { name: 'Chamba Fire Station', latitude: 30.3045, longitude: 78.3720 },
        { name: 'Narendranagar Fire Station', latitude: 30.1582, longitude: 78.2875 },
        { name: 'Kirtinagar Fire Station', latitude: 30.2028, longitude: 78.8320 }
    ];

    var fireIcon = L.icon({
        iconUrl: '/static/fire_station.png', // Path to custom fire station icon
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });

    fireStations.forEach(station => {
        var popupText = `<b>${station.name}</b>`;
        L.marker([station.latitude, station.longitude], { icon: fireIcon })
            .bindPopup(popupText)
            .addTo(map);
    });
}


var stopIcon = L.icon({
    iconUrl: '/static/stop_marker.png', // Replace with your icon URL
    iconSize: [25, 25], // Width and height of the icon (in pixels)
    iconAnchor: [8, 8], // The point of the icon which will correspond to the marker's location
    popupAnchor: [0, -8] // The point from which the popup should open relative to the iconAnchor
});

var pathPolyline = null;
var stopMarkers = [];

function displayVehiclePath(vehicle_id) {
    fetch(`/vehicle_path/${vehicle_id}`)
        .then(response => response.json())
        .then(data => {
            // Clear previous path and stop markers if any
            if (pathPolyline) {
                map.removeLayer(pathPolyline);
                pathPolyline = null;
            }
            stopMarkers.forEach(marker => map.removeLayer(marker));
            stopMarkers = [];

            // Prepare coordinates for polyline
            var polylineCoords = data.path_data.map(point => [point.latitude, point.longitude]);

            // Create and add polyline to map, and update the global pathPolyline
            pathPolyline = L.polyline(polylineCoords, { color: 'blue' }).addTo(map);

            // Fit map to bounds of the polyline
            map.fitBounds(pathPolyline.getBounds());

            // Handle stops and update the global stopMarkers array
            data.stops.forEach(stop => {
                var stopMarker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon }).addTo(map);
                var popupContent = `<b>Stop:</b><br>Started at ${stop.start_time}<br>Ended at ${stop.end_time}`;
                stopMarker.bindPopup(popupContent);
                stopMarkers.push(stopMarker); // Store reference to the stop marker
            });
        })
        .catch(error => {
            console.error('Error fetching vehicle path:', error);
            showAlert('Failed to fetch vehicle path data');
        });
}


// Function to clear map layers
// function clearMapLayers() {
//     map.eachLayer(layer => {
//         if (!(layer instanceof L.TileLayer)) {
//             map.removeLayer(layer);
//         }
//     });
// }


// Call updateMap function to start updating markers and lists
updateMap();

// Add hospital, police station, and fire brigade station markers (called once initially)
addHospitals();
addPoliceStations();
addFireStations();

// Persist map zoom level on zoom events
map.on('zoomend', function() {
    zoomLevel = map.getZoom();
});

// Modal functionality
var modal = document.getElementById('addVehicleModal');
var btn = document.getElementById('addVehicleBtn');
var span = document.getElementsByClassName('close')[0];

// Open the modal
btn.onclick = function() {
    modal.style.display = 'block';
}

// Close the modal
span.onclick = function() {
    modal.style.display = 'none';
}

// Close the modal if the user clicks outside of it
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Event delegation for vehicle list clicks
document.getElementById('allVehiclesList').addEventListener('click', function(event) {
    var listItem = event.target.closest('li');
    if (listItem) {
        var vehicleId = listItem.dataset.vehicleId;
        if (markers[vehicleId]) {
            map.setView(markers[vehicleId].getLatLng(), zoomLevel);
            markers[vehicleId].openPopup();
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Event delegation for vehicle list clicks in Vehicles Outside Tehri District section
    document.getElementById('outsideVehiclesList').addEventListener('click', function(event) {
        var listItem = event.target.closest('li');
        if (listItem) {
            var vehicleId = listItem.dataset.vehicleId;
            if (markers[vehicleId]) {
                map.setView(markers[vehicleId].getLatLng(), zoomLevel);
                markers[vehicleId].openPopup();
            }
        }
    });
});

function fetchEmergencyService(serviceType) {
    // Fetch user's geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const userLatitude = position.coords.latitude;
                const userLongitude = position.coords.longitude;

                // Call backend API with user's geolocation
                fetch(`/emergency_service/${serviceType}?user_latitude=${userLatitude}&user_longitude=${userLongitude}`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data.length > 0) {
                            showEmergencyServiceLocations(data);
                        } else {
                            alert(`No ${serviceType} vehicles found.`);
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching emergency service data:', error);
                        alert('Failed to fetch emergency service data. Please try again.');
                    });
            },
            function(error) {
                console.error('Error fetching user location:', error);
                alert('Failed to fetch your location. Please enable location services and try again.');
            }
        );
    } else {
        alert('Geolocation is not supported by this browser.');
    }
}

function showEmergencyServiceLocations(locations) {
    // Example: Console log the locations
    console.log('Emergency Service Locations:', locations);
    // Implement logic to display or use these locations (e.g., update map markers)
}


// event listener to clear all paths and markers when clicking outside the map area
document.addEventListener('click', function(event) {
    if (!map.getContainer().contains(event.target)) {
        // Clear current path polyline if it exists
        if (pathPolyline) {
            map.removeLayer(pathPolyline);
            pathPolyline = null;
            map.setView([30.3753, 78.4744], 10);
        }

        // Clear all stop markers
        stopMarkers.forEach(marker => map.removeLayer(marker));
        stopMarkers = [];
    }
});



let userPhoneNumber = '';

        function toggleAdminLoginForm() {
            const adminLoginForm = document.getElementById("admin-login-form");
            adminLoginForm.classList.toggle("active");
        }

        document.addEventListener("DOMContentLoaded", function() {
            const deleteVehicleBtn = document.getElementById("deleteVehicleBtn");
            const deleteVehicleInput = document.getElementById("deleteVehicleInput");

            deleteVehicleBtn.addEventListener("click", function() {
                deleteVehicleInput.classList.toggle("hidden");
            });

            const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

            confirmDeleteBtn.addEventListener("click", function() {
                const vehicleId = document.getElementById("vehicleIdToDelete").value.trim();

                if (vehicleId !== "") {
                    fetch(`/delete_vehicle/${vehicleId}`, {
                        method: 'DELETE',
                    })
                    .then(response => {
                        if (response.ok) {
                            alert(`Vehicle ${vehicleId} deleted successfully!`);
                            window.location.reload(); // Refresh the page after deletion
                        } else {
                            alert(`Failed to delete Vehicle ${vehicleId}`);
                        }
                    })
                    .catch(error => {
                        console.error('Error deleting vehicle:', error);
                        alert(`Error deleting Vehicle ${vehicleId}`);
                    });
                } else {
                    alert("Please enter a valid Vehicle ID to delete.");
                }
            });
        });
        
        function emergencyService(service) {
            const phoneNumberInput = document.getElementById("phone-number").value.trim();
            const phoneErrorMessage = document.getElementById("phone-error-message");

            // Validate phone number
            if (/^\d{10}$/.test(phoneNumberInput)) {
                phoneErrorMessage.style.display = "none";

                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(function(position) {
                        const userLatitude = position.coords.latitude;
                        const userLongitude = position.coords.longitude;

                        fetch(`/emergency_service/${service.toLowerCase()}?user_latitude=${userLatitude}&user_longitude=${userLongitude}&phone_number=${phoneNumberInput}`)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error('Network response was not ok.');
                                }
                                return response.json();
                            })
                            .then(data => {
                                if (data.vehicle_id && data.distance_from_user !== null && data.duration !== null) {
                                    const { vehicle_id, distance_from_user, duration } = data;
                                    alert(`Assigned Vehicle: ${vehicle_id} - Distance from you: ${distance_from_user.toFixed(2)} km - Estimated Duration: ${duration.toFixed(2)} minutes`);
                                } else {
                                    alert('No vehicle assigned or could not calculate distance and duration.');
                                }
                            })
                            .catch(error => {
                                console.error('Error fetching emergency service vehicle data:', error);
                                alert('Error fetching emergency service vehicle data');
                            });
                    }, function(error) {
                        console.error('Error getting user location:', error);
                        alert('Error getting your location. Please enable location services and try again.');
                    });
                } else {
                    alert('Geolocation is not supported by your browser.');
                }
            } else {
                phoneErrorMessage.style.display = "block";
            }
        }

        function adminLogin() {
            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;

            if (username === "admin" && password === "password") {
                document.getElementById("overlay").style.display = "none";
            } else {
                document.getElementById("error-message").style.display = "block";
            }
        }