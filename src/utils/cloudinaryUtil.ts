import { v2 as cloudinary } from "cloudinary";
// const cloudinary = require('../);

cloudinary.config({
  cloud_name: 'dkfpmc3gk',
  api_key: '291255341558451',
  api_secret: 'tGSuurCBAN7UmKL26aRjQqsX1hA'
});


// export async function uploadImage(imagePath: string): Promise<string> {
//   if (!imagePath || typeof imagePath !== 'string' || imagePath.trim() === "") {
//     return "";
//   }

//   // Check if image is already hosted on Cloudinary
//   const cloudinaryBase = 'https://res.cloudinary.com/';
//   if (imagePath.startsWith(cloudinaryBase)) {
//     return imagePath;
//   }

//   try {
//     // Upload image (base64 or local path or URL) to Cloudinary
//     const result = await cloudinary.uploader.upload(imagePath);
//     return result.secure_url;
//   } catch (error: any) {
//     console.error("Cloudinary upload error:", error.message || error.toString());
//     return "";
//   }
// }



export async function uploadImage(imagePath: string): Promise<string> {
  if (!imagePath || typeof imagePath !== 'string' || imagePath.trim() === "") {
    return "";
  }

  // Skip if already hosted on Cloudinary
  const cloudinaryBase = 'https://res.cloudinary.com/';
  if (imagePath.startsWith(cloudinaryBase)) {
    return imagePath;
  }

  try {
    // Upload with smart optimization
    const result = await cloudinary.uploader.upload(imagePath, {
      folder: 'whatsapp_style',
      transformation: [
        { quality: 'auto:good' },   // keep quality high but optimized
        { fetch_format: 'auto' }    // serve WebP/AVIF
      ],
      resource_type: 'image'
    });
    return result.secure_url;
  } catch (error: any) {
    console.error("Cloudinary upload error:", error.message || error.toString());
    return "";
  }
}
