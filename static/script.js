const view = (() => {
    const matrix = [1, 0, 0, 1, 0, 0]; // current view transform
    let m = matrix; // alias 
    let scale = 1; // current scale
    const pos = { x: 0, y: 0 }; // current position of origin
    let dirty = true;

    const API = {
        applyTo(el) {
            if (dirty) { this.update(); }
            el.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]})`;
        },
        update() {
            dirty = false;
            m[0] = m[3] = scale; // Set scale for x and y
            m[1] = m[2] = 0; // Reset skew
            m[4] = pos.x; // Set translation x
            m[5] = pos.y; // Set translation y
        },
        pan(amount) {
            if (dirty) { this.update(); }
            pos.x += amount.x;
            pos.y += amount.y;
            dirty = true;
        },
        scaleAt(at, amount) {
            if (dirty) { this.update(); }
            scale *= amount;
            pos.x = at.x - (at.x - pos.x) * amount;
            pos.y = at.y - (at.y - pos.y) * amount;
            dirty = true;
        },
        get matrix() {
            return m; // Expose the matrix for external access
        },
        set scale(value) {
            scale = value;
            dirty = true;
        },
        get scale() {
            return scale;
        },
        setPosition(x, y) {
            pos.x = x;
            pos.y = y;
            dirty = true;
        },
        get pos() {
            return pos; // Expose the position object
        }
    };
    return API;
})();

const imageInput = document.getElementById('imageInput');
const displayedImage = document.getElementById('displayedImage');
const resetButton = document.getElementById('resetButton');
const imageContainer = document.getElementById('imageContainer');
const canvas = document.getElementById('measurementCanvas');
const ctx = canvas.getContext('2d');
const measurements = document.getElementById('measurements');

let pixelsPerCm = 37.8; // Assuming 96 DPI, 1 inch = 2.54 cm
let allPoints = []; 
let pointPairs = []; 
let pixelsPerMm = 1; // Default value, will be updated after server processing
let imageScale = 1;
let imageRotation = 0;
let imageTranslateX = 0;
let imageTranslateY = 0;
let zoomCount = 0; // Add this at the top of your script
let imageWidth = 0;
let imageHeight = 0;

const mouse = {x: 0, y: 0, oldX: 0, oldY: 0, button: false};

function mouseEvent(event) {
    if (event.type === "mousedown") { mouse.button = true }
    if (event.type === "mouseup" || event.type === "mouseout") { mouse.button = false }
    mouse.oldX = mouse.x;
    mouse.oldY = mouse.y;
    mouse.x = event.pageX;
    mouse.y = event.pageY;
    if(mouse.button) { // pan
        view.pan({x: mouse.x - mouse.oldX, y: mouse.y - mouse.oldY});
        view.applyTo(displayedImage);
        drawMeasurements();
    }
    event.preventDefault();
}

function mouseWheelEvent(event) {
    const rect = imageContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (event.deltaY < 0) { 
        view.scaleAt({x, y}, 1.1);
    } else { 
        view.scaleAt({x, y}, 1 / 1.1);
    }
    view.applyTo(displayedImage);
    drawMeasurements();
    event.preventDefault();
}

imageContainer.addEventListener("mousemove", mouseEvent, {passive: false});
imageContainer.addEventListener("mousedown", mouseEvent, {passive: false});
document.addEventListener("mouseup", mouseEvent, {passive: false});
document.addEventListener("mouseout", mouseEvent, {passive: false});
imageContainer.addEventListener("wheel", mouseWheelEvent, {passive: false});

function resetTransformations() {
    view.scale = 1;
    rotation = 0;
    view.setPosition(0, 0);
    view.applyTo(displayedImage);
    pointPairs = [];
    drawMeasurements();
    measurements.innerHTML = '';

    // Center the image in the container
    const containerWidth = imageContainer.clientWidth;
    const containerHeight = imageContainer.clientHeight;
    const scaleX = containerWidth / imageWidth;
    const scaleY = containerHeight / imageHeight;
    const scale = Math.min(scaleX, scaleY);

    view.scale = scale;
    view.setPosition(
        (containerWidth - imageWidth * scale) / 2,
        (containerHeight - imageHeight * scale) / 2
    );
    view.applyTo(displayedImage);
}

function calculateDistance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    return pixelDistance / pixelsPerCm;
}

function rayTracePoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Invert the transformations
    const invScale = 1 / scale;
    const invRotation = -rotation * Math.PI / 180;

    // Translate
    let px = (x - translateX) * invScale;
    let py = (y - translateY) * invScale;

    // Rotate
    const cos = Math.cos(invRotation);
    const sin = Math.sin(invRotation);
    const rx = px * cos - py * sin;
    const ry = px * sin + py * cos;

    return { x: rx, y: ry };
}

function applyInverseTransform(x, y) {
    // Invert translate
    x -= view.pos.x;
    y -= view.pos.y;

    // Invert scale
    x /= view.scale;
    y /= view.scale;

    return { x, y };
}

function updateImageTransform() {
    const transform = `translate(${imageTranslateX}px, ${imageTranslateY}px) scale(${imageScale}) rotate(${imageRotation}deg)`;
    displayedImage.style.transform = transform;
    drawMeasurements();
}

function imageToCanvasCoords(x, y) {
    // Convert image coordinates to canvas coordinates
    const rotationRad = imageRotation * Math.PI / 180;
    const rotatedX = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
    const rotatedY = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);
    return {
        x: rotatedX * imageScale + imageTranslateX,
        y: rotatedY * imageScale + imageTranslateY
    };
}

function canvasToImageCoords(x, y) {
    // Convert canvas coordinates to image coordinates
    x -= imageTranslateX;
    y -= imageTranslateY;
    x /= imageScale;
    y /= imageScale;
    const rotationRad = -imageRotation * Math.PI / 180;
    return {
        x: x * Math.cos(rotationRad) - y * Math.sin(rotationRad),
        y: x * Math.sin(rotationRad) + y * Math.cos(rotationRad)
    };
}

function drawMeasurements() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply the same transformations as the image
    ctx.setTransform(view.matrix[0], view.matrix[1], view.matrix[2], view.matrix[3], view.matrix[4], view.matrix[5]);

    // Draw all points and lines for pairs
    pointPairs.forEach(pair => {
        pair.forEach((point, index) => {
            // Draw point
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 / view.scale, 0, 2 * Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
            
            if (pair.length === 2 && index === 1) {
                // Draw line and measurement only if there are two points
                const prevPoint = pair[0];
                ctx.beginPath();
                ctx.moveTo(prevPoint.x, prevPoint.y);
                ctx.lineTo(point.x, point.y);
                ctx.strokeStyle = 'blue';
                ctx.lineWidth = 1 / view.scale;
                ctx.stroke();

                const distance = calculateDistance(prevPoint, point);
                const midX = (prevPoint.x + point.x) / 2;
                const midY = (prevPoint.y + point.y) / 2;
                ctx.fillStyle = 'black';
                ctx.font = `${12 / view.scale}px Arial`;
                ctx.fillText(`${distance.toFixed(2)} cm`, midX, midY);
            }
        });
    });

    ctx.restore();
}

function determineApiUrl() {
    return '/process_image';
}

function sendImageToServer(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        fetch(determineApiUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: event.target.result }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                pixelsPerMm = data.pixels_per_mm;
                updateScaling(data);
                
                // Load the image and set dimensions
                const img = new Image();
                img.onload = function() {
                    imageWidth = img.naturalWidth;
                    imageHeight = img.naturalHeight;
                    displayedImage.src = img.src;
                    resetTransformations();
                    
                    // Adjust canvas size to match the image container
                    canvas.width = imageContainer.clientWidth;
                    canvas.height = imageContainer.clientHeight;
                };
                img.src = event.target.result;
            } else {
                // Show error message to user
                alert('No ArUco markers detected. Please upload a valid image with ArUco markers.');
                // Clear the file input
                imageInput.value = '';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while processing the image. Please try again.');
            // Clear the file input
            imageInput.value = '';
        });
    };
    reader.readAsDataURL(file);
}

function updateScaling(data) {
    // Update the scaling information
    pixelsPerCm = data.pixels_per_mm * 10; // Convert mm to cm
    // You might want to update the UI to show the real-world dimensions
    console.log(`Image dimensions: ${data.image_width_mm.toFixed(2)}mm x ${data.image_height_mm.toFixed(2)}mm`);
}

// Update the imageInput event listener
imageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        sendImageToServer(file);
    }
});

// Update the calculateDistance function
function calculateDistance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    return pixelDistance / pixelsPerCm;
}

resetButton.addEventListener('click', resetTransformations);

// Point selection and measurement
imageContainer.addEventListener('dblclick', (event) => {
    if (!displayedImage.src) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const transformedPoint = applyInverseTransform(x, y);
    
    if (pointPairs.length === 0 || pointPairs[pointPairs.length - 1].length === 2) {
        pointPairs.push([transformedPoint]);
    } else {
        pointPairs[pointPairs.length - 1].push(transformedPoint);
    }

    drawMeasurements();
});

// Prevent default behavior for right-click
imageContainer.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// Update canvas size when window is resized
window.addEventListener('resize', () => {
    if (imageWidth && imageHeight) {
        canvas.width = imageContainer.clientWidth;
        canvas.height = imageContainer.clientHeight;
        drawMeasurements();
    }
});

// Initialize canvas size
canvas.width = imageContainer.clientWidth;
canvas.height = imageContainer.clientHeight;