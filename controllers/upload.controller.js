const responseHandler = require('../utils/response.handler');

class UploadController {
    
    async uploadFiles(req, res) {
        try {
            if (!req.files || Object.keys(req.files).length === 0) {
                return responseHandler.error(res, 'No files were uploaded', 400);
            }

            const uploadedFiles = {};

            // Process all uploaded files regardless of field names
            Object.keys(req.files).forEach(fieldName => {
                const files = req.files[fieldName];
                
                if (!files) {
                    console.warn(`No files found for field: ${fieldName}`);
                    return;
                }

                try {
                    if (Array.isArray(files)) {
                        uploadedFiles[fieldName] = files.map(file => this.formatFileInfo(file));
                    } else {
                        uploadedFiles[fieldName] = [this.formatFileInfo(files)];
                    }
                } catch (formatError) {
                    console.error(`Error formatting file info for field ${fieldName}:`, formatError);
                    throw formatError;
                }
            });

            return responseHandler.success(res, { files: uploadedFiles }, 'Files uploaded successfully');
        } catch (error) {
            console.error('Upload files error:', error);
            return responseHandler.error(res, 'Failed to upload files', 500, error);
        }
    }

    formatFileInfo(file) {
        if (!file) {
            throw new Error('File object is required');
        }

        // Generate proper URL path
        const relativePath = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
        const url = relativePath.startsWith('/') ? relativePath : '/' + relativePath;

        return {
            filename: file.filename,
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            // path: file.path,
            url: url
        };
    }
}

module.exports = UploadController;