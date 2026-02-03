# BiRefNet Background Removal Service

A FastAPI-based microservice that provides high-quality background removal using the BiRefNet model.

## Features

- **High Quality**: Uses BiRefNet, a state-of-the-art background removal model
- **Fast**: Optimized with FP16 precision on GPU
- **Flexible**: Supports both file upload and base64 image formats
- **Docker Ready**: Containerized for easy deployment

## API Endpoints

### Health Check

```bash
GET /health
```

Returns the service health status and model information.

### Remove Background (File Upload)

```bash
POST /remove-background
Content-Type: multipart/form-data

file: <image file>
```

Returns PNG image with transparent background.

### Remove Background (Base64)

```bash
POST /remove-background-base64
Content-Type: application/json

{
  "image_data": "base64_encoded_image_string"
}
```

Returns JSON with base64 encoded PNG image:

```json
{
  "success": true,
  "image_data": "data:image/png;base64,..."
}
```

## Environment Variables

- `PORT`: Service port (default: 8000)
- `BIREFNET_MODEL`: HuggingFace model name (default: zhengpeng7/BiRefNet)
- `DEVICE`: Device to use - "cuda" or "cpu" (default: auto-detect)
- `USE_FP16`: Use FP16 precision on GPU (default: true)

## Running Locally

### Prerequisites

- Python 3.11+
- CUDA toolkit (for GPU support)

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run the Service

```bash
python app.py
```

The service will be available at `http://localhost:8000`

## Running with Docker

### Build the Image

```bash
docker build -t birefnet-service .
```

### Run the Container (CPU)

```bash
docker run -p 8000:8000 birefnet-service
```

### Run the Container (GPU)

```bash
docker run --gpus all -p 8000:8000 birefnet-service
```

## Performance

- **GPU (RTX 4090, FP16)**: ~17 FPS @ 1024x1024, 3.45GB VRAM
- **CPU**: Slower but still functional for production use

## Model Variants

You can use different BiRefNet model variants:

- `zhengpeng7/BiRefNet` - Standard general use model (default)
- `zhengpeng7/BiRefNet-matting` - Optimized for portrait matting
- `zhengpeng7/BiRefNet_HR` - High resolution (2048x2048)
- `zhengpeng7/BiRefNet_dynamic` - Dynamic resolution (256-2304)

Set via `BIREFNET_MODEL` environment variable.

## Testing

### Test with curl (file upload)

```bash
curl -X POST "http://localhost:8000/remove-background" \
  -F "file=@test_image.jpg" \
  --output result.png
```

### Test with curl (base64)

```bash
curl -X POST "http://localhost:8000/remove-background-base64" \
  -H "Content-Type: application/json" \
  -d '{"image_data": "base64_string_here"}'
```

## Integration

This service is designed to replace the removebg API in the AnythingAI backend. Update your `backgroundRemovalService.ts` to call this service instead of the external API.

## Notes

- First request may take longer as the model is loaded and cached
- GPU is highly recommended for production use
- The service automatically handles image resizing for optimal performance
- Supports all common image formats (JPEG, PNG, WebP, etc.)
