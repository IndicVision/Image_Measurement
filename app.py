from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import cv2
import numpy as np
import base64
import os

app = Flask(__name__)
CORS(app)

def detect_aruco_and_calculate_scale(image):
    # Convert base64 image to OpenCV format
    nparr = np.frombuffer(base64.b64decode(image), np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Load the ArUco dictionary
    aruco_dict = cv2.aruco.Dictionary_get(cv2.aruco.DICT_6X6_250)
    parameters = cv2.aruco.DetectorParameters_create()

    # Detect ArUco markers
    corners, ids, _ = cv2.aruco.detectMarkers(img, aruco_dict, parameters=parameters)

    if ids is not None and len(ids) > 0:
        # Assuming the first detected marker is our reference
        marker_size_mm = 40  # Set this to the known size of your marker in mm
        marker_corners = corners[0][0]
        
        # Calculate the marker size in pixels
        marker_size_pixels = np.linalg.norm(marker_corners[0] - marker_corners[1])
        
        # Calculate pixels per mm
        pixels_per_mm = marker_size_pixels / marker_size_mm
        
        return {
            'success': True,
            'pixels_per_mm': pixels_per_mm,
            'image_width_mm': img.shape[1] / pixels_per_mm,
            'image_height_mm': img.shape[0] / pixels_per_mm
        }
    else:
        return {'success': False, 'error': 'No ArUco markers detected'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_image', methods=['POST'])
def process_image():
    if 'image' not in request.json:
        return jsonify({'success': False, 'error': 'No image provided'}), 400

    image_data = request.json['image'].split(',')[1]  # Remove the "data:image/png;base64," part
    result = detect_aruco_and_calculate_scale(image_data)
    return jsonify(result)

@app.route('/favicon.ico')
def favicon():
    return '', 204

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
