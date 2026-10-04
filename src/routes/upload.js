const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../../uploads/packages");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `pkg-${uniqueSuffix}${ext}`);
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif|avif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, PNG, WEBP, GIF, AVIF) are allowed!"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: fileFilter,
});

// Upload multiple files
router.post("/multiple", upload.array("images", 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const host = req.get("host");
    const protocol = req.protocol;
    const fileUrls = req.files.map((file, idx) => ({
      image_url: `${protocol}://${host}/uploads/packages/${file.filename}`,
      sort_order: idx,
      is_cover: idx === 0,
      caption: file.originalname,
    }));

    return res.status(200).json({
      success: true,
      message: "Uploaded successfully",
      files: fileUrls,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ message: "File upload failed", error: error.message });
  }
});

// Upload single file
router.post("/single", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const host = req.get("host");
    const protocol = req.protocol;
    const url = `${protocol}://${host}/uploads/packages/${req.file.filename}`;

    return res.status(200).json({
      success: true,
      message: "Uploaded successfully",
      url: url,
    });
  } catch (error) {
    console.error("Upload single error:", error);
    return res.status(500).json({ message: "File upload failed", error: error.message });
  }
});

module.exports = router;
