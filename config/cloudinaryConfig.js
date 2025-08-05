const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

console.log("--- Loading Cloudinary Config ---");
console.log(
  "Cloud Name:",
  process.env.CLOUDINARY_CLOUD_NAME ? "OK" : "!!! MISSING !!!"
);
console.log(
  "API Key:",
  process.env.CLOUDINARY_API_KEY ? "OK" : "!!! MISSING !!!"
);
console.log(
  "API Secret:",
  process.env.CLOUDINARY_API_SECRET ? "OK" : "!!! MISSING !!!"
);


if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.error(
    "!!! FATAL ERROR: Cloudinary environment variables are not set. !!!"
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "sit-dress-shop/profile-pictures",
    allowed_formats: ["jpg", "png", "jpeg"],
    transformation: [
      { width: 200, height: 200, gravity: "face", crop: "fill" },
    ],
  },
});

const upload = multer({ storage: storage });
module.exports = upload;
