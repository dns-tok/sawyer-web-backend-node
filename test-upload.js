const UploadController = require('./controllers/upload.controller');

// Test the formatFileInfo method
const uploadController = new UploadController();

// Mock file object (similar to what multer provides)
const mockFile = {
    filename: 'test_1724855260123-987654321.jpg',
    originalname: 'test-image.jpg',
    mimetype: 'image/jpeg',
    size: 1024567,
    path: '/Users/delimp/Desktop/frontend/swayer_poc/production/swayer_backend/uploads/files/test_1724855260123-987654321.jpg'
};

try {
    const result = uploadController.formatFileInfo(mockFile);
    console.log('✅ formatFileInfo test passed:');
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error('❌ formatFileInfo test failed:', error.message);
}

// Test with null file
try {
    const result = uploadController.formatFileInfo(null);
    console.log('❌ Null file test should have failed');
} catch (error) {
    console.log('✅ Null file test passed - correctly threw error:', error.message);
}
