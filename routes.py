from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from models import db, Vehicle, GPSData
from datetime import datetime, timedelta
import requests, certifi
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from dotenv import load_dotenv
import os

load_dotenv()  # Load environment variables from .env file
account_sid = os.getenv('TWILIO_ACCOUNT_SID')
auth_token = os.getenv('TWILIO_AUTH_TOKEN')
twilio_phone_number = os.getenv('TWILIO_PHONE_NUMBER')

client = Client(account_sid, auth_token)

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.secret_key = os.getenv('SECRET_KEY')

    db.init_app(app)  # Initialize SQLAlchemy within app factory function

    return app

app = create_app()  # Create the Flask app using the factory function

# Function to check if GPS coordinates are within Tehri district boundaries
def is_within_assigned_area(latitude, longitude):
    # Define the bounding box for Tehri district
    north = 30.5903
    south = 30.2112
    east = 78.7804
    west = 78.1183

    return south <= latitude <= north and west <= longitude <= east

@app.route('/')
def index():
    vehicles = Vehicle.query.all()
    subquery = db.session.query(GPSData.vehicle_id).filter(
        ~GPSData.latitude.between(30.2112, 30.5903) | ~GPSData.longitude.between(78.1183, 78.7804)
    ).distinct().subquery()

    outside_vehicles = Vehicle.query.filter(Vehicle.vehicle_id.in_(subquery)).all()
    return render_template('index.html', vehicles=vehicles, outside_vehicles=outside_vehicles)

@app.route('/add_vehicle', methods=['POST'])
def add_vehicle():
    type = request.form['type']
    assigned_area = request.form['assigned_area']  # This will always be "Tehri District"
    api_url = request.form['api_url']  # New field for API URL
    phone_number = request.form['phone_number']

    try:
        response = requests.get(api_url)
        if response.status_code == 200:
            data = response.json()
            vehicles_added = 0

            if isinstance(data, list) and 'VehName' in data[0]:
                vehicle_id = data[0]['VehName']
                vehicle = Vehicle.query.filter_by(vehicle_id=vehicle_id).first()
                if vehicle:
                    # Update existing vehicle
                    vehicle.type = type
                    vehicle.assigned_area = assigned_area
                    vehicle.api_url = api_url
                    vehicle.phone_number = phone_number
                else:
                    # Add new vehicle
                    vehicle = Vehicle(vehicle_id=vehicle_id, type=type, assigned_area=assigned_area, api_url=api_url, phone_number=phone_number)
                    db.session.add(vehicle)
                vehicles_added += 1

            elif 'detail_data' in data:
                for item in data['detail_data']:
                    vehicle_id = item.get('vehicle_no')
                    if vehicle_id:
                        vehicle = Vehicle.query.filter_by(vehicle_id=vehicle_id).first()
                        if vehicle:
                            # Update existing vehicle
                            # vehicle.type = type
                            # vehicle.assigned_area = assigned_area
                            # vehicle.api_url = api_url
                            # vehicle.phone_number = phone_number
                            pass
                        else:
                            # Add new vehicle
                            vehicle = Vehicle(vehicle_id=vehicle_id, type=type, assigned_area=assigned_area, api_url=api_url, phone_number=phone_number)
                            db.session.add(vehicle)
                        vehicles_added += 1

            if vehicles_added > 0:
                db.session.commit()
                flash(f'{vehicles_added} vehicles added/updated successfully!')
            else:
                flash('API data does not contain required vehicle identification information')
        else:
            flash('Failed to fetch data from API')
    except Exception as e:
        flash(f'Error fetching data from API: {e}')
        
    return redirect(url_for('index'))


@app.route('/delete_vehicle/<string:vehicle_id>', methods=['DELETE'])
def delete_vehicle(vehicle_id):
    vehicle = Vehicle.query.filter_by(vehicle_id=vehicle_id).first()
    if vehicle:
        try:
            # First delete associated GPS data
            GPSData.query.filter_by(vehicle_id=vehicle_id).delete()
            db.session.delete(vehicle)
            db.session.commit()
            return '', 204  # HTTP 204 No Content: Successful deletion
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    else:
        return '', 404  # HTTP 404 Not Found if vehicle_id doesn't exist

@app.route('/gps_data', methods=['POST'])
def gps_data():
    vehicle_id = request.form['vehicle_id']
    timestamp = datetime.now()
    latitude = float(request.form['latitude'])
    longitude = float(request.form['longitude'])
    gps_data = GPSData(vehicle_id=vehicle_id, timestamp=timestamp, latitude=latitude, longitude=longitude)
    db.session.add(gps_data)
    db.session.commit()

    # Check if the vehicle is out of the assigned area
    if not is_within_assigned_area(latitude, longitude):
        flash(f'Alert! Vehicle {vehicle_id} has left the assigned area!')

    return 'GPS data received and saved', 200

@app.route('/live_locations')
def live_locations():
    vehicles = Vehicle.query.all()
    locations = []

    for vehicle in vehicles:
        if vehicle.api_url:
            try:
                response = requests.get(vehicle.api_url)
                if response.status_code == 200:
                    data = response.json()
                    
                    # Check if it's the old format first (list of dictionaries)
                    if isinstance(data, list):
                        for item in data:
                            if item.get('VehName') == vehicle.vehicle_id:  # Only save data for the current vehicle
                                locations.append({
                                    'vehicle_id': vehicle.vehicle_id,
                                    'latitude': float(item['Latitude']),
                                    'longitude': float(item['Longitude'])
                                })
                    # Check if 'detail_data' key exists for new format
                    elif 'detail_data' in data:
                        detail_data = data['detail_data']
                        for item in detail_data:
                            if item.get('vehicle_no') == vehicle.vehicle_id:  # Only save data for the current vehicle
                                locations.append({
                                    'vehicle_id': vehicle.vehicle_id,
                                    'latitude': float(item['latitude']),
                                    'longitude': float(item['longitude'])
                                })
            except Exception as e:
                print(f"Error fetching data for {vehicle.vehicle_id}: {e}")

    print('Live Locations:', locations)  # Print live locations for debugging

    return jsonify(locations)


def send_emergency_message(vehicle_id, latitude, longitude):
    try:
        uphone_number = request.args.get('phone_number')
        vehicle = Vehicle.query.filter_by(vehicle_id=vehicle_id).first()
        if vehicle:
            phone_number = vehicle.phone_number
            # Prepare message body with client location
            google_maps_link = f"https://www.google.com/maps?q={latitude},{longitude}"
            message_body = f"Emergency request! Client location: Latitude={latitude}, Longitude={longitude}. View location: {google_maps_link}, Victim phone number: {uphone_number}"

            # Configure requests to use certifi certificates
            session = requests.Session()
            session.verify = certifi.where()

            # Create Twilio client with custom HTTP session
            client = Client(account_sid, auth_token, http_client=session)

            # Send message using Twilio
            message = client.messages.create(
                from_=twilio_phone_number,
                body=message_body,
                to=phone_number  # Replace with the emergency vehicle driver's phone number
            )

            print(f"Message sent successfully to {message.to}")
    except TwilioRestException as e:
        print(f"Error sending message: {e}")

@app.route('/vehicle_path/<string:vehicle_id>')
def get_vehicle_path(vehicle_id):
    # Calculate the timestamp for 24 hours ago
    twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)

    # Query GPSData for the specified vehicle_id and filter by the timestamp
    gps_data = GPSData.query.filter(
        GPSData.vehicle_id == vehicle_id,
        GPSData.timestamp >= twenty_four_hours_ago
    ).order_by(GPSData.timestamp).all()

    # Prepare data to send back to the frontend
    path_data = [{
        'latitude': data.latitude,
        'longitude': data.longitude,
        'timestamp': data.timestamp.strftime('%Y-%m-%d %H:%M:%S')
    } for data in gps_data]

    print(f'Path Data for Vehicle {vehicle_id}:', path_data)  # Print path data for debugging

    # Identify stops longer than 2 minutes
    stops = []
    stop_start = None
    for idx, data in enumerate(gps_data):
        if idx == 0:
            stop_start = data.timestamp
        elif idx == len(gps_data) - 1:
            if (data.timestamp - stop_start).total_seconds() >= 120:
                stops.append({
                    'latitude': data.latitude,
                    'longitude': data.longitude,
                    'start_time': stop_start.strftime('%Y-%m-%d %H:%M:%S'),
                    'end_time': data.timestamp.strftime('%Y-%m-%d %H:%M:%S')
                })
        elif (data.timestamp - gps_data[idx - 1].timestamp).total_seconds() >= 120:
            stops.append({
                'latitude': gps_data[idx - 1].latitude,
                'longitude': gps_data[idx - 1].longitude,
                'start_time': stop_start.strftime('%Y-%m-%d %H:%M:%S'),
                'end_time': gps_data[idx - 1].timestamp.strftime('%Y-%m-%d %H:%M:%S')
            })
            stop_start = data.timestamp

    print(f'Stops for Vehicle {vehicle_id}:', stops)  # Print stops for debugging

    return jsonify({
        'path_data': path_data,
        'stops': stops
    })


from flask import request, jsonify
from sqlalchemy import func
from geopy.distance import great_circle  # Import great_circle for distance calculation



def get_route_distance_duration(user_latitude, user_longitude, vehicle_latitude, vehicle_longitude):
    osrm_url = f"http://router.project-osrm.org/route/v1/driving/{user_longitude},{user_latitude};{vehicle_longitude},{vehicle_latitude}?overview=false"
    response = requests.get(osrm_url)
    if response.status_code == 200:
        data = response.json()
        if data['routes']:
            route = data['routes'][0]
            distance = route['distance'] / 1000  # Convert to kilometers
            duration = route['duration'] / 60  # Convert to minutes
            return distance,duration
    return None, None

@app.route('/emergency_service/<service_type>', methods=['GET'])
def emergency_service(service_type):
    print(f"Fetching vehicles of type: {service_type}")

    # Fetch user's geolocation from query parameters
    user_latitude = request.args.get('user_latitude', type=float)
    user_longitude = request.args.get('user_longitude', type=float)

    print(f"User's Geolocation: Latitude={user_latitude}, Longitude={user_longitude}")

    # Query the database for vehicles of the specified type
    vehicles = Vehicle.query.filter_by(type=service_type).all()
    if not vehicles:
        print(f"No {service_type} vehicles found.")
        return jsonify([]), 404

    print(f"Found {len(vehicles)} {service_type} vehicle(s).")
    vehicle_locations = []

    for vehicle in vehicles:
        print(f"Fetching data for vehicle ID: {vehicle.vehicle_id} from API: {vehicle.api_url}")
        try:
            response = requests.get(vehicle.api_url)
            print(f"API response status code for vehicle {vehicle.vehicle_id}: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"API response data for vehicle {vehicle.vehicle_id}: {data}")

                vehicle_latitude = None
                vehicle_longitude = None

                # Handle old format
                if isinstance(data, list) and 'Latitude' in data[0] and 'Longitude' in data[0]:
                    for item in data:
                        if item.get('VehName') == vehicle.vehicle_id:
                            vehicle_latitude = float(item.get('Latitude', 0))
                            vehicle_longitude = float(item.get('Longitude', 0))
                            break

                # Handle new format
                elif 'detail_data' in data:
                    for item in data['detail_data']:
                        if item.get('vehicle_no') == vehicle.vehicle_id:
                            vehicle_latitude = float(item.get('latitude', 0))
                            vehicle_longitude = float(item.get('longitude', 0))
                            break

                if vehicle_latitude is not None and vehicle_longitude is not None:
                    if user_latitude is not None and user_longitude is not None:
                        distance, duration = get_route_distance_duration(user_latitude, user_longitude, vehicle_latitude, vehicle_longitude)
                    else:
                        distance = None
                        duration = None

                    vehicle_locations.append({
                        'vehicle_id': vehicle.vehicle_id,
                        'latitude': vehicle_latitude,
                        'longitude': vehicle_longitude,
                        'distance_from_user': distance,
                        'duration': duration
                    })
                else:
                    print(f"Latitude or Longitude not found for vehicle {vehicle.vehicle_id}")
            else:
                print(f"Failed to fetch data from API for vehicle {vehicle.vehicle_id}. Status code: {response.status_code}")
                return jsonify({"message": f"Failed to fetch data from API for vehicle {vehicle.vehicle_id}."}), 500
        except Exception as e:
            print(f"Error fetching data for vehicle {vehicle.vehicle_id}: {e}")
            return jsonify({"message": f"Error fetching data for vehicle {vehicle.vehicle_id}: {e}"}), 500

    # Sort vehicle locations by distance from user (ascending)
    vehicle_locations.sort(key=lambda x: x['distance_from_user'] if x['distance_from_user'] is not None else float('inf'))

    # Include user's geolocation in the response
    if user_latitude is not None and user_longitude is not None:
        vehicle_locations.append({
            'vehicle_id': 'User',
            'latitude': user_latitude,
            'longitude': user_longitude,
            'distance_from_user': 0,
            'duration': 0
        })

    print(f"Vehicle locations fetched: {vehicle_locations}")

    # Return the vehicle with the lowest distance from the user
    if vehicle_locations:
        closest_vehicle = vehicle_locations[0]
        send_emergency_message(closest_vehicle['vehicle_id'], user_latitude, user_longitude)
        print(f"Assigning closest vehicle: {closest_vehicle['vehicle_id']} with distance {closest_vehicle['distance_from_user']} kilometers")
        return jsonify(closest_vehicle), 200
    else:
        return jsonify({"message": "No vehicles found."}), 404



# Ensure the app is running only when this script is executed directly
if __name__ == "__main__":
    app.run(debug=True)
