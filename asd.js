// Import required modules
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const stream = require('stream');
dotenv.config();

const app = express();

// AWS S3 Client Configuration
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Use multer to handle file uploads
const upload = multer({
    storage: multer.memoryStorage(),  // Use memory storage to avoid saving files locally
});

// Function to track upload progress
const trackUploadProgress = (fileBuffer, totalSize, s3Params) => {
    return new Promise((resolve, reject) => {
        const passThrough = new stream.PassThrough();
        let uploadedSize = 0;

        // Track upload progress
        passThrough.on('data', (chunk) => {
            uploadedSize += chunk.length;
            const percentage = ((uploadedSize / totalSize) * 100).toFixed(2);
            console.log(`Uploaded: ${percentage}%`);
        });

        // Set up S3 upload with streaming
        s3Params.Body = passThrough;
        const command = new PutObjectCommand(s3Params);

        // Start uploading to S3
        s3.send(command)
            .then(resolve)
            .catch(reject);

        // Push file buffer data into the pass-through stream
        passThrough.end(fileBuffer);
    });
};

// Upload route with upload percentage
app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).send({ message: 'Please upload a file' });
    }

    try {
        // Create S3 upload parameters
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: `${Date.now().toString()}-${file.originalname}`,  // Unique file name
            ContentType: file.mimetype,  // File MIME type
        };

        // Track and upload file with progress
        await trackUploadProgress(file.buffer, file.size, uploadParams);

        res.send({
            message: 'File uploaded successfully!',
            fileName: uploadParams.Key,
            fileType: file.mimetype,
            bucketName: process.env.S3_BUCKET_NAME
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send({ message: 'Failed to upload file', error });
    }
});

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
