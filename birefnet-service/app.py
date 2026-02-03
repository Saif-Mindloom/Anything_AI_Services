"""
BiRefNet Background Removal Service
A FastAPI service that provides background removal using BiRefNet model
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from transformers import AutoModelForImageSegmentation
from PIL import Image
import numpy as np
import io
import base64
import logging
from typing import Optional
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="BiRefNet Background Removal Service",
    description="High-quality background removal using BiRefNet",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variable
model = None
device = None

# Model configuration
MODEL_NAME = os.getenv("BIREFNET_MODEL", "zhengpeng7/BiRefNet")
DEVICE = os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
USE_FP16 = os.getenv("USE_FP16", "true").lower() == "true"


# Request/Response models
class Base64ImageRequest(BaseModel):
    image_data: str


class Base64ImageResponse(BaseModel):
    success: bool
    image_data: str


def load_model():
    """Load the BiRefNet model"""
    global model, device
    
    logger.info(f"Loading BiRefNet model: {MODEL_NAME}")
    logger.info(f"Device: {DEVICE}")
    logger.info(f"FP16: {USE_FP16}")
    
    try:
        device = torch.device(DEVICE)
        
        # Load model from HuggingFace
        model = AutoModelForImageSegmentation.from_pretrained(
            MODEL_NAME,
            trust_remote_code=True
        )
        
        model.to(device)
        
        # Use FP16 for better performance if on GPU
        if USE_FP16 and device.type == "cuda":
            model = model.half()
            logger.info("Using FP16 precision")
        
        model.eval()
        logger.info("Model loaded successfully!")
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise


@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    load_model()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": str(device),
        "model_name": MODEL_NAME
    }


def process_image(image: Image.Image) -> Image.Image:
    """
    Process image to remove background using BiRefNet
    
    Args:
        image: Input PIL Image
        
    Returns:
        PIL Image with transparent background
    """
    try:
        # Convert to RGB if necessary
        if image.mode != "RGB":
            image = image.convert("RGB")
        
        # Store original size
        original_size = image.size
        
        # Prepare image for model (resize if too large)
        max_size = 1024
        if max(image.size) > max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        
        # BiRefNet requires dimensions to be divisible by 32
        # Pad image to ensure dimensions are multiples of 32
        width, height = image.size
        new_width = ((width + 31) // 32) * 32
        new_height = ((height + 31) // 32) * 32
        
        # Create padded image if needed
        if width != new_width or height != new_height:
            padded_image = Image.new("RGB", (new_width, new_height), (0, 0, 0))
            # Center the original image in the padded canvas
            offset_x = (new_width - width) // 2
            offset_y = (new_height - height) // 2
            padded_image.paste(image, (offset_x, offset_y))
            model_input_size = (new_width, new_height)
            model_input_image = padded_imageʼ
        else:
            model_input_size = (width, height)
            model_input_image = image
            offset_x = 0
            offset_y = 0
        
        # Convert to tensor
        from torchvision import transforms
        
        transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        input_tensor = transform(model_input_image).unsqueeze(0).to(device)
        
        if USE_FP16 and device.type == "cuda":
            input_tensor = input_tensor.half()
        
        # Run inference
        with torch.no_grad():
            output = model(input_tensor)[-1]  # Get the final output
            
        # Process output
        pred = torch.sigmoid(output[0, 0]).cpu().numpy()
        
        # Convert to PIL mask
        mask_full = Image.fromarray((pred * 255).astype(np.uint8))
        
        # Crop mask to original image size (remove padding)
        if offset_x > 0 or offset_y > 0:
            mask = mask_full.crop((offset_x, offset_y, offset_x + width, offset_y + height))
        else:
            mask = mask_full
        
        # Resize back to original size if it was resized
        if image.size != original_size:
            image = image.resize(original_size, Image.Resampling.LANCZOS)
            mask = mask.resize(original_size, Image.Resampling.LANCZOS)
        
        # Create RGBA image with transparent background
        image_rgba = image.convert("RGBA")
        
        # Apply mask to alpha channel
        image_rgba.putalpha(mask)
        
        return image_rgba
        
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)):
    """
    Remove background from uploaded image
    
    Args:
        file: Uploaded image file
        
    Returns:
        PNG image with transparent background
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Read uploaded file
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Process image
        result_image = process_image(image)
        
        # Convert to bytes
        output_buffer = io.BytesIO()
        result_image.save(output_buffer, format="PNG")
        output_buffer.seek(0)
        
        return Response(
            content=output_buffer.getvalue(),
            media_type="image/png"
        )
        
    except Exception as e:
        logger.error(f"Error in remove_background endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/remove-background-base64", response_model=Base64ImageResponse)
async def remove_background_base64(request: Base64ImageRequest):
    """
    Remove background from base64 encoded image
    
    Request body should be JSON:
    {
        "image_data": "base64_string_here"
    }
    
    Returns:
        JSON with base64 encoded PNG image with transparent background
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Remove data URL prefix if present
        image_data = request.image_data
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        
        # Decode base64
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Process image
        result_image = process_image(image)
        
        # Convert to base64
        output_buffer = io.BytesIO()
        result_image.save(output_buffer, format="PNG")
        output_buffer.seek(0)
        
        result_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
        
        return Base64ImageResponse(
            success=True,
            image_data=f"data:image/png;base64,{result_base64}"
        )
        
    except Exception as e:
        logger.error(f"Error in remove_background_base64 endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
