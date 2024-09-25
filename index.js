// Import required modules
const express = require("express");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const path = require("path");
const dotenv = require("dotenv");
const stream = require("stream");
// Load environment variables from .env file
dotenv.config();

// Initialize the express app
const app = express();

// AWS S3 Client Configuration using AWS SDK v3
const s3 = new S3Client({
  region: process.env.AWS_REGION, // Your S3 bucket region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Access key from .env
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Secret key from .env
  },
});

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store the files in memory temporarily
const upload = multer({
  storage: storage,
  // limits: { fileSize: 1024 * 1024 * 5 }, // Limit file size to 5MB
  // fileFilter: (req, file, cb) => {
  //   const fileTypes = /jpeg|jpg|png|gif/;
  //   const extname = fileTypes.test(
  //     path.extname(file.originalname).toLowerCase()
  //   );
  //   const mimetype = fileTypes.test(file.mimetype);
  //   if (mimetype && extname) {
  //     cb(null, true);
  //   } else {
  //     cb(new Error("Error: File upload only supports image formats!"));
  //   }
  // },
});

// Upload route using multer and AWS SDK v3

// Function to track upload progress
// const trackUploadProgress = (fileBuffer, totalSize, s3Params) => {
//   return new Promise((resolve, reject) => {
//     const passThrough = new stream.PassThrough();
//     let uploadedSize = 0;

//     // Track upload progress
//     passThrough.on("data", (chunk) => {
//       uploadedSize += chunk.length;
//       const percentage = ((uploadedSize / totalSize) * 100).toFixed(2);
//       console.log(`Uploaded: ${percentage}%`);
//     });

//     // Set up S3 upload with streaming
//     s3Params.Body = passThrough;
//     const command = new PutObjectCommand(s3Params);

//     // Start uploading to S3
//     s3.send(command).then(resolve).catch(reject);

//     // Push file buffer data into the pass-through stream
//     passThrough.end(fileBuffer);
//   });
// };

// app.post("/upload", upload.single("file"), async (req, res) => {
//   try {
//     const file = req.file;

//     if (!file) {
//       return res.status(400).send({ message: "Please upload a file" });
//     }

//     // Define S3 upload parameters
//     const uploadParams = {
//       Bucket: process.env.S3_BUCKET_NAME, // Your S3 bucket name
//       Key: `${Date.now().toString()}-${file.originalname}`, // File name with timestamp
//       Body: file.buffer, // File buffer from multer
//       ContentType: file.mimetype, // MIME type of the file
//     };

//     // Upload file to S3
//     // const command = new PutObjectCommand(uploadParams);
//     // await s3.send(command);

//     // Track and upload file with progress
//     await trackUploadProgress(file.buffer, file.size, uploadParams);

//     res.send({
//       message: "File uploaded successfully!",
//       fileName: uploadParams.Key,
//       bucketName: process.env.S3_BUCKET_NAME,
//     });
//   } catch (error) {
//     console.error("Error uploading file:", error);
//     res.status(500).send({ message: "File upload failed", error });
//   }
// });

// Upload route using @aws-sdk/lib-storage with progress tracking
app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send({ message: "Please upload a file" });
  }

  try {
    // Set up the upload parameters
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${Date.now().toString()}-${file.originalname}`, // Unique file name
      Body: file.buffer, // File buffer from multer
      ContentType: file.mimetype, // MIME type of the file
    };

    // Use Upload helper to manage the upload with progress tracking
    const parallelUploads3 = new Upload({
      client: s3,
      params: uploadParams,
      leavePartsOnError: false, // Automatically clean up multipart uploads on failure
    });

    // Progress tracking event
    parallelUploads3.on("httpUploadProgress", (progress) => {
      const percentage = ((progress.loaded / progress.total) * 100).toFixed(2);
      console.log(`Upload progress: ${percentage}%`);
    });

    // Start the upload and wait for it to complete
    await parallelUploads3.done();

    res.send({
      message: "File uploaded successfully!",
      fileName: uploadParams.Key,
      fileType: file.mimetype,
      bucketName: process.env.S3_BUCKET_NAME,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).send({ message: "Failed to upload file", error });
  }
});

app.get("/list", async (req, res) => {
  try {
    const listParams = {
      Bucket: process.env.S3_BUCKET_NAME,
    };

    const command = new ListObjectsV2Command(listParams);
    const data = await s3.send(command);

    res.send({
      message: "Files retrieved successfully",
      files: data.Contents, // List of files
    });
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).send({ message: "Failed to list files", error });
  }
});

app.get("/download/:fileName", async (req, res) => {
  const fileName = req.params.fileName;

  try {
    const downloadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
    };

    const command = new GetObjectCommand(downloadParams);
    const data = await s3.send(command);

    // Set headers and pipe the file stream
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    data.Body.pipe(res);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).send({ message: "Failed to download file", error });
  }
});

app.delete("/delete/:fileName", async (req, res) => {
  const fileName = req.params.fileName;

  try {
    const deleteParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileName,
    };

    const command = new DeleteObjectCommand(deleteParams);
    await s3.send(command);

    res.send({
      message: "File deleted successfully",
      fileName: fileName,
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).send({ message: "Failed to delete file", error });
  }
});

// --------------------------------------------------

// Route to fetch all files with proper file URL and other metadata
const getFileUrl = (bucketName, key) => {
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

app.get("/list1", async (req, res) => {
  try {
    const listParams = {
      Bucket: process.env.S3_BUCKET_NAME,
    };

    const command = new ListObjectsV2Command(listParams);
    const data = await s3.send(command);

    if (data.Contents && data.Contents.length > 0) {
      const files = data.Contents.map((file) => ({
        fileName: file.Key, // S3 file key (name)
        url: getFileUrl(process.env.S3_BUCKET_NAME, file.Key), // Proper file URL
        size: file.Size, // File size in bytes
        lastModified: file.LastModified, // Last modified date
      }));

      res.send({
        message: "Files retrieved successfully!",
        files: files,
      });
    } else {
      res.send({
        message: "No files found in the bucket.",
      });
    }
  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).send({ message: "Failed to list files", error });
  }
});

// Start the Express server
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
