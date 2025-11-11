#!/bin/bash
# Download TensorFlow Lite model and labels for object detection

# Create models directory
mkdir -p models

# Download MobileNet SSD v2 COCO model
echo "Downloading MobileNet SSD v2 model..."
wget -O models/mobilenet_ssd_v2_coco.tflite \
    https://storage.googleapis.com/download.tensorflow.org/models/tflite/coco_ssd_mobilenet_v1_1.0_quant_2018_06_29.zip

# Extract if it's a zip
if [ -f models/mobilenet_ssd_v2_coco.tflite ]; then
    if file models/mobilenet_ssd_v2_coco.tflite | grep -q "Zip"; then
        echo "Extracting model..."
        cd models
        unzip mobilenet_ssd_v2_coco.tflite
        mv detect.tflite mobilenet_ssd_v2_coco.tflite 2>/dev/null || true
        rm mobilenet_ssd_v2_coco.tflite.zip 2>/dev/null || true
        cd ..
    fi
fi

# Download COCO labels
echo "Downloading COCO labels..."
wget -O models/coco_labels.txt \
    https://raw.githubusercontent.com/amikelive/coco-labels/master/coco-labels-2014_2017.txt

echo "Model and labels downloaded successfully!"
echo "Files created:"
echo "  - models/mobilenet_ssd_v2_coco.tflite"
echo "  - models/coco_labels.txt"
