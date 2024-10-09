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

    # Convert image to grayscale to improve marker detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Load the ArUco dictionary and set up parameters
    aruco_dict = cv2.aruco.Dictionary_get(cv2.aruco.DICT_6X6_250)
    parameters = cv2.aruco.DetectorParameters_create()

    # Detect ArUco markers
    corners, ids, _ = cv2.aruco.detectMarkers(gray, aruco_dict, parameters=parameters)

    if ids is not None and len(ids) > 0:
        # Refine corner positions to subpixel accuracy
        for corner in corners:
            cv2.cornerSubPix(gray, corner, winSize=(5, 5), zeroZone=(-1, -1),
                             criteria=(cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001))

        # Assuming the first detected marker is our reference
        marker_size_mm = 40  # Known size of the ArUco marker in mm
        marker_corners = corners[0][0]
        
        # Calculate the distances between adjacent corners (4 edges of the square marker)
        edge_lengths = [
            np.linalg.norm(marker_corners[i] - marker_corners[(i + 1) % 4])
            for i in range(4)
        ]
        
        # Calculate the average size in pixels
        avg_marker_size_pixels = np.mean(edge_lengths)
        
        # Calculate pixels per mm
        pixels_per_mm = avg_marker_size_pixels / marker_size_mm
        
        # Image dimensions in mm after scale correction
        image_width_mm = img.shape[1] / pixels_per_mm
        image_height_mm = img.shape[0] / pixels_per_mm

        return {
            'success': True,
            'pixels_per_mm': pixels_per_mm,
            'image_width_mm': image_width_mm,
            'image_height_mm': image_height_mm
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
    
    if not result['success']:
        return jsonify({'success': False, 'error': 'No ArUco markers detected'}), 400
    
    return jsonify(result)

@app.route('/favicon.ico')
def favicon():
    return '', 204

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
